# Use a multi-stage build to get a static ffmpeg binary
# This avoids running apt-get update which can fail due to network issues
FROM mwader/static-ffmpeg:6.0 AS ffmpeg

FROM node:18-slim

# Copy ffmpeg and ffprobe binaries from the static-ffmpeg image
COPY --from=ffmpeg /ffmpeg /usr/local/bin/
COPY --from=ffmpeg /ffprobe /usr/local/bin/

WORKDIR /app

COPY package*.json ./

# Install dependencies (cloud CI builds don't have host node_modules)
RUN npm ci --omit=dev

COPY . .

EXPOSE 3005

CMD ["npm", "start"]
