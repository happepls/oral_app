# Use an official Node.js runtime as a parent image
FROM node:18
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Copy node_modules from host machine (per project rules)
COPY node_modules ./node_modules

# Copy the rest of the application's source code from the host to the image's filesystem
COPY . .

# Change ownership of the app directory to the appuser
RUN chown -R appuser:appuser /usr/src/app

# Switch to the appuser
USER appuser

# Your app binds to port 3000 so you'll use the EXPOSE instruction to have it mapped by the docker daemon
EXPOSE 3000

# Define the command to run your app
CMD [ "npm", "start" ]