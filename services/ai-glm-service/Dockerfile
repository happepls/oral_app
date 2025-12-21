# Stage 1: Get static ffmpeg binary
FROM mwader/static-ffmpeg:6.0 AS ffmpeg

# Stage 2: Final image
# We use Python 3.10 to match the downloaded wheels (cp310)
FROM python:3.10-slim-bookworm

# Copy ffmpeg and ffprobe binaries from the static-ffmpeg image
COPY --from=ffmpeg /ffmpeg /usr/local/bin/
COPY --from=ffmpeg /ffprobe /usr/local/bin/

WORKDIR /app

# Copy all wheels from host
COPY wheels /wheels

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies from local wheels
# --no-index means don't look at PyPI
# --find-links tells pip where to look for the .whl files
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt

# Copy application code
COPY . .

# Expose ports (FastAPI/WebSocket)
EXPOSE 8084

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8084"]