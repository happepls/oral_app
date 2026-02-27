FROM node:18-slim

WORKDIR /app

COPY package*.json ./

# Install dependencies
RUN npm install

COPY . .

EXPOSE 3004

CMD ["npm", "start"]