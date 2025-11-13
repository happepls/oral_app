# Use Node.js 18 alpine image as base
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies (following project rule: no RUN npm install here)
# Dependencies should be installed on host machine before building

# Copy source code
COPY . .

# Expose ports
EXPOSE 8081 8082

# Start the application
CMD ["node", "src/index.js"]