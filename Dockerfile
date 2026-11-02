# Compile l'app Tauri (Rust + React) pour Linux.
#   docker build --output type=local,dest=out .   # récupère le binaire dans ./out/Datowl
FROM rust:1-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
      libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
      librsvg2-dev libssl-dev libxdo-dev patchelf file \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node:22-bookworm-slim /usr/local /usr/local
WORKDIR /app

COPY web/package.json web/package-lock.json web/
RUN npm --prefix web ci
COPY apps/desktop/package.json apps/desktop/package-lock.json apps/desktop/
RUN npm --prefix apps/desktop ci

COPY . .
RUN npm --prefix apps/desktop run build -- --no-bundle

FROM scratch
COPY --from=build /app/target/release/Datowl /Datowl
