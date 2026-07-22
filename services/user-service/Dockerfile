# Use an official Node.js runtime as a parent image
FROM node:18
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Dependencies are prepared on the host before image rebuilds.
COPY node_modules ./node_modules
COPY src ./src

# Change ownership of the app directory to the appuser
RUN chown -R appuser:appuser /usr/src/app

# Switch to the appuser
USER appuser

# Your app binds to port 3000 so you'll use the EXPOSE instruction to have it mapped by the docker daemon
EXPOSE 3000

# Define the command to run your app
CMD [ "node", "src/index.js" ]
