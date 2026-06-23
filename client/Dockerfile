# ============================================================
# Stage 1: Builder — install deps & compile React app
# ============================================================
FROM node:18-alpine AS builder

WORKDIR /app

ARG REACT_APP_API_URL=/api
ARG REACT_APP_GOOGLE_CLIENT_ID
ARG REACT_APP_TAWK_PROPERTY_ID
ARG REACT_APP_TAWK_WIDGET_ID

COPY package*.json ./
RUN npm ci --legacy-peer-deps && npm cache clean --force

COPY config-overrides.js tailwind.config.js postcss.config.js ./
COPY public/ ./public/
COPY src/ ./src/

RUN echo "REACT_APP_API_URL=${REACT_APP_API_URL}" > .env && \
    echo "REACT_APP_GOOGLE_CLIENT_ID=${REACT_APP_GOOGLE_CLIENT_ID}" >> .env && \
    echo "REACT_APP_TAWK_PROPERTY_ID=${REACT_APP_TAWK_PROPERTY_ID}" >> .env && \
    echo "REACT_APP_TAWK_WIDGET_ID=${REACT_APP_TAWK_WIDGET_ID}" >> .env

RUN npm run build

# ============================================================
# Stage 2: Production — Nginx serves static assets only
# ============================================================
FROM nginx:1.27-alpine AS production

RUN rm -rf /var/cache/apk/*

# Zeabur 用此 Dockerfile（root=client 时自动选 Dockerfile 而非 Dockerfile.prod）。
# 必须用 .zeabur.internal 版（resolver 10.43.0.20 + 变量化 proxy_pass + media-src CSP）。
COPY client.nginx.zeabur.conf /etc/nginx/nginx.conf
# Assert the Zeabur conf is baked in — fails build (and busts stale COPY cache)
# if an older client.nginx.conf snuck in.
RUN grep -q "resolver 10.43.0.20" /etc/nginx/nginx.conf \
    && grep -q "media-src" /etc/nginx/nginx.conf \
    && grep -q "cloudflareinsights" /etc/nginx/nginx.conf
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 5001

CMD ["nginx", "-g", "daemon off;"]
