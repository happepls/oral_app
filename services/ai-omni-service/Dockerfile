FROM node:18-slim

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Copy node_modules from host (for local development)
COPY node_modules ./node_modules

# Copy source code
COPY . .

# Expose ports
EXPOSE 8082
EXPOSE 8081

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8081/health || exit 1

CMD ["node", "src/index.js"]