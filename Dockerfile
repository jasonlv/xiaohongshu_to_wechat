FROM ghcr.io/puppeteer/puppeteer:latest

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci
COPY . .

# 创建并设置权限
RUN mkdir -p /opt/render/project/src/public/images && \
    mkdir -p /opt/render/project/src/public/assets && \
    chmod -R 777 /opt/render/project/src/public

CMD ["npm", "start"] 