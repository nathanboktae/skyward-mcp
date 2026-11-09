import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { BridgeInstaller } from './bridge-installer.js';
import type { SecretUrlStore } from './secret-url.js';

export function isIngressPeer(address?: string): boolean {
  return address === '172.30.32.2' || address === '::ffff:172.30.32.2';
}

export function connectionPage(token: string, nonce: string, secret: string | null = null, csrf = '', bridgeAvailable = false): string {
  const safeToken = JSON.stringify(token).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skyward MCP connection</title><style nonce="${nonce}">
:root{color-scheme:light dark;font:16px system-ui}body{max-width:680px;margin:48px auto;padding:0 24px}h1{font-size:28px}p{line-height:1.6;color:light-dark(#475569,#b8c5d6)}label{display:block;margin-top:24px;font-weight:600}input,textarea{box-sizing:border-box;width:100%;padding:12px;margin:8px 0;border:1px solid #718096;border-radius:8px;font:14px monospace}textarea{min-height:230px}button{padding:12px 18px;border:0;border-radius:8px;background:#0284c7;color:white;font:inherit;cursor:pointer}button:disabled{opacity:.45;cursor:default}#status{min-height:24px}
</style><main><h1>Connect to Skyward MCP</h1><p>Your access token is ready and stays the same across restarts. Copy these settings into your MCP client.</p>
<h2>Nabu Casa access</h2><p>Install the bundled Home Assistant bridge, restart Home Assistant, then add the Skyward MCP integration under Settings → Devices &amp; services. No HACS download is needed.</p><button id="install-bridge" type="button" ${bridgeAvailable ? '' : 'disabled'}>Enable Nabu Casa access</button><p id="bridge-status" role="status">${bridgeAvailable ? 'The bridge is bundled with this app. Installing writes its files into HA’s custom_components directory.' : 'Bridge installation is unavailable. Check the app log and HA configuration mount.'}</p><button id="use-ha" type="button">Use this Home Assistant address</button><p>This selects the HA bridge endpoint. Complete the restart and integration setup before connecting.</p>
<label for="endpoint">MCP server URL</label><input id="endpoint" type="url" spellcheck="false" placeholder="https://skyward.example.com/mcp"><p>Use your Home Assistant's LAN address and the add-on's network port (3000 by default). For Nabu Casa, enable the bundled bridge above and use your HA cloud address with /api/skyward_mcp/mcp. A separate HTTPS proxy remains supported.</p>
<label for="settings">Connection settings</label><textarea id="settings" readonly spellcheck="false" aria-label="Connection settings"></textarea><button id="copy" type="button">Copy connection settings</button><p id="status" role="status"></p><p>Transport: Streamable HTTP. If your client uses separate fields, enter the URL and Authorization header shown above. Keep these settings private: the token grants access to your configured Skyward account.</p><h2>ChatGPT secret URL</h2><p>Secret URL access is enabled automatically. Choose “No authentication” when adding it in ChatGPT. Anyone with this URL can access your Skyward data. Configure your proxy to omit or redact request paths in access logs.</p>
<button id="rotate" type="button">Enable secret URL</button> <button id="disable" type="button">Disable secret URL</button>
<label id="secret-label" for="secret">Secret connection URL</label><input id="secret" readonly type="password"><button id="copy-secret" type="button">Copy secret URL</button><p id="secret-status" role="status"></p><p>Rotating invalidates the previous URL for new requests immediately. Bearer-token clients are unaffected.</p></main>
<script nonce="${nonce}">
const token = ${safeToken};
const endpoint = document.getElementById('endpoint');
const settings = document.getElementById('settings');
const status = document.getElementById('status');
let secretToken = ${JSON.stringify(secret)};
const csrf = ${JSON.stringify(csrf)};
document.getElementById('install-bridge').addEventListener('click', async () => {
  const button = document.getElementById('install-bridge'); button.disabled = true;
  const message = document.getElementById('bridge-status'); message.textContent = 'Installing bridge…';
  try {
    const response = await fetch('bridge/install', { method: 'POST', headers: {'X-Skyward-CSRF': csrf} });
    if (!response.ok) throw new Error();
    message.textContent = 'Bridge installed. Restart Home Assistant, then go to Settings → Devices & services → Add integration → Skyward MCP. If already configured, only a restart is needed.';
  } catch { message.textContent = 'Installation failed. Check the app log, configuration mount, and Supervisor connection.'; }
  finally { button.disabled = false; }
});
document.getElementById('use-ha').addEventListener('click', () => {
  const url = new URL(window.location.href); url.pathname = '/api/skyward_mcp/mcp'; url.search = ''; url.hash = '';
  endpoint.value = url.href; endpoint.dispatchEvent(new Event('input'));
});
const secretField = document.getElementById('secret');
const secretStatus = document.getElementById('secret-status');
function connectionEndpoint() {
  try { const u = new URL(endpoint.value.trim()); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || !u.pathname.endsWith('/mcp')) return null; return u.href; } catch { return null; }
}
function updateSecret() {
  const base = connectionEndpoint();
  secretField.value = secretToken ? (base || '/mcp') + '/' + secretToken : '';
  document.getElementById('secret-label').textContent = base ? 'Secret connection URL' : 'Secret connection path';
  document.getElementById('copy-secret').textContent = base ? 'Copy secret URL' : 'Copy secret path';
  document.getElementById('copy-secret').disabled = !secretField.value;
  document.getElementById('disable').disabled = !secretToken;
  document.getElementById('rotate').textContent = secretToken ? 'Rotate secret URL' : 'Enable secret URL';
  secretStatus.textContent = !secretToken ? 'Secret URL access is disabled.' : !base ? 'Your secret is ready. This is the path only. Enter the MCP server URL above to create a full connection URL; rotating will not supply the server address.' : base.startsWith('https:') ? 'Secret URL is ready. Use a public HTTPS address for ChatGPT.' : 'Local HTTP URL is ready. ChatGPT requires a public HTTPS endpoint.';
}
for (const action of ['rotate', 'disable']) document.getElementById(action).addEventListener('click', async () => {
  if (action === 'rotate' && secretToken && !confirm('Invalidate the previous secret URL? Connected clients will need the new URL.')) return;
  try {
    const response = await fetch('secret/' + action, { method: 'POST', headers: {'X-Skyward-CSRF': csrf} });
    if (!response.ok) throw new Error();
    secretToken = (await response.json()).token; updateSecret();
  } catch { secretStatus.textContent = 'Could not change the secret URL. Reload the page and try again.'; }
});
document.getElementById('copy-secret').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(secretField.value); secretStatus.textContent = connectionEndpoint() ? 'Secret URL copied.' : 'Secret path copied. Add your server address before using it in a client.'; }
  catch { secretField.type = 'text'; secretField.focus(); secretField.select(); secretStatus.textContent = 'URL selected. Press Ctrl+C or Command+C to copy.'; }
});
function update() { settings.value = JSON.stringify({mcpServers:{skyward:{url:endpoint.value,headers:{Authorization:'Bearer '+token}}}},null,2); status.textContent = ''; updateSecret(); }
const endpointKey = 'skyward-mcp-endpoint:' + window.location.pathname;
try { endpoint.value = localStorage.getItem(endpointKey) || ''; } catch {}
endpoint.addEventListener('input', () => {
  try { const valid = connectionEndpoint(); if (valid) localStorage.setItem(endpointKey, valid); else localStorage.removeItem(endpointKey); } catch {}
  update();
}); update();
document.getElementById('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(settings.value); status.textContent = 'Connection settings copied.'; }
  catch { settings.focus(); settings.select(); status.textContent = 'Settings selected. Press Ctrl+C or Command+C to copy.'; }
});
</script></html>`;
}

export async function handleIngress(req: IncomingMessage, res: ServerResponse, token: string, secrets?: SecretUrlStore, csrf = '', bridge?: BridgeInstaller) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Trust the socket peer, never forwarded headers a direct caller can forge.
  if (!isIngressPeer(req.socket.remoteAddress)) { res.writeHead(403); res.end('Home Assistant ingress required.'); return; }
  if (req.method === 'POST' && req.url === '/bridge/install') {
    if (!bridge || !csrf || req.headers['x-skyward-csrf'] !== csrf) { res.writeHead(403); res.end('Forbidden.'); return; }
    try { await bridge.install(); res.writeHead(200); res.end('Installed.'); }
    catch { res.writeHead(500); res.end('Could not install bridge.'); }
    return;
  }
  if (req.method === 'POST' && ['/secret/rotate', '/secret/disable'].includes(req.url || '')) {
    if (!secrets || !csrf || req.headers['x-skyward-csrf'] !== csrf) { res.writeHead(403); res.end('Forbidden.'); return; }
    try {
      await secrets.change(req.url === '/secret/rotate' ? 'rotate' : 'disable');
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ token: secrets.current() }));
    } catch { res.writeHead(500); res.end('Could not save connection settings.'); }
    return;
  }
  if (req.method !== 'GET' || req.url !== '/') { res.writeHead(404); res.end('Not found.'); return; }
  const nonce = randomBytes(18).toString('base64');
  res.setHeader('Content-Security-Policy', `default-src 'none'; connect-src 'self'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(connectionPage(token, nonce, secrets?.current(), csrf, !!bridge));
}

export function createIngressApp(token: string, secrets?: SecretUrlStore, bridge?: BridgeInstaller) {
  const csrf = randomBytes(32).toString('hex');
  return createServer((req, res) => { void handleIngress(req, res, token, secrets, csrf, bridge); });
}
