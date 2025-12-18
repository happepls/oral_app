# Use a multi-stage build to get a static ffmpeg binary
# This avoids running apt-get update which can fail due to network issues
FROM mwader/static-ffmpeg:6.0 AS ffmpeg

FROM node:18-slim

# Copy ffmpeg and ffprobe binaries from the static-ffmpeg image
COPY --from=ffmpeg /ffmpeg /usr/local/bin/
COPY --from=ffmpeg /ffprobe /usr/local/bin/

WORKDIR /app

COPY package*.json ./

# Copy node_modules from host instead of running npm install to save time and avoid network issues
COPY node_modules ./node_modules

COPY . .

EXPOSE 3005

CMD ["npm", "start"]
