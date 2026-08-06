FROM node:20-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY package*.json ./
COPY node_modules ./node_modules
COPY src ./src
USER app
EXPOSE 3010
CMD ["node", "src/index.js"]
