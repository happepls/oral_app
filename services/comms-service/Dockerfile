# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Dependencies are prepared on the host before image rebuilds.
COPY node_modules ./node_modules
COPY src ./src

# Your app binds to port 8080
EXPOSE 8080

# Define the command to run your app
CMD [ "npm", "start" ]
