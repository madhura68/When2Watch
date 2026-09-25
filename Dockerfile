FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Operator tools for migration/readback (tsx, dev dependencies). Never the served image.
FROM base AS tools
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci
COPY --chown=node:node . .
RUN npm run db:generate

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/next.config.ts ./next.config.ts
COPY --from=build --chown=node:node /app/scripts/start.sh ./scripts/start.sh
COPY --from=build --chown=node:node /app/scripts/migrate.sh ./scripts/migrate.sh
COPY --from=build --chown=node:node /app/scripts/cron-client.mjs ./scripts/cron-client.mjs
USER node
EXPOSE 3000
CMD ["sh", "scripts/start.sh"]
