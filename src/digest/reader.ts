import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunCounts, RunStatus } from './types.js';

interface RunRecord {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string | null;
}

function isRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'at' in value && typeof value.at === 'string' && value.at.trim() !== '' &&
    'job' in value && typeof value.job === 'string' && value.job.trim() !== '' &&
    'status' in value && (value.status === 'ok' || value.status === 'retry' || value.status === 'fail') &&
    'owner' in value && (value.owner === null || typeof value.owner === 'string') &&
    (!('error' in value) || value.error === null || typeof value.error === 'string')
  );
}

function isNight(night: string): boolean {
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) return false;
  const date = new Date(`${night}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === night;
}

export const readNight: ReadNight = async (runsDir, night) => {
  if (!isNight(night)) return { kind: 'invalid', night };

  let contents: string;
  try {
    contents = await readFile(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { kind: 'missing', night };
    }
    throw error;
  }

  const byJob = new Map<string, DigestRow>();
  const counts: RunCounts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const line of contents.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      badLines += 1;
      continue;
    }
    if (!isRecord(record)) {
      badLines += 1;
      continue;
    }

    counts[record.status] += 1;
    let row = byJob.get(record.job);
    if (!row) {
      row = {
        job: record.job,
        owner: record.owner,
        runs: 0,
        retries: 0,
        failures: 0,
        lastStatus: record.status,
        lastError: null,
        firstAt: record.at,
        lastAt: record.at,
      };
      byJob.set(record.job, row);
    }
    row.runs += 1;
    row.retries += record.status === 'retry' ? 1 : 0;
    row.failures += record.status === 'fail' ? 1 : 0;
    row.owner = record.owner;
    row.lastStatus = record.status;
    row.lastAt = record.at;
    if (record.error !== undefined && record.error !== null && record.error.trim() !== '') {
      row.lastError = record.error;
    }
  }

  const rows = [...byJob.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return { kind: 'found', night, rows, badLines, counts };
};
