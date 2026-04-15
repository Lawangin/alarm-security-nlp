# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo root manifests + lockfile so pnpm can resolve the workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json ./backend/

# Install all deps (including devDeps needed to compile TypeScript)
RUN pnpm install --frozen-lockfile --filter backend

COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src

RUN pnpm --filter backend build

# Stage 2: Production
FROM node:20-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json ./backend/

RUN pnpm install --frozen-lockfile --prod --filter backend

COPY --from=builder /app/backend/dist ./backend/dist

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["node", "backend/dist/index.js"]
