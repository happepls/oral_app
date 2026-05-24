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
# Stage 2: Runner — Express server for SPA routing
# ============================================================
FROM node:18-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

COPY --from=builder /app/build ./build
COPY server.js ./

EXPOSE 5001

USER node

CMD ["node", "server.js"]
