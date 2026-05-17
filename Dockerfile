FROM node:20-slim

RUN apt-get update && apt-get install -y \
  chromium \
  chromium-sandbox \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libgbm1 \
  libnspr4 \
  libnss3 \
  libu2f-udev \
  libvulkan1 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --ignore-scripts

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
