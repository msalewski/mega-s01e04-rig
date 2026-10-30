import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
};

let runsDir: string;

async function makeRunsDir() {
  runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
  return runsDir;
}

async function writeNight(night: string, contents: string) {
  await writeFile(join(runsDir, `${night}.jsonl`), contents, 'utf8');
}

afterEach(async () => {
  if (runsDir) await rm(runsDir, { recursive: true, force: true });
});

describe('digest routes', () => {
  it('serves matching sorted rows in the page and JSON, with warning and display details', async () => {
    await makeRunsDir();
    const night = '2026-10-30';
    const records = [
      { at: '2026-10-30T01:02:03+05:30', job: 'zeta', status: 'fail', owner: null, error: 'problem <script>alert(1)</script>' },
      { at: '2026-10-30T02:00:00+05:30', job: 'alpha', status: 'retry', owner: 'A & B' },
      { at: '2026-10-30T02:01:00+05:30', job: 'alpha', status: 'retry', owner: 'A & B' },
      { at: '2026-10-30T02:02:00+05:30', job: 'alpha', status: 'retry', owner: 'A & B' },
      { at: '2026-10-30T02:03:00+03:00', job: 'alpha', status: 'ok', owner: 'A & B' },
      { at: '2026-10-30T03:02:03+05:30', job: 'zeta', status: 'ok', owner: null },
    ];
    await writeNight(night, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);

    const app = createApp({ ...config, runsDir });
    const [pageResponse, apiResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await pageResponse.text();
    const payload = await apiResponse.json();

    expect(pageResponse.status).toBe(200);
    expect(apiResponse.status).toBe(200);
    expect(payload).toMatchObject({
      night,
      badLines: 0,
      counts: { ok: 2, retry: 3, fail: 1 },
    });
    expect(payload.rows.map((row: { job: string }) => row.job)).toEqual(['alpha', 'zeta']);
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));

    // Three retries remain a warning even though alpha eventually succeeded. A prior fail
    // remains a warning even though zeta's last status is ok.
    expect(html.match(/<tr class="warn">/g)).toHaveLength(2);
    expect(html).toContain('A &amp; B');
    expect(html).toContain('\u2014');
    expect(html).toContain('problem &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toMatch(/<script\b/i);
    expect(html).toContain('2026-10-30T02:00:00+05:30');
    expect(html).toContain('2026-10-30T02:03:00+03:00');
    expect(html).toContain('2026-10-30T01:02:03+05:30');
    expect(html).toContain('2026-10-30T03:02:03+05:30');
  });

  it('returns 404 for a missing night on both routes', async () => {
    await makeRunsDir();
    const app = createApp({ ...config, runsDir });

    const [pageResponse, apiResponse] = await Promise.all([
      app.request('/digest/2026-10-30'),
      app.request('/api/digest/2026-10-30'),
    ]);

    expect(pageResponse.status).toBe(404);
    expect(apiResponse.status).toBe(404);
    expect(await apiResponse.json()).toEqual({ night: '2026-10-30', error: 'missing' });
  });

  it('returns 404 for an invalid night on both routes', async () => {
    await makeRunsDir();
    const app = createApp({ ...config, runsDir });

    const [pageResponse, apiResponse] = await Promise.all([
      app.request('/digest/2026-02-30'),
      app.request('/api/digest/2026-02-30'),
    ]);

    expect(pageResponse.status).toBe(404);
    expect(apiResponse.status).toBe(404);
    expect(await apiResponse.json()).toEqual({ night: '2026-02-30', error: 'invalid' });
  });

  it('renders and returns an empty night', async () => {
    await makeRunsDir();
    const night = '2026-10-30';
    await writeNight(night, '');
    const app = createApp({ ...config, runsDir });

    const [pageResponse, apiResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await pageResponse.text();

    expect(pageResponse.status).toBe(200);
    expect(apiResponse.status).toBe(200);
    expect(html.toLowerCase()).toContain('nothing ran this night.');
    expect(await apiResponse.json()).toEqual({
      night,
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('reports malformed lines in both representations and keeps valid records', async () => {
    await makeRunsDir();
    const night = '2026-10-30';
    await writeNight(night, `${JSON.stringify({
      at: '2026-10-30T04:05:06-04:00',
      job: 'kept-job',
      status: 'ok',
      owner: null,
    })}\nnot valid json\n`);
    const app = createApp({ ...config, runsDir });

    const [pageResponse, apiResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await pageResponse.text();
    const payload = await apiResponse.json();

    expect(pageResponse.status).toBe(200);
    expect(apiResponse.status).toBe(200);
    expect(html).toContain('1 malformed line in the run log.');
    expect(html).toContain('kept-job');
    expect(html).toContain('2026-10-30T04:05:06-04:00');
    expect(payload).toMatchObject({
      night,
      badLines: 1,
      counts: { ok: 1, retry: 0, fail: 0 },
    });
    expect(payload.rows.map((row: { job: string }) => row.job)).toEqual(['kept-job']);
  });
});
