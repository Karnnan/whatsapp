# Backend (Express + Baileys). Baileys is browserless (no Chromium), so this
# image is tiny and runs in ~100 MB — it fits free tiers like Render's 512 MB.
FROM node:22-slim

ENV NODE_ENV=production \
    PORT=4000

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 4000
CMD ["node", "server.js"]
