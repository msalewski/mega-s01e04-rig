import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';
import { DigestPage } from './views/digest.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/api/digest/:night', async (c) => {
    const result = await readNight(config.runsDir, c.req.param('night'));
    if (result.kind !== 'found') {
      return c.json({ night: result.night, error: result.kind }, 404);
    }

    const { night, rows, badLines, counts } = result;
    return c.json({ night, rows, badLines, counts });
  });

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', async (c) => {
    const result = await readNight(config.runsDir, c.req.param('night'));
    if (result.kind !== 'found') return c.notFound();

    return c.html(
      <Layout title={`digest ${result.night}`} lane={lane()}>
        <DigestPage digest={result} />
      </Layout>,
    );
  });

  return app;
}
