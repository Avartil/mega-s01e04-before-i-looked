import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const tempDirs: string[] = [];

function makeRunsDir() {
  const dir = mkdtempSync(join(tmpdir(), 'rig-board-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('status board digest links', () => {
  it('links every night and shows counts of valid events by status', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(join(runsDir, '2026-10-27.jsonl'), [
      '{"at":"2026-10-27T00:00:00+01:00","job":"a","status":"ok","owner":"rook"}',
      '{"at":"2026-10-27T00:01:00+01:00","job":"a","status":"retry","owner":"rook"}',
      '{"at":"2026-10-27T00:02:00+01:00","job":"a","status":"fail","owner":"rook"}',
      '{ bad json',
    ].join('\n'));
    writeFileSync(join(runsDir, '2026-10-28.jsonl'),
      '{"at":"2026-10-28T00:00:00+01:00","job":"b","status":"ok","owner":null}\n');
    const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };

    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('1 ok · 0 retry · 0 fail');
    expect(html).toContain('1 ok · 1 retry · 1 fail');
  });
});
