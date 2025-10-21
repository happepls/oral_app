# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy the entire application directory, including pre-installed node_modules
COPY . .

# Your app binds to port 8080
EXPOSE 8080

# Define the command to run your app
CMD [ "npm", "start" ]
