# Skyward MCP

A local, read-only MCP server for **Skyward Qmlativ Family Access**, initially targeting Lake Washington School District. Node.js/TypeScript drives an isolated **headless Google Chrome** through Playwright. This is not an adapter for the older Skyward SMS interface.

## Setup

Requires Node.js 22+ and Google Chrome installed.

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

Start with `npm start`. This process speaks MCP over stdio; it is not a web server. Connect it to any local MCP client using an equivalent configuration:

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

Each tool call starts a fresh isolated browser context and signs in. Contexts and cookies are discarded afterward; the Chrome process is reused. Calls are serialized to prevent student selection races and overlapping logins. Credentials are submitted only to the configured HTTPS origin. The server follows normal UI controls so Skyward handles its own CSRF tokens and signed student identifiers.

The adapter uses DOM attributes observed on the live site. Grade tables have duplicated IDs and locked-column copies: extraction uses the unlocked rows and positional column headers. Schedule cards carry course, section, enrollment and date metadata; their detail dialogs supply actual meeting times. No student records, raw page dumps, screenshots, session URLs, or cookies are written to disk. Tool results contain student information and are available to the MCP client you connect.

Selectors and browser extraction live in `src/extract.ts`; navigation and authentication in `src/client.ts`; protocol registration in `src/server.ts`. Unexpected login/layout states produce errors instead of fabricated empty grades. School websites can still change, so other districts need validation before claiming compatibility.

## Development

```sh
npm run check
npm test
npm run build
# Optional: uses your real .env credentials; prints only counts
npm run test:live
```

Tests use synthetic student records and real headless Chrome for the DOM parsers. They cover repeated HTML IDs, blank grades, term filters, configuration validation, and serialized requests. Do not commit real student fixtures or secrets.

References: [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server), [Playwright Chrome support](https://playwright.dev/docs/browsers).
