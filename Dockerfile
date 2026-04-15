# Prompt Compiler API
#
# Multi-stage build. Builder compiles the full monorepo; runner copies only
# the compiled outputs + node_modules so the final image stays lean.
#
# Build from the repository root:
#   docker build -f Dockerfile -t prompt-compiler-api .
#   docker run -p 8787:8787 -v /data:/data \
#     -e STRIPE_SECRET_KEY=sk_test_... \
#     -e STRIPE_WEBHOOK_SECRET=whsec_... \
#     -e STRIPE_PRICE_ID_PRO=price_... \
#     -e AUTH_BYPASS=false \
#     -e DATA_DIR=/data \
#     prompt-compiler-api

# ── Builder ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Copy manifests first so npm ci layer is cached when source changes.
COPY package*.json ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/api/tsconfig.json apps/api/
COPY packages/core/package.json packages/core/
COPY packages/core/tsconfig.json packages/core/
COPY packages/schemas/package.json packages/schemas/
COPY packages/schemas/tsconfig.json packages/schemas/
COPY packages/cli/package.json packages/cli/
COPY packages/cli/tsconfig.json packages/cli/

RUN npm ci

# Copy source and build.
COPY . .
RUN npm run build

# ── Runner ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy compiled outputs from builder. All packages are needed because the API
# imports @prompt-compiler/core and @prompt-compiler/schemas at runtime via
# the npm-workspace symlinks in node_modules.
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/package.json ./

COPY --from=builder /app/apps/api/dist ./apps/api/dist/
COPY --from=builder /app/apps/api/package.json ./apps/api/

COPY --from=builder /app/packages/core/dist ./packages/core/dist/
COPY --from=builder /app/packages/core/package.json ./packages/core/

COPY --from=builder /app/packages/schemas/dist ./packages/schemas/dist/
COPY --from=builder /app/packages/schemas/package.json ./packages/schemas/
COPY --from=builder /app/packages/schemas/src ./packages/schemas/src/

# Persistent SQLite data directory — mount a volume here in production.
VOLUME ["/data"]
ENV DATA_DIR=/data

EXPOSE 8787
WORKDIR /app/apps/api
CMD ["node", "dist/apps/api/src/server.js"]
