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
