# Skyward MCP for Home Assistant OS

Runs a read-only Skyward Qmlativ Family Access MCP server on Raspberry Pi 5 / ARM64 Home Assistant OS. Other Skyward interfaces have not been validated. This is a server add-on, not a Home Assistant entity integration or a HACS package.

## Install

1. In Home Assistant, open **Settings → Apps → App store** (called **Add-ons → Add-on Store** on older versions).
2. Open the **⋮ → Repositories** menu and add `https://github.com/nathanboktae/skyward-mcp`.
3. Install **Skyward MCP**. HA downloads the prebuilt ARM64 image; it does not build on your Pi.
4. Open **Configuration** and fill in the settings below, then save and start the add-on.
5. Enable **Start on boot** and optionally **Watchdog**.

## Configuration

- **Skyward district URL:** `https://www.q.wa-k12.net/lkwash/` for Lake Washington. Use the district root, without signed-in `p` or `w` parameters.
- **Skyward username/password:** Your parent account's credentials. The password field is masked.
- **MCP access token:** A different random secret, at least 32 characters, without spaces. Generate one using `openssl rand -hex 32` on your computer. Copy this token to your MCP client; do not reuse your Skyward password.
- **School timezone:** Defaults to `America/Los_Angeles`.
- **Page timeout:** Defaults to 45000 milliseconds. This applies to each Skyward page load.

HA stores these settings in the add-on's private `/data/options.json`. The service reads them at startup, maps them to environment variables in memory, and drops to a non-root user. Restart after editing settings. No `.env` file is needed on HA. HA backups may contain the credentials; protect those backups.

## Connect an MCP client

Use **Streamable HTTP**:

- URL: `http://YOUR_HA_IP:3000/mcp`
- Header: `Authorization: Bearer YOUR_MCP_TOKEN`

The host port is configurable in the add-on's Network settings. Allow several minutes for schedule tool calls: Skyward's dated class dialogs are read sequentially.

The endpoint exposes `list_students`, `get_student_schedule`, and `get_student_grades`. All clients using the token access the configured parent account. It has no OAuth discovery or browser UI. HA ingress is not used for MCP transport. Keep the port on your trusted LAN; use an HTTPS reverse proxy or VPN for remote access, rather than port-forwarding plain HTTP.

## Health and troubleshooting

- `/healthz` is a liveness check. It does not log into Skyward or validate credentials.
- If startup fails, inspect the add-on Log tab for invalid configuration field names.
- A 401 from `/mcp` means the client token is missing or incorrect.
- A 405 from a browser visiting `/mcp` is normal: connect using an MCP client that sends POST requests.
- If the image cannot be downloaded, confirm the requested version exists and the GHCR package is public. First-time publishing may require the maintainer to change package visibility.
- The browser is bundled in the image. No Chrome installation, host networking, Supervisor API access, or disabled Protection mode is required.

The initial release is experimental until verified on a real HA OS installation. CI tests native ARM64 Linux, Chromium startup, the HA options entrypoint, and MCP HTTP discovery; it does not run a full Supervisor or use your school credentials.
