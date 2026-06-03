# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Build deps for native modules (better-sqlite3 needs python3/make/g++)
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# Runtime deps for better-sqlite3
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JS and all required runtime assets
COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/public       ./public
COPY --from=builder /app/src/console-ui ./src/console-ui
COPY --from=builder /app/src/dev-ui   ./src/dev-ui
COPY --from=builder /app/src/knowledge ./src/knowledge

EXPOSE 3000

CMD ["node", "dist/app.js"]
