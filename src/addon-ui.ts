import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';

export function isIngressPeer(address?: string): boolean {
  return address === '172.30.32.2' || address === '::ffff:172.30.32.2';
}

export function connectionPage(token: string, nonce: string): string {
  const safeToken = JSON.stringify(token).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skyward MCP connection</title><style nonce="${nonce}">
:root{color-scheme:light dark;font:16px system-ui}body{max-width:680px;margin:48px auto;padding:0 24px}h1{font-size:28px}p{line-height:1.6;color:light-dark(#475569,#b8c5d6)}label{display:block;margin-top:24px;font-weight:600}input,textarea{box-sizing:border-box;width:100%;padding:12px;margin:8px 0;border:1px solid #718096;border-radius:8px;font:14px monospace}textarea{min-height:230px}button{padding:12px 18px;border:0;border-radius:8px;background:#0284c7;color:white;font:inherit;cursor:pointer}#status{min-height:24px}
</style><main><h1>Connect to Skyward MCP</h1><p>Your access token is ready and stays the same across restarts. Copy these settings into your MCP client.</p>
<label for="endpoint">MCP server URL</label><input id="endpoint" type="url" spellcheck="false"><p>Use your Home Assistant's LAN address and the add-on's network port (3000 by default). For remote access, enter your HTTPS proxy URL.</p>
<label for="settings">Connection settings</label><textarea id="settings" readonly spellcheck="false" aria-label="Connection settings"></textarea><button id="copy" type="button">Copy connection settings</button><p id="status" role="status"></p><p>Transport: Streamable HTTP. If your client uses separate fields, enter the URL and Authorization header shown above. Keep these settings private: the token grants access to your configured Skyward account.</p></main>
<script nonce="${nonce}">
const token = ${safeToken};
const endpoint = document.getElementById('endpoint');
const settings = document.getElementById('settings');
const status = document.getElementById('status');
const initial = new URL(window.location.href); initial.protocol = 'http:'; initial.port = '3000'; initial.pathname = '/mcp'; initial.search = ''; initial.hash = ''; endpoint.value = initial.href;
function update() { settings.value = JSON.stringify({mcpServers:{skyward:{url:endpoint.value,headers:{Authorization:'Bearer '+token}}}},null,2); status.textContent = ''; }
endpoint.addEventListener('input', update); update();
document.getElementById('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(settings.value); status.textContent = 'Connection settings copied.'; }
  catch { settings.focus(); settings.select(); status.textContent = 'Settings selected. Press Ctrl+C or Command+C to copy.'; }
});
</script></html>`;
}

export function handleIngress(req: IncomingMessage, res: ServerResponse, token: string) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Trust the socket peer, never forwarded headers a direct caller can forge.
  if (!isIngressPeer(req.socket.remoteAddress)) { res.writeHead(403); res.end('Home Assistant ingress required.'); return; }
  if (req.method !== 'GET' || req.url !== '/') { res.writeHead(404); res.end('Not found.'); return; }
  const nonce = randomBytes(18).toString('base64');
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(connectionPage(token, nonce));
}

export function createIngressApp(token: string) {
  return createServer((req, res) => handleIngress(req, res, token));
}
