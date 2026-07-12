# Backend (Express + whatsapp-web.js) for hosts with a persistent process:
# Railway, Render, Fly.io, a VPS, etc. Netlify/Vercel CANNOT run this.
FROM node:20-slim

# Chromium + the libraries whatsapp-web.js (Puppeteer) needs to run headless.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium ca-certificates fonts-liberation \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 \
      libasound2 libpangocairo-1.0-0 libxkbcommon0 libxcomposite1 \
      libxdamage1 libxfixes3 libxrandr2 libgtk-3-0 \
  && rm -rf /var/lib/apt/lists/*

# Use the system Chromium (whatsapp-service.js reads PUPPETEER_EXECUTABLE_PATH),
# and skip Puppeteer's bundled-Chromium download during npm install.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=4000

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 4000
CMD ["node", "server.js"]
