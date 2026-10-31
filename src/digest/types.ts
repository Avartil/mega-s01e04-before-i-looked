export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  // Owner on the chronologically last event, including an explicit null.
  owner: string | null;
  // Every valid event is one run; retries are events whose status is retry.
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  // Most recent supplied error, retained after recovery; null if none was logged.
  lastError: string | null;
  // Earliest/latest instants, preserving the log's original timestamp strings.
  firstAt: string;
  lastAt: string;
  // True if ANY event failed, even when lastStatus is now ok.
  hasFailure: boolean;
};

export type NightDigest = {
  night: string;
  // Ascending job name, using deterministic string comparison (not locale order).
  rows: DigestRow[];
  // Nonblank lines containing malformed JSON or invalid event fields.
  badLines: number;
  // Counts of valid EVENTS, not the final status of each job.
  counts: Record<RunStatus, number>;
};

// Implemented/exported by reader.ts. Missing files and invalid YYYY-MM-DD names
// return null. Empty files return a digest with empty rows and zero counts.
// Other I/O errors propagate. Chronological ties use later file order as last.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
