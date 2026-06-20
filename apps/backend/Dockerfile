# ---- build image ----
FROM node:20-alpine AS build
WORKDIR /app

# Install deps (workspace-aware; this Dockerfile assumes a built context with
# the backend package's package.json + sources available).
COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- run image ----
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV APP_PROFILE=prd

COPY package.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/index.js"]
