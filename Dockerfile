# Production image for Render / Railway / any Docker host.
# Runs: API server (Express) + static Expo web build + reverse proxy on $PORT.
# See scripts/prod-start.mjs and DEPLOY.md.
FROM node:24-bookworm-slim

# pnpm via corepack (version matches pnpm-lock.yaml, lockfileVersion 9)
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Context is filtered by .dockerignore (excludes attached_assets ~174MB, .git, node_modules)
COPY . .

# Install ALL deps (dev deps are needed to build, and drizzle-kit/tsx are used
# at boot for schema push + seed — see scripts/prod-start.mjs).
ENV CI=1 \
    EXPO_NO_TELEMETRY=1 \
    HUSKY=0
# NOTE: --no-frozen-lockfile lets pnpm reconcile pnpm-lock.yaml with the current
# workspace "overrides"/"catalog" during the build. The committed lockfile was
# out of sync with pnpm-workspace.yaml, which made --frozen-lockfile abort with
# ERR_PNPM_LOCKFILE_CONFIG_MISMATCH. Regenerate & commit the lockfile locally
# (pnpm install) to switch this back to --frozen-lockfile for reproducible builds.
RUN pnpm install --no-frozen-lockfile

# Build the API server (esbuild bundle -> artifacts/api-server/dist/index.mjs)
RUN pnpm --filter @workspace/api-server run build

# Build the web frontend (Expo -> static SPA).
# EXPO_PUBLIC_DOMAIN is intentionally NOT set: the app then calls relative
# "/api/..." on the same origin, which the runtime proxy routes to the API —
# so the image works on any domain.
RUN pnpm --filter @workspace/english-learning exec expo export --platform web --output-dir static-build/web

ENV NODE_ENV=production
EXPOSE 10000

CMD ["node", "scripts/prod-start.mjs"]
