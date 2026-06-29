# syntax=docker/dockerfile:1

# Build stage: install all deps (incl. dev) and produce the static client in dist/.
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages ./packages
COPY portal ./portal
COPY games ./games
RUN npm ci

COPY index.html vite.config.js ./
COPY public ./public
RUN npm run build

# Runtime stage: keep only production deps and the source the gateway imports.
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./
COPY packages ./packages
COPY portal ./portal
COPY games ./games
RUN npm ci --omit=dev

COPY bin ./bin
COPY --from=build /app/dist ./dist

EXPOSE 8080
CMD ["node", "bin/dev-server.js"]
