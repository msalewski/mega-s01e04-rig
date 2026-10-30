import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const temporaryDirs: string[] = [];

async function nightFile(contents: string, night = '2026-10-28'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rig-digest-'));
  temporaryDirs.push(dir);
  await writeFile(join(dir, `${night}.jsonl`), contents);
  return dir;
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('readNight', () => {
  it('aggregates the real fixture into five sorted jobs and counts the truncated line', async () => {
    const result = await readNight('runs', '2026-10-28');
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') throw new Error('Fixture was not found');
    expect(result.badLines).toBe(1);
    expect(result.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(result.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(result.rows[0]).toMatchObject({ owner: null, runs: 1, lastError: null });
    expect(result.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, failures: 0,
      lastStatus: 'ok', lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(result.rows[2]).toMatchObject({ runs: 8, retries: 1, lastError: 'lock held' });
    expect(result.rows[3]).toMatchObject({ failures: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(result.rows.reduce((total, row) => total + row.runs, 0)).toBe(15);
  });

  it('distinguishes an empty file, a missing file and invalid input', async () => {
    const dir = await nightFile('');
    expect(await readNight(dir, '2026-10-28')).toEqual({
      kind: 'found', night: '2026-10-28', rows: [], badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
    expect(await readNight(dir, '2026-10-29')).toEqual({ kind: 'missing', night: '2026-10-29' });
    expect(await readNight(dir, '../2026-10-28')).toEqual({ kind: 'invalid', night: '../2026-10-28' });
  });

  it.each([
    '../2026-10-28', '..\\2026-10-28', '/2026-10-28', '2026-10-28/anything',
    '2026-10-28\n', '2026-1-28', '2026-02-29', '2026-02-30', '2026-13-01', '2026-00-01',
  ])('rejects unsafe or nonexistent calendar night %j', async night => {
    expect(await readNight('runs', night)).toEqual({ kind: 'invalid', night });
  });

  it('accepts leap day', async () => {
    const dir = await nightFile('', '2024-02-29');
    expect((await readNight(dir, '2024-02-29')).kind).toBe('found');
  });

  it('counts invalid records without losing valid records after them and ignores blank lines', async () => {
    const valid = { at: '2026-10-28T23:00:00-04:00', job: '__proto__', status: 'ok', owner: null };
    const badRecords = [null, [], {}, { ...valid, status: 'unknown' }, { ...valid, status: ['ok'] }, { ...valid, owner: 3 },
      { ...valid, at: null }, { ...valid, job: '' }, { ...valid, error: {} }];
    const dir = await nightFile([
      JSON.stringify(valid), '', '   ', '{truncated',
      ...badRecords.map(record => JSON.stringify(record)), JSON.stringify(valid), '',
    ].join('\r\n'));
    const result = await readNight(dir, '2026-10-28');
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') throw new Error('Test file was not found');
    expect(result.badLines).toBe(badRecords.length + 1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ job: '__proto__', runs: 2, owner: null });
    expect(result.counts).toEqual({ ok: 2, retry: 0, fail: 0 });
  });

  it('retains the latest meaningful error, failures and original times through recovery', async () => {
    const base = { job: 'a/job', owner: 'first-owner' };
    const records = [
      { ...base, at: '2026-10-28T23:00:00+05:30', status: 'retry', error: 'first error' },
      { ...base, at: '2026-10-28T19:00:00-04:00', status: 'fail', error: ' latest error ' },
      { ...base, at: '2026-10-28T18:00:00-04:00', status: 'ok', error: '' },
      { ...base, at: '2026-10-28T17:00:00-04:00', status: 'ok', error: null },
      { ...base, at: '2026-10-28T16:00:00-04:00', status: 'ok', owner: null },
    ];
    const dir = await nightFile(records.map(record => JSON.stringify(record)).join('\n'));
    const result = await readNight(dir, '2026-10-28');
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') throw new Error('Test file was not found');
    expect(result.rows[0]).toEqual({
      job: 'a/job', owner: null, runs: 5, retries: 1, failures: 1,
      lastStatus: 'ok', lastError: ' latest error ',
      firstAt: records[0].at, lastAt: records[4].at,
    });
  });

  it('does not disguise other filesystem errors as a missing night', async () => {
    const dir = await nightFile('');
    await mkdir(join(dir, '2026-10-29.jsonl'));
    await expect(readNight(dir, '2026-10-29')).rejects.toMatchObject({ code: 'EISDIR' });
  });
});
