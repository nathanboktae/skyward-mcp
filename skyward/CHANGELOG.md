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
