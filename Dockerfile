# Build from the repository root, not the skyward/ metadata directory.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:22-bookworm-slim
ARG BUILD_VERSION=0.2.0
LABEL org.opencontainers.image.title="Skyward MCP" \
      org.opencontainers.image.description="Skyward Family Access MCP server for Home Assistant" \
      org.opencontainers.image.source="https://github.com/nathanboktae/skyward-mcp" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      io.hass.name="Skyward MCP" \
      io.hass.description="Students, schedules and grades through MCP" \
      io.hass.version="${BUILD_VERSION}" \
      io.hass.type="addon" \
      io.hass.arch="aarch64"
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    SKYWARD_BROWSER=chromium
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The lockfile pins Playwright; install its matching ARM64 browser and libraries.
RUN ./node_modules/.bin/playwright install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/* /root/.npm \
    && chmod -R a+rX /ms-playwright
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# HA supplies Docker's init (init: true). addon-main drops to uid/gid 1000.
CMD ["node", "dist/addon-main.js"]
