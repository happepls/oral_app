FROM python:3.10-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
# Older pip versions do not retry a timeout while streaming a wheel. Retry the
# install at most three times, and keep a persistent failure fatal to the build.
RUN for attempt in 1 2 3; do \
        pip install --no-cache-dir --disable-pip-version-check --timeout 120 --retries 5 \
            -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ \
            --trusted-host mirrors.aliyun.com && break; \
        if [ "$attempt" -eq 3 ]; then exit 1; fi; \
        echo "Dependency download failed; retrying install ($attempt/3)" >&2; \
        sleep 5; \
    done && \
    python -m pip check

# Copy application code
COPY . .

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 3006

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; import sys; sys.exit(0 if urllib.request.urlopen('http://localhost:3006/health').getcode() == 200 else 1)"

CMD ["python", "src/main.py"]
