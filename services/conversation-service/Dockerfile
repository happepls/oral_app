# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Copy node_modules from host to avoid npm install network issues
COPY node_modules ./node_modules

# Copy the rest of the application's source code from the host to the image's filesystem
COPY . .

# Conversation service will run on internal port 8083
EXPOSE 8083

# Define the command to run your app
CMD [ "npm", "start" ]