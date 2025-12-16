#!/bin/bash

# 启动 oral_app 项目的脚本

# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting oral_app project...${NC}"

# 检查 Docker 是否运行
if ! docker info >/dev/null 2>&1; then
  echo -e "${RED}Error: Docker is not running. Please start Docker first.${NC}"
  exit 1
fi

# 构建并启动所有服务
echo -e "${YELLOW}Building and starting services with Docker Compose...${NC}"
docker compose up -d --build

# 检查服务是否启动成功
if [ $? -eq 0 ]; then
  echo -e "${GREEN}All services started successfully!${NC}"
  echo -e "${YELLOW}You can access the application at: http://localhost${NC}"
  echo -e "${YELLOW}API Gateway (Nginx) is running on port 80${NC}"
  echo -e "${YELLOW}Frontend development server is running on port 3000${NC}"
  echo -e "${YELLOW}To view logs, run: docker compose logs -f${NC}"
else
  echo -e "${RED}Failed to start services. Check the logs for more information.${NC}"
  exit 1
fi