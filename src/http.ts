import { createServer as createHttpServer, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import type { SkywardClient } from './client.js';

export interface HttpConfig {
  host: string;
  port: number;
  token?: string;
}

export function readHttpConfig(env: NodeJS.ProcessEnv = process.env): HttpConfig {
  const host = env.SKYWARD_HTTP_HOST || '127.0.0.1';
  const port = Number(env.SKYWARD_HTTP_PORT || 3000);
  const token = env.SKYWARD_HTTP_TOKEN || undefined;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SKYWARD_HTTP_PORT.');
  if (token && (token.length < 32 || /\s/.test(token))) throw new Error('SKYWARD_HTTP_TOKEN must contain at least 32 characters and no whitespace.');
  if (!['127.0.0.1', '::1', 'localhost'].includes(host) && !token) {
    throw new Error('SKYWARD_HTTP_TOKEN is required when listening beyond localhost.');
  }
  return { host, port, token };
}

function json(res: ServerResponse, status: number, body: object) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function createHttpApp(client: SkywardClient, config: HttpConfig) {
  return createHttpServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // This endpoint is for MCP clients, not cross-origin browser scripts.
    if (req.headers.origin) return json(res, 403, { error: 'Browser origins are not supported.' });
    if (!config.token) {
      // Prevent DNS rebinding against an unauthenticated loopback listener.
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host || '')) {
        return json(res, 403, { error: 'Invalid Host header.' });
      }
    }
    if (req.url === '/healthz' && req.method === 'GET') return json(res, 200, { status: 'ok' });
    if (req.url !== '/mcp') return json(res, 404, { error: 'Not found. MCP endpoint: /mcp' });
    if (config.token) {
      const expected = Buffer.from(`Bearer ${config.token}`);
      const supplied = Buffer.from(req.headers.authorization || '');
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        res.setHeader('WWW-Authenticate', 'Bearer realm="skyward-mcp"');
        return json(res, 401, { error: 'Unauthorized' });
      }
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { error: 'Use POST for stateless Streamable HTTP.' });
    }
    // A fresh transport/server per HTTP request avoids sharing protocol state.
    // All requests share the browser client's serialized work queue.
    const mcp = createServer(client);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: 64 * 1024,
    });
    res.once('close', () => { void mcp.close().catch(() => {}); });
    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) json(res, 500, { error: 'MCP request failed.' });
      else res.end();
      await mcp.close().catch(() => {});
    }
  });
}
