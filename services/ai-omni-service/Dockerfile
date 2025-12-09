FROM node:18-alpine

WORKDIR /usr/src/app

# Install curl for health checks
RUN apk add --no-cache curl

# Create a non-root user for security
RUN addgroup -g 1001 -S appuser && adduser -S -u 1001 -G appuser appuser

# Copy package files
COPY package*.json ./

# Install dependencies fresh in container
# This ensures compatibility with Alpine Linux
RUN npm install --production --silent && npm cache clean --force

# Copy source code
COPY . .

# Set proper ownership for models directory
RUN chown -R appuser:appuser /usr/src/app/models

# Expose ports
EXPOSE 8082
EXPOSE 8081

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8081/health || exit 1

CMD ["node", "src/index.js"]