FROM python:3.10-slim

WORKDIR /app

# NOTE: 不装 gcc/g++ —— requirements.txt 全部依赖在 python:3.10-slim 上
# 都有预编译 wheel（pydantic-core=Rust wheel, uvicorn[standard] 的
# uvloop/httptools/websockets 均有 manylinux wheel, 其余为纯 python）。
# 删除 apt-get 层根治此前 `apt-get update` 走 deb.debian.org 在 CN 网络抖动
# 导致 `E: Unable to locate package gcc` → 整个 build 失败 → pip 层（含 redis）
# 从不执行 → 镜像缺 redis → daily_turns/daily_qa 静默 fail-open 的部署陷阱。
# 若将来新增需编译的依赖，恢复下面的 apt 层（已改阿里云 apt 镜像源，避开
# deb.debian.org 在 CN 网络的抖动）：
# RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' \
#         /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
#     apt-get update && apt-get install -y --no-install-recommends gcc g++ \
#     && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install python dependencies（阿里云 pypi 镜像 + 重试/超时，避免镜像抖动静默漏装）
RUN pip install --no-cache-dir --upgrade pip \
        -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com && \
    pip install --no-cache-dir --retries 5 --timeout 120 -r requirements.txt \
        -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com && \
    python -c "import redis, fastapi, uvicorn, httpx, websockets; print('deps import OK')"

# Copy application code (excluding wheels directory to reduce context)
COPY . .

# Create a non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser && \
    chown -R appuser:appuser /app
USER appuser

EXPOSE 8082
EXPOSE 8081

# Health check using Python's urllib instead of curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; import sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8082/health').getcode() == 200 else 1)"

CMD ["python", "app/main.py"]