import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const temporaryDirs: string[] = [];

function withLog(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  temporaryDirs.push(dir);
  writeFileSync(join(dir, `${night}.jsonl`), source);
  return dir;
}

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads the immutable supplied night with five jobs and one bad line', () => {
    const fixture = new URL('../runs/2026-10-28.jsonl', import.meta.url);
    const before = readFileSync(fixture, 'utf8');
    const digest = readNight(fileURLToPath(new URL('../runs/', import.meta.url)), night);
    expect(digest?.badLines).toBe(1);
    expect(digest?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows.find((row) => row.job === 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
      lastStatus: 'ok', lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
      hasFailure: false,
    });
    expect(digest?.rows.find((row) => row.job === 'digest/render')?.owner).toBeNull();
    expect(digest?.rows.find((row) => row.job === 'notes/backup')?.hasFailure).toBe(true);
    expect(readFileSync(fixture, 'utf8')).toBe(before);
  });

  it('distinguishes missing, empty and whitespace-only files', () => {
    const dir = withLog('');
    expect(readNight(dir, '2026-10-27')).toBeNull();
    const empty = { night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
    expect(readNight(dir, night)).toEqual(empty);
    expect(readNight(withLog(' \r\n\t\n'), night)).toEqual(empty);
  });

  it('counts malformed JSON and invalid schemas while retaining valid rows', () => {
    const event = { at: '2026-10-29T01:00:00+01:00', job: 'job', status: 'ok', owner: null };
    const invalid: unknown[] = [
      null, [], 42, {}, { ...event, at: 'yesterday' }, { ...event, at: '2026-02-30T01:00:00Z' },
      { ...event, at: '2026-10-29T01:00:00' }, { ...event, job: ' ' },
      { ...event, status: 'unknown' }, { ...event, owner: 42 }, { ...event, owner: undefined },
      { ...event, error: 7 },
    ];
    const source = ['{broken', ...invalid.map((value) => JSON.stringify(value)), JSON.stringify(event), ''].join('\r\n');
    const digest = readNight(withLog(source), night);
    expect(digest?.badLines).toBe(invalid.length + 1);
    expect(digest?.rows).toHaveLength(1);
    expect(digest?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it('uses chronological instants, preserves offsets and remembers failures after recovery', () => {
    const events = [
      { at: '2026-10-29T01:10:00+01:00', job: 'job', status: 'ok', owner: null },
      { at: '2026-10-29T02:05:00+02:00', job: 'job', status: 'retry', owner: 'old', error: 'latest error' },
      { at: '2026-10-29T01:00:00+01:00', job: 'job', status: 'fail', owner: 'old', error: 'first error' },
    ];
    expect(readNight(withLog(events.map((event) => JSON.stringify(event)).join('\n')), night)?.rows).toEqual([{
      job: 'job', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'latest error',
      firstAt: '2026-10-29T01:00:00+01:00', lastAt: '2026-10-29T01:10:00+01:00', hasFailure: true,
    }]);
  });

  it('uses file order for ties and does not mistake special property names for existing jobs', () => {
    const events = [
      { at: '2026-10-29T01:00:00+01:00', job: '__proto__', status: 'fail', owner: 'old', error: 'failure' },
      { at: '2026-10-29T00:00:00Z', job: '__proto__', status: 'ok', owner: 'new' },
    ];
    const row = readNight(withLog(events.map((event) => JSON.stringify(event)).join('\n')), night)?.rows[0];
    expect(row).toMatchObject({ owner: 'new', runs: 2, lastStatus: 'ok', lastError: 'failure', hasFailure: true });
    expect(row?.firstAt).toBe(events[0].at);
    expect(row?.lastAt).toBe(events[1].at);
  });

  it('rejects invalid nights before opening paths and propagates other I/O failures', () => {
    const dir = withLog('');
    for (const invalid of ['../2026-10-28', '..\\2026-10-28', '2026-02-30', '2026-1-01', '2026-10-28.jsonl']) {
      expect(readNight(dir, invalid)).toBeNull();
    }
    mkdirSync(join(dir, '2026-10-27.jsonl'));
    expect(() => readNight(dir, '2026-10-27')).toThrow();
  });
});
