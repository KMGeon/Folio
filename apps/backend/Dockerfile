# ---- runtime image ----
FROM node:20-alpine AS run
WORKDIR /app

ENV APP_PROFILE=prd
ENV NODE_ENV=production
ENV PORT=8080

RUN npm install -g pnpm@10.32.1

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/diff/package.json packages/diff/package.json
COPY packages/github/package.json packages/github/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/decomposition/package.json packages/decomposition/package.json

RUN pnpm install --frozen-lockfile

COPY apps/backend apps/backend
COPY packages packages

EXPOSE 8080
# Workspace packages currently export TS sources, so production uses tsx rather
# than node dist until package exports are switched to built artifacts.
CMD ["pnpm", "--filter", "@folio/backend", "exec", "tsx", "src/index.ts"]
