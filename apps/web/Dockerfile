FROM node:20-alpine AS run
WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL
ENV APP_PROFILE=prd
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

RUN npm install -g pnpm@10.32.1

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/diff/package.json packages/diff/package.json
COPY packages/github/package.json packages/github/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/decomposition/package.json packages/decomposition/package.json

RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
COPY packages packages

RUN pnpm --filter @folio/web exec next build

EXPOSE 5173
CMD ["pnpm", "--filter", "@folio/web", "start:prd"]
