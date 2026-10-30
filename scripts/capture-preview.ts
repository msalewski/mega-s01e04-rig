import { serve } from '@hono/node-server';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createApp } from '../src/app.js';

// Capture a real HTTP response from rig. Generated HTML stays outside Git.
const destination = resolve(process.argv[2] ?? '../private/preview/index.html');
const server = serve({ fetch: createApp().fetch, hostname: '127.0.0.1', port: 0 });

try {
  if (!server.listening) await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No preview listener address');
  const response = await fetch(`http://127.0.0.1:${address.port}/digest/2026-10-28`);
  if (!response.ok) throw new Error(`Digest capture failed: HTTP ${response.status}`);
  const html = await response.text();
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, html, 'utf8');
  console.log(`Captured digest HTML: ${destination}`);
} finally {
  await new Promise<void>((done, fail) => {
    server.close((error) => error ? fail(error) : done());
  });
}
