FROM node:20-alpine AS build
WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL
ENV APP_PROFILE=prd
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

RUN npm install -g pnpm@10.32.1

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json

RUN pnpm install --frozen-lockfile --filter @folio/web...

COPY apps/web apps/web
# Next type-checks workspace source exports while building the standalone web image.
COPY packages/types packages/types

RUN pnpm --filter @folio/web exec next build

FROM node:20-alpine AS run
WORKDIR /app

ENV APP_PROFILE=prd
ENV NODE_ENV=production
ENV PORT=5173
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/apps/web/public apps/web/public
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
# Next standalone traces the runtime dependencies; avoid shipping the full
# workspace install because it includes backend-only Codex binaries.
COPY --from=build /app/apps/web/.next/standalone ./

EXPOSE 5173
CMD ["node", "apps/web/server.js"]
