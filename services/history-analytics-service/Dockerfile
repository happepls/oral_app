FROM node:18-slim

WORKDIR /app

COPY package*.json ./

# Install dependencies (use npm ci for production, install for dev)
# For local dev with volume mapping, we might skip this or handle it differently
# But for a proper image build:
RUN npm install

COPY . .

EXPOSE 3004

CMD ["npm", "start"]
