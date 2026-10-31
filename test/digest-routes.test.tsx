import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function makeRunsDir() {
  const runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-'));
  directories.push(runsDir);
  return runsDir;
}

function appFor(runsDir: string) {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

describe('digest routes', () => {
  it('serves the same sorted digest as HTML and JSON, preserving missing values and event details', async () => {
    const runsDir = await makeRunsDir();
    const night = '2026-10-30';
    await writeFile(
      join(runsDir, `${night}.jsonl`),
      [
        JSON.stringify({ at: '2026-10-30T08:00:00+01:00', job: 'zeta', status: 'retry', owner: 'ops' }),
        JSON.stringify({ at: '2026-10-30T08:05:00+01:00', job: 'zeta', status: 'retry', owner: 'ops' }),
        JSON.stringify({ at: '2026-10-30T08:07:00+01:00', job: 'zeta', status: 'retry', owner: 'ops' }),
        JSON.stringify({ at: '2026-10-30T08:10:00+01:00', job: 'zeta', status: 'fail', owner: 'ops', error: 'disk full' }),
        JSON.stringify({ at: '2026-10-30T08:15:00+01:00', job: 'zeta', status: 'ok', owner: null }),
        JSON.stringify({ at: '2026-10-30T09:00:00-04:00', job: 'alpha', status: 'ok', owner: '<img src=x>' }),
      ].join('\n'),
    );

    const app = appFor(runsDir);
    const jsonResponse = await app.request(`/api/digest/${night}`);
    const htmlResponse = await app.request(`/digest/${night}`);
    const digest = (await jsonResponse.json()) as NightDigest;
    const html = await htmlResponse.text();

    expect(jsonResponse.status).toBe(200);
    expect(htmlResponse.status).toBe(200);
    expect(digest.night).toBe(night);
    expect(digest.rows.map((row) => row.job)).toEqual(['alpha', 'zeta']);
    expect(digest.rows[1]).toMatchObject({
      owner: null,
      runs: 5,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'disk full',
      firstAt: '2026-10-30T08:00:00+01:00',
      lastAt: '2026-10-30T08:15:00+01:00',
      hasFailure: true,
    });
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('—');
    expect(html).toContain('disk full');
    expect(html).toContain('failed at least once');
    expect(html).toContain('3 or more');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('2026-10-30T09:00:00-04:00');
    expect(html).toContain('2026-10-30T08:15:00+01:00');
  });

  it('returns 404 for a night without a file', async () => {
    const app = appFor(await makeRunsDir());

    const html = await app.request('/digest/2026-10-30');
    const json = await app.request('/api/digest/2026-10-30');

    expect(html.status).toBe(404);
    expect(json.status).toBe(404);
    expect(await json.json()).toEqual({ error: 'night not found' });
  });

  it('returns an empty digest and explains that nothing ran for an empty night', async () => {
    const runsDir = await makeRunsDir();
    const night = '2026-10-30';
    await writeFile(join(runsDir, `${night}.jsonl`), '');
    const app = appFor(runsDir);

    const json = await app.request(`/api/digest/${night}`);
    const html = await app.request(`/digest/${night}`);

    expect(json.status).toBe(200);
    expect(await json.json()).toMatchObject({ night, rows: [], badLines: 0 });
    expect(html.status).toBe(200);
    expect(await html.text()).toContain('nothing ran');
  });

  it('counts malformed lines while keeping valid rows on both routes', async () => {
    const runsDir = await makeRunsDir();
    const night = '2026-10-30';
    await writeFile(
      join(runsDir, `${night}.jsonl`),
      `${JSON.stringify({ at: '2026-10-30T08:00:00+01:00', job: 'survivor', status: 'ok', owner: 'ops' })}\n{not json}\n`,
    );
    const app = appFor(runsDir);

    const json = await app.request(`/api/digest/${night}`);
    const html = await app.request(`/digest/${night}`);
    const digest = (await json.json()) as NightDigest;

    expect(json.status).toBe(200);
    expect(digest.badLines).toBe(1);
    expect(digest.rows.map((row) => row.job)).toEqual(['survivor']);
    expect(html.status).toBe(200);
    expect(await html.text()).toContain('1 malformed line');
  });
});
