FROM node:22-slim

RUN apt-get update && apt-get install -y \
  chromium \
  chromium-sandbox \
  fonts-liberation \
  python3 \
  python3-pip \
  ffmpeg \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install yt-dlp --no-cache-dir --break-system-packages 2>/dev/null || true

ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_OPTIONS=--max-old-space-size=256

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --ignore-scripts

COPY . .

EXPOSE 3000

CMD mkdir -p /app/temp 2>/dev/null; node index.js