# Backend (Express + whatsapp-web.js) for hosts with a persistent process:
# Railway, Render, Fly.io, a VPS, etc. Netlify/Vercel CANNOT run this.
FROM node:22-slim

# Install system chromium ONLY to pull in the full set of shared libraries a
# headless Chromium needs. The browser actually used is Puppeteer's OWN
# version-matched download (installed by npm below) — mixing whatsapp-web.js
# with a mismatched system Chromium causes "Protocol error / Target closed".
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium ca-certificates fonts-liberation dbus \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 \
      libasound2 libpangocairo-1.0-0 libxkbcommon0 libxcomposite1 \
      libxdamage1 libxfixes3 libxrandr2 libgtk-3-0 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=4000 \
    NODE_OPTIONS=--max-old-space-size=256

WORKDIR /app
COPY package*.json ./
# NOTE: we do NOT set PUPPETEER_SKIP_DOWNLOAD, so npm install downloads the
# Chromium build that matches whatsapp-web.js's Puppeteer.
RUN npm install --omit=dev
COPY . .

EXPOSE 4000
CMD ["node", "server.js"]
