FROM node:18-slim

WORKDIR /app

COPY package*.json ./

# Copy node_modules from host to avoid npm install network issues
COPY node_modules ./node_modules

COPY . .

EXPOSE 3004

CMD ["npm", "start"]