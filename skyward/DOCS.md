# Skyward MCP for Home Assistant OS

Runs a read-only Skyward Qmlativ Family Access MCP server on Raspberry Pi 5 / ARM64 Home Assistant OS. Other Skyward interfaces have not been validated. The app bundles a small Home Assistant integration for Nabu Casa access. No separate HACS download is needed.

## Install

1. In Home Assistant, open **Settings → Apps → App store** (called **Add-ons → Add-on Store** on older versions).
2. Open the **⋮ → Repositories** menu and add `https://github.com/nathanboktae/skyward-mcp`.
3. Install **Skyward MCP**. HA downloads the prebuilt ARM64 image; it does not build on your Pi.
4. Open **Configuration** and fill in the settings below, then save and start the add-on.
5. Select **Open Web UI**, then **Copy connection settings**. Paste them into your MCP client. Adjust the displayed server address if needed.
6. Enable **Start on boot** and optionally **Watchdog**.

## Configuration

- **Skyward district URL:** `https://www.q.wa-k12.net/lkwash/` for Lake Washington. Use the district root, without signed-in `p` or `w` parameters.
- **Skyward username/password:** Your parent account's credentials. The password field is masked.
- **MCP access token override (optional):** Normally leave this unset. A random token is generated on first start and stored privately in `/data/mcp-token`, surviving restarts and updates. Existing manual tokens continue working. The Home Assistant-authenticated **Open Web UI** page provides copyable connection settings.
- **School timezone:** Defaults to `America/Los_Angeles`.
- **Page timeout:** Defaults to 45000 milliseconds. This applies to each Skyward page load.

HA stores these settings in the add-on's private `/data/options.json`. The service reads them at startup, maps them to environment variables in memory, and drops to a non-root user. Restart after editing settings. No `.env` file is needed on HA. Back up `/data` to preserve the generated token. HA backups may contain the credentials; protect those backups.

## Connect an MCP client

Use **Streamable HTTP**:

- URL: `http://YOUR_HA_IP:3000/mcp`
- Header: `Authorization: Bearer YOUR_MCP_TOKEN`

The host port is configurable in the add-on's Network settings. Allow several minutes for schedule tool calls: Skyward's dated class dialogs are read sequentially.

The endpoint exposes `list_students`, `get_student_schedule`, and `get_student_grades`. All clients using the token access the configured parent account. The setup page uses HA ingress and is available to HA administrators. It is separate from the MCP endpoint; external MCP clients still use the bearer token. There is no OAuth discovery. Keep the port on your trusted LAN; use an HTTPS reverse proxy or VPN for remote access, rather than port-forwarding plain HTTP.

## Health and troubleshooting

- `/healthz` is a liveness check. It does not log into Skyward or validate credentials.
- If startup fails, inspect the add-on Log tab for invalid configuration field names.
- A 401 from `/mcp` means the client token is missing or incorrect.
- A 405 from a browser visiting `/mcp` is normal: connect using an MCP client that sends POST requests.
- If the image cannot be downloaded, confirm the requested version exists and the GHCR package is public. First-time publishing may require the maintainer to change package visibility.
- The browser is bundled in the image. No Chrome installation, host networking, or disabled Protection mode is required. The app uses default-role Supervisor API access to discover its internal hostname and a writable HA configuration mount for its bundled bridge.

The initial release is experimental until verified on a real HA OS installation. CI tests native ARM64 Linux, Chromium startup, the HA options entrypoint, and MCP HTTP discovery; it does not run a full Supervisor or use your school credentials. The bridge is also tested inside HA Core, but Nabu Casa/ChatGPT connectivity requires testing on your installation.

## ChatGPT secret URL (0.4.0+)

1. Set up a public HTTPS tunnel or reverse proxy forwarding `/mcp` and `/mcp/*` to the app's port 3000. Preserve the full path. The app does not provision a domain, tunnel, or TLS certificate. Nabu Casa's HA UI address does not expose this port.
2. Open **Web UI**, enter your public endpoint (for example `https://skyward.example.com/mcp`), and copy the automatically generated secret URL. The endpoint field starts blank intentionally; enter the address reachable by your client. The valid server address is remembered in this browser. Without an address, the page shows a copyable secret path instead of an empty field. HTTP addresses are supported for LAN clients; ChatGPT needs public HTTPS.
3. Select **Copy secret URL**. In ChatGPT's custom MCP plugin setup, paste that URL and choose **No authentication**. The server authenticates using the secret path instead of an HTTP header. ChatGPT connectivity must be tested against your own public endpoint.
4. Use **Rotate secret URL** to replace it, or **Disable secret URL** to revoke it. Old URLs stop working for new requests immediately; already-running tool calls may finish. Existing bearer-token clients keep working.

Secret URL access is enabled automatically when no stored configuration exists. Existing secrets are retained, and explicitly disabled access stays disabled across updates and restarts. Its separate 256-bit random credential is persisted in `/data/connection/secret-url.json` and survives restarts/updates; backups contain this credential. Only HA ingress can access the management controls, which also require a CSRF token. Anyone with the complete URL can query your configured account: do not share it publicly. Disable or redact request paths in tunnel/reverse-proxy access logs. The app does not log URLs, and strips the secret before handing requests to the MCP transport. Keep the setup page on ingress, not your public proxy.

## One-package Nabu Casa setup (0.5.0+)

1. Update/start the Skyward app, open **Web UI**, and click **Enable Nabu Casa access**. This installs bundled files only in `/config/custom_components/skyward_mcp` (seen as `/homeassistant/custom_components/skyward_mcp` inside the app). An independently installed integration at that path is left untouched and installation is refused.
2. Restart **Home Assistant Core** from its system restart menu. Restarting only the Skyward app is not enough.
3. Go to **Settings → Devices & services → Add integration → Skyward MCP** and confirm. No credentials need to be copied. If already configured, only the restart is needed.
4. Open the Skyward Web UI through your Nabu Casa URL and click **Use this Home Assistant address**. The endpoint should be `https://YOUR.ui.nabu.casa/api/skyward_mcp/mcp`. If using HA locally, enter your Nabu Casa address manually instead.
5. Copy the secret URL into ChatGPT and choose **No authentication**. It includes exactly one `/api/skyward_mcp/mcp/SECRET` path.

The integration forwards requests only to this app's internal hostname on port 3000. The app validates its existing secret on every request; rotation and disabling take effect immediately for new requests. Browser Origin requests, oversized bodies, and redirects are rejected. The setup page remains ingress-only. A browser GET of the bridge MCP endpoint returns 405; MCP clients use POST. A 404 indicates the bridge is not loaded or the secret path is invalid. A 502 indicates the app is unavailable.

App upgrades refresh an already-installed managed bridge at startup; restart HA Core after bridge updates. Installing the app alone does not modify YAML or HA's `.storage` configuration. Bridge setup is an explicit step, and the app never restarts HA automatically. Removing the Skyward integration in Devices & services disables its routes. Removing the app alone leaves the integration files; remove the integration entry first and delete only its `custom_components/skyward_mcp` directory if no longer wanted, then restart HA.

HA Core debug HTTP logs or external request logs can include URLs. Avoid enabling request-path debug/access logging when using secret URLs. Never share the full URL.

## Remembered Skyward device

Cookies, local storage, and IndexedDB are saved automatically in `/data/browser-state`, separately for each district and username. Valid sessions are reused; when they expire, the app logs in using the saved browser identity. This state survives restarts and upgrades and is included in app data backups. Treat backups as secrets. Skyward may still request verification or send a login notification after its own device/session expiry. Deleting this directory resets the remembered device.
