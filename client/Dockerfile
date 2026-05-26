# ============================================================
# Stage 1: Builder — install deps & compile React app
# ============================================================
FROM node:18-alpine AS builder

WORKDIR /app

ARG REACT_APP_API_URL=/api
ARG REACT_APP_GOOGLE_CLIENT_ID

COPY package*.json ./
RUN npm ci --legacy-peer-deps && npm cache clean --force

COPY config-overrides.js tailwind.config.js postcss.config.js ./
COPY public/ ./public/
COPY src/ ./src/

RUN echo "REACT_APP_API_URL=${REACT_APP_API_URL}" > .env && \
    echo "REACT_APP_GOOGLE_CLIENT_ID=${REACT_APP_GOOGLE_CLIENT_ID}" >> .env

RUN npm run build

# ============================================================
# Stage 2: Production — Nginx serves static assets only
# ============================================================
FROM nginx:1.27-alpine AS production

RUN rm -rf /var/cache/apk/*

COPY client.nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 5001

CMD ["nginx", "-g", "daemon off;"]
