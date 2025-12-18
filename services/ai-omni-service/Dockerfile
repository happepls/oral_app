FROM python:3.10-slim

WORKDIR /app

# Removed apt-get to avoid network issues.
# We will use python's standard library for health checks.

# Copy local Linux wheels
COPY wheels /wheels
COPY requirements.txt .

# Install python dependencies from local wheels
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt

# Copy application code
COPY . .

# Create a non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8082
EXPOSE 8081

# Health check using Python's urllib instead of curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; import sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8081/health').getcode() == 200 else 1)"

CMD ["python", "app/main.py"]
