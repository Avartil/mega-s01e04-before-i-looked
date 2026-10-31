import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    && isDate(value.slice(0, 10))
    && Number.isFinite(Date.parse(value));
}

function isRunEvent(value: unknown): value is RunEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return 'at' in value && isTimestamp(value.at)
    && 'job' in value && typeof value.job === 'string' && value.job.trim().length > 0
    && 'status' in value && (value.status === 'ok' || value.status === 'retry' || value.status === 'fail')
    && 'owner' in value && (value.owner === null || typeof value.owner === 'string')
    && (!('error' in value) || typeof value.error === 'string');
}

export const readNight: ReadNight = (runsDir, night) => {
  // Validate before constructing a path: route parameters never escape runsDir.
  if (!isDate(night)) return null;

  let source: string;
  try {
    source = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const digest: NightDigest = { night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const events: RunEvent[] = [];
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      digest.badLines++;
      continue;
    }
    if (!isRunEvent(value)) {
      digest.badLines++;
      continue;
    }
    events.push(value);
  }

  // Stable sort retains file order for equal instants, including differing offsets.
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const rows = new Map<string, DigestRow>();
  for (const event of events) {
    digest.counts[event.status]++;
    const row = rows.get(event.job) ?? {
      job: event.job,
      owner: event.owner,
      runs: 0,
      retries: 0,
      lastStatus: event.status,
      lastError: null,
      firstAt: event.at,
      lastAt: event.at,
      hasFailure: false,
    };
    row.owner = event.owner;
    row.runs++;
    row.retries += event.status === 'retry' ? 1 : 0;
    row.lastStatus = event.status;
    if (event.error !== undefined) row.lastError = event.error;
    row.lastAt = event.at;
    row.hasFailure ||= event.status === 'fail';
    rows.set(event.job, row);
  }
  digest.rows = [...rows.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return digest;
};
