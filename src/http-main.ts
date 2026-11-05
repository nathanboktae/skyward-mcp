#!/usr/bin/env node
import { loadConfig } from './config.js';
import { SkywardClient } from './client.js';
import { createHttpApp, readHttpConfig } from './http.js';

export async function startHttp(secretToken?: () => string | null) {
  const client = new SkywardClient(loadConfig());
  const config = { ...readHttpConfig(), secretToken };
  const app = createHttpApp(client, config);
  app.requestTimeout = 30_000; // Bounds receipt of the request, not tool execution.
  app.headersTimeout = 15_000;
  await new Promise<void>((resolve, reject) => {
    app.once('error', reject);
    app.listen(config.port, config.host, () => {
      app.off('error', reject);
      resolve();
    });
  });
  console.error(`Skyward MCP HTTP listening on ${config.host}:${config.port}; endpoint /mcp`);
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      app.closeAllConnections();
      void client.close();
    }, 10_000);
    deadline.unref();
    app.close(() => {
      clearTimeout(deadline);
      void client.close();
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1]?.endsWith('/http-main.js')) startHttp().catch(error => {
  console.error(error instanceof Error ? error.message : 'Could not start HTTP server.');
  process.exitCode = 1;
});
