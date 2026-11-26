# The worksheet editor: one Node process serving the API and the built client.
# Build:  docker build -t worksheet-editor .
# Run:    docker run --env-file .env -p 3000:3000 worksheet-editor
# The library runner is a second target of the same build: docker build --target runner -t edw-runner .
# For amd64 and arm64 at once: docker buildx build --platform linux/amd64,linux/arm64 ...
# See DEPLOY.md.

# The build runs on the builder's own machine, whatever the target: nothing in it compiles native
# code, and pnpm installs the prebuilt binaries for both x64 and arm64 (pnpm.supportedArchitectures
# in package.json), so one build serves both images. The runner and
# app stages below run no commands, so building them for arm64 on an amd64 machine needs no emulator.
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
# Behind a proxy that inspects TLS (some University networks), hand the build its certificate
# without putting it in the image: docker build --secret id=ca,src=/path/to/ca.crt ...
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi \
 && CI=true pnpm install --frozen-lockfile \
 && pnpm build \
 # Keep only what the server needs at run time.
 && CI=true pnpm install --frozen-lockfile --prod \
 # A local SQLite database (DATABASE_URL=file:/app/data/edw.db) lives here; mount a volume on it.
 && mkdir -p /app/data

# The library runner (library/): curriculum, pedagogy, E&Os, TRAILS. Set by env only: PORT,
# LIBRARY_COLLECTIONS and LIBRARY_PLUGINS (default: those in the image). Health check: /health.
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production PORT=8787
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "library/dist/server/main.js"]

# The app, last so it stays the default target.
FROM node:22-bookworm-slim AS app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
# The server finds its files relative to pnpm-workspace.yaml: config/, the built client and the migrations.
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/server/dist/index.js"]
