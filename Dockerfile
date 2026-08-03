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
#
# The pnpm store is dropped right after install: packages are hardlinked into
# node_modules, so the files stay alive and the image loses the duplicate copy.
RUN pnpm install --no-frozen-lockfile \
 && pnpm store prune \
 && rm -rf "$(pnpm store path 2>/dev/null || echo /root/.local/share/pnpm/store)" /root/.cache/* || true

# Build the API server (esbuild bundle -> artifacts/api-server/dist/index.mjs).
# Cheap step, no memory tuning needed.
RUN pnpm --filter @workspace/api-server run build

# Build the web frontend (Expo -> static SPA).
# EXPO_PUBLIC_DOMAIN is intentionally NOT set: the app then calls relative
# "/api/..." on the same origin, which the runtime proxy routes to the API —
# so the image works on any domain.
#
# MEMORY: this step used to blow past Render's 8GB build limit.
#   --max-workers=1        Metro spawns one transformer worker per CPU core by
#                          default and each keeps its own module graph — the main
#                          cause of the OOM. Slower, but it finishes. Raise to
#                          2-4 only on a plan with a bigger build limit.
#   --max-old-space-size   caps the V8 heap so GC runs long before the container
#                          limit is hit. Scoped to this RUN on purpose: the same
#                          flag in the runtime env would also throttle the API.
# Source maps are stripped afterwards — dead weight in the image; browser errors
# will point at minified lines, which is fine for a preview build.
RUN NODE_OPTIONS=--max-old-space-size=4096 \
    pnpm --filter @workspace/english-learning exec \
      expo export --platform web --output-dir static-build/web --max-workers 1 \
 && find artifacts/english-learning/static-build -name '*.map' -type f -delete 2>/dev/null || true

# Build caches are worthless at runtime and only inflate the image.
RUN rm -rf /root/.cache/* /tmp/* \
      artifacts/english-learning/.expo \
      artifacts/english-learning/.metro-cache || true

ENV NODE_ENV=production
EXPOSE 10000

CMD ["node", "scripts/prod-start.mjs"]
