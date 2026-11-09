## 0.6.0

- Add get_student_assignments for a student, class, and quarter/semester/exact term.
- Return assignment IDs, categories, due dates, grades, percentages, earned/possible points, and attempts.
- Preserve blank/non-numeric scores and exclude category totals.

## 0.5.1

- Persist Skyward cookies and browser storage across queries, app restarts, and upgrades.
- Reuse valid login sessions; retain remembered-device cookies when signing in again.
- Isolate saved state by district and username, with private atomic files.

## 0.5.0

- Bundle an HA integration that forwards MCP requests through HA/Nabu Casa.
- Add Enable Nabu Casa access and Use this Home Assistant address controls.
- Require writable HA configuration access and default-role Supervisor API access.
- Install/update only the managed bridge; HA Core restart and initial integration setup are required.

## 0.4.1

- Enable secret URLs automatically on first startup; preserve existing secrets and explicit disabling.
- Show a copyable secret path when no endpoint is entered, instead of a blank field.
- Support HTTP LAN connection URLs and remember the endpoint in the browser.

## 0.4.0

- Add opt-in secret URLs with enable, rotate, disable, and copy controls in the HA-authenticated setup page.
- Preserve bearer authentication independently of secret URLs.
- Stop inferring MCP addresses from the HA/Nabu Casa UI hostname; require an explicit endpoint.
- Document public HTTPS setup and secret URL handling.

# 0.3.0

- Generate and persist the MCP access token automatically; manual token overrides remain compatible.
- Add a Home Assistant-authenticated setup page with editable endpoint and copyable connection settings.
- Keep the setup page on an internal ingress-only port.

# Changelog

## 0.2.0

- Initial ARM64 Home Assistant OS add-on, targeting Raspberry Pi 5.
- MCP HTTP endpoint with required bearer authentication.
- Home Assistant configuration for Skyward credentials and school timezone.
- Bundled headless Chromium, non-root service, and health watchdog.
- Students, current class schedules with meeting times, and quarter/semester grades.
