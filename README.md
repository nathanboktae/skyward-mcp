# Skyward MCP

A local, read-only MCP server for **Skyward Qmlativ Family Access**, initially targeting Lake Washington School District. Node.js/TypeScript drives an isolated **headless Google Chrome** through Playwright. This is not an adapter for the older Skyward SMS interface.

## Home Assistant OS / Raspberry Pi 5

The `skyward/` folder makes this repository a Home Assistant add-on repository. Install the ARM64 image through HA's app/add-on store; do not add it to HACS.

[Add this repository to Home Assistant](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fnathanboktae%2Fskyward-mcp)

See [add-on installation and configuration](skyward/DOCS.md). Configure Skyward credentials through HA's Configuration tab, start the add-on, and use **Open Web UI → Copy connection settings** to get the automatically generated token, then connect to `http://YOUR_HA_IP:3000/mcp` with a bearer header. For ChatGPT, the setup page also supports an optional, independently rotatable secret URL through its bundled HA bridge and Nabu Casa, or your own HTTPS proxy; see the installation guide. This initial add-on release is experimental pending testing on real HA OS hardware.

## Setup

For a local installation, requires Node.js 22+ and Google Chrome installed. `SKYWARD_BROWSER=chromium` selects Playwright’s bundled headless browser instead; install it with `npx playwright install --with-deps --only-shell chromium`. The HA image includes that browser automatically.

```sh
npm ci
npm run build
cp .env.example .env
chmod 600 .env
```

Edit `.env` locally:

```dotenv
SKYWARD_BASE_URL=https://www.q.wa-k12.net/lkwash/
SKYWARD_USERNAME=your-parent-username
SKYWARD_PASSWORD="your-password"
SKYWARD_TIMEZONE=America/Los_Angeles
SKYWARD_TIMEOUT_MS=45000
```

Use the district root URL, **not** a signed-in URL containing `p` or `w` session parameters. Quote passwords containing `#`. Environment variables override the file. The default file is `.env` at the project root, independent of the caller's working directory. Set `SKYWARD_ENV_FILE` to an absolute path to use another secrets file.

### HTTP server

```sh
npm run build
npm run start:http
```

The MCP endpoint is `http://127.0.0.1:3000/mcp`. `GET /healthz` returns a basic liveness check without contacting Skyward. The endpoint uses stateless MCP Streamable HTTP with JSON responses; point your MCP client's HTTP transport at `/mcp`. It exposes the same three tools as stdio. There is no browser dashboard or REST wrapper.

Configure the listener in the same private `.env`:

```dotenv
SKYWARD_HTTP_HOST=127.0.0.1
SKYWARD_HTTP_PORT=3000
# Optional locally; mandatory when binding beyond loopback:
SKYWARD_HTTP_TOKEN="a-random-secret-of-at-least-32-characters"
```

When a token is configured, clients must send `Authorization: Bearer <token>` on MCP requests. Generate a secret with `openssl rand -hex 32`. For a container or remote deployment, set `SKYWARD_HTTP_HOST=0.0.0.0`, configure a token, and place the service behind an HTTPS reverse proxy. Set the proxy/client response timeout to several minutes for schedule queries. This is a single-account service: every authenticated client accesses the parent account configured on the server. It does not implement OAuth discovery, so use a client supporting custom bearer headers. Browser-origin requests are rejected; CORS is not enabled.

`GET` and `DELETE /mcp` return 405 because there are no persistent MCP sessions or standalone SSE streams. Request bodies are limited to 64 KiB. SIGINT/SIGTERM stop accepting requests, allow up to ten seconds for in-flight work, and close Chrome. The server shares one serialized Skyward client across HTTP calls to avoid overlapping logins.

### Stdio server

Start with `npm start`. This mode speaks MCP over stdio. Connect it to any local MCP client using an equivalent configuration:

```json
{
  "mcpServers": {
    "skyward": {
      "command": "node",
      "args": ["/absolute/path/to/skyward-mcp/dist/index.js"],
      "env": {
        "SKYWARD_ENV_FILE": "/absolute/path/to/private/skyward.env"
      }
    }
  }
}
```

Allow a generous tool-call timeout (several minutes for schedules). Reading dated meeting times requires opening class dialogs sequentially.

## Tools

