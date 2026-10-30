export type RunStatus = 'ok' | 'retry' | 'fail'

export interface DigestRow {
  job: string
  /** Owner on the last valid record, including an explicitly unknown owner. */
  owner: string | null
  /** Every valid record for the job counts as a run. */
  runs: number
  retries: number
  failures: number
  lastStatus: RunStatus
  /** Most recent nonempty error; a later successful record does not erase it. */
  lastError: string | null
  /** First/last record in file order, with the original timestamp and offset. */
  firstAt: string
  lastAt: string
}

/** Counts of valid log records, not counts of jobs' final statuses. */
export interface RunCounts {
  ok: number
  retry: number
  fail: number
}

export type ReadNightResult =
  | {
      kind: 'found'
      night: string
      /** Sorted ascending by job using deterministic code-point comparison. */
      rows: DigestRow[]
      /** Invalid JSON or invalid record shape; blank lines are ignored. */
      badLines: number
      counts: RunCounts
    }
  | { kind: 'missing' | 'invalid'; night: string }

/**
 * readNight(runsDir, night) is exported at runtime from './reader'.
 * Accepts only real calendar dates in YYYY-MM-DD form. Missing files and invalid
 * nights have distinct results; other filesystem errors reject the promise.
 */
export type ReadNight = (runsDir: string, night: string) => Promise<ReadNightResult>
