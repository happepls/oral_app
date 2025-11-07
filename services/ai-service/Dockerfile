# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Use a reliable registry mirror and install dependencies inside the container
COPY node_modules ./node_modules

# Copy the rest of the application's source code from the host to the image's filesystem
COPY . .

# AI service will run on internal port 8082
EXPOSE 8082

# Define the command to run your app
CMD [ "npm", "start" ]
