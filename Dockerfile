FROM oven/bun:1.2-alpine AS base

WORKDIR /app

FROM base AS builder
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./.dist
COPY --from=builder /app/package.json ./

EXPOSE 3000

CMD ["bun", ".dist/server/server.mjs"]
