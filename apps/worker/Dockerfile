FROM node:20-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

FROM base AS dependencies

COPY . .
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder

ENV NODE_ENV=production

RUN pnpm db:generate
RUN pnpm --filter @ants/worker build
RUN pnpm --filter @ants/worker deploy --prod /prod/worker

FROM base AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --chown=node:node --from=builder /prod/worker ./

USER node

CMD ["node", "dist/main.js"]