| Tool | Arguments | Result |
| --- | --- | --- |
| `list_students` | none | Student IDs, names, schools, school years |
| `get_student_schedule` | `studentId` | Current week's classes, stable class IDs, teachers, rooms, terms, enrollment dates, dated meetings with period and local time |
| `get_student_grades` | `studentId`, optional `classId`, and at most one of `quarter`, `semester`, `term` | All-year grade columns and class grades, optionally filtered |

Examples:

```json
{"studentId":"12345","quarter":1}
{"studentId":"12345","semester":2}
{"studentId":"12345","term":"T2","classId":"67890"}
```

Lake Washington uses `T1`–`T4` for quarter columns and `S1`/`S2` for semesters. Exact labels are returned as `availableTerms`; `quarter` also supports districts exposing `Q1`–`Q4`. Blank grades are `null`, not zero. A semester grade can be in progress; it is not necessarily a final report-card grade. No grade averages are calculated.

V1 covers the current school year. Assignments/coursework, historical school years, SSO/MFA automation, and grade writes are outside this version. Class IDs deliberately match between schedules and grades so coursework can be added beneath a class later.

## Implementation

Each tool call restores saved cookies, local storage, and IndexedDB into a new browser context. Valid Skyward sessions are reused; expired sessions sign in with the same saved browser identity. State is saved after login and after each query, including failed queries. Calls are serialized to prevent student selection races and overlapping logins. Credentials are submitted only to the configured HTTPS origin. The server follows normal UI controls so Skyward handles its own CSRF tokens and signed student identifiers.

The adapter uses DOM attributes observed on the live site. Grade tables have duplicated IDs and locked-column copies: extraction uses the unlocked rows and positional column headers. Schedule cards carry course, section, enrollment and date metadata; their detail dialogs supply actual meeting times. Browser state contains authentication secrets and potentially site-cached data. It is stored in private, account-and-district-specific files under `.skyward-state/` by default (excluded from Git); set `SKYWARD_STATE_DIR` to override. Files use mode 0600 and newly created directories use 0700. HA uses `/data/browser-state`, which survives app restarts and upgrades. Do not share these files. No raw page dumps or screenshots are saved. Tool results contain student information and are available to the MCP client you connect.

Selectors and browser extraction live in `src/extract.ts`; navigation and authentication in `src/client.ts`; protocol registration in `src/server.ts`, and HTTP transport in `src/http.ts`. Unexpected login/layout states produce errors instead of fabricated empty grades. School websites can still change, so other districts need validation before claiming compatibility.

## Development

```sh
npm run check
npm test
npm run build
# Optional: uses your real .env credentials; prints only counts
npm run test:live
```

Tests use synthetic student records and real headless Chrome for the DOM parsers. They cover repeated HTML IDs, blank grades, term filters, configuration validation, serialized requests, and HTTP authentication/protocol behavior. Do not commit real student fixtures or secrets.

References: [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server), [Playwright Chrome support](https://playwright.dev/docs/browsers).

## Container releases

The root Dockerfile builds the TypeScript server and installs the browser version matching `package-lock.json`. `.dockerignore` allows only source and build manifests into the context, excluding `.env` and student data. The image reads HA's `/data/options.json` and runs as UID/GID 1000 after reading the root-owned file.

CI runs on a native ARM64 GitHub runner. It runs unit/protocol tests, builds the image, then tests Chromium, privilege dropping, health checks, bearer authentication, and MCP discovery using synthetic options. No real Skyward credentials are used in CI. Main-branch/PR builds do not publish; a `vX.Y.Z` tag publishes the tested image to `ghcr.io/nathanboktae/skyward-mcp:X.Y.Z`.

To release:

1. Update the versions in `package.json`, `package-lock.json`, `src/server.ts`, and `skyward/config.yaml`; update the add-on changelog.
2. Commit and push the changes, then push the matching `vX.Y.Z` tag.
3. Wait for **Test and publish ARM64 add-on** to pass.
4. On first publication, set the GHCR package visibility to public so HA can pull anonymously. This is separate from repository visibility.
5. Reload the HA add-on store to discover the release.

The container can also run outside HA with normal environment variables by overriding its command to `node dist/http-main.js` and using `--user 1000:1000 --init`. The default command is specifically for HA options-file startup.

For a single-package Nabu Casa installation, use **Enable Nabu Casa access** in the Web UI, restart HA Core, then add **Skyward MCP** under Devices & services. See [the setup guide](skyward/DOCS.md#one-package-nabu-casa-setup-050).
