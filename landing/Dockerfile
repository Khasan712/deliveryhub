# Build the page in both languages (the tests run too: a missing translation fails the image), then serve it with
# Caddy (Caddyfile: Uzbek at / and /uz, Russian at /ru, content-hashed files under /landing/).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && rm -f dist/artifact.html

FROM caddy:2.11-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80
