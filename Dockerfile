# syntax=docker/dockerfile:1

# OMPA-Tool – Container-Build für Coolify (Next.js 16 standalone + echtes Chromium).
#
# Warum ein eigenes Dockerfile statt Nixpacks:
# Der PDF-Export (/api/ompa-report) startet Chromium via puppeteer-core. Das
# braucht eine echte Chromium-Binary + System-Libs, die ein Standard-Node-Image
# nicht mitbringt. Wir installieren daher Debians chromium-Paket und zeigen die
# App per CHROMIUM_LOCAL_EXEC_PATH darauf.

# ─────────────────────────────────────────────────────────────
# 1) Dependencies – node_modules einmal sauber installieren
# ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Verhindert, dass das (dev-)puppeteer-Paket beim Install ein eigenes
# ~150 MB Chromium herunterlädt – wir nutzen das System-Chromium.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package.json package-lock.json ./
RUN npm ci

# ─────────────────────────────────────────────────────────────
# 2) Builder – Next.js standalone bauen
# ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ─────────────────────────────────────────────────────────────
# 3) Runner – schlankes Laufzeit-Image mit Chromium
# ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Chromium + Fonts + Zertifikate. Das chromium-Paket zieht seine
# gemeinsamen Bibliotheken (libnss3, libgbm1, …) automatisch mit.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     chromium \
     fonts-liberation \
     fonts-noto-color-emoji \
     ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Die PDF-Route liest diesen Pfad (CHROMIUM_LOCAL_EXEC_PATH) und nutzt so
# das System-Chromium statt der Vercel-/Lambda-Binary.
ENV CHROMIUM_LOCAL_EXEC_PATH=/usr/bin/chromium

# Als nicht-root Nutzer laufen lassen.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone-Output: server.js + minimale node_modules, dazu static & public.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
