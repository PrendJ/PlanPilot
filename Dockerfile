FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma validates the datasource while generating the client during image build.
# This build-only URL does not connect to a database; the real DATABASE_URL is
# supplied by docker-compose at runtime.
ENV DATABASE_URL="postgresql://boardcue:build-only@127.0.0.1:5432/boardcue?schema=public"
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Keep production tooling (Prisma CLI and provisioning scripts) without
# shipping Playwright, Vitest, TypeScript and the other development packages.
FROM deps AS prod-deps
RUN npm prune --omit=dev

# Merge the standalone Next.js bundle and production dependencies in an
# intermediate filesystem. The final image receives one consolidated layer,
# avoiding a second full copy of node_modules during layer export.
FROM node:22-alpine AS runtime
WORKDIR /runtime
COPY --from=builder /app/.next/standalone ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache openssl && addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=runtime --chown=nextjs:nodejs /runtime ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Recover the one known failed pre-transaction migration, then apply all
# versioned schema changes before starting the server. The recovery is a no-op
# once 0006 is rolled back or successfully applied.
CMD ["sh", "-c", "node scripts/recover-failed-0006.mjs && ./node_modules/.bin/prisma migrate deploy && exec node server.js"]
