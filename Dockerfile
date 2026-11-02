# Démo web de l'UI (backend mock) servie par nginx. L'app complète est une app Tauri (desktop).
FROM node:22-alpine AS build
WORKDIR /app
COPY web/package.json web/package-lock.json web/
RUN npm --prefix web ci
COPY web web
# vite.config.ts lit la version dans tauri.conf.json
COPY apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/tauri.conf.json
RUN npm --prefix web run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
