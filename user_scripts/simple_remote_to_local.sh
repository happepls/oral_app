#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 默认配置
DEFAULT_SERVER="8.137.119.190"  # 可以替换为 ser74785.ddns.net
DEFAULT_USER="kennys"
DEFAULT_PORT="3222"
DEFAULT_REMOTE_PATH="/home/kennys/IdeaProjects/oral_app"
LOCAL_PATH="/Users/sgcc-work/IdeaProjects/oral_app"

# 读取参数或使用默认值
SERVER=${1:-$DEFAULT_SERVER}
USER=${2:-$DEFAULT_USER}
PORT=${3:-$DEFAULT_PORT}
REMOTE_PATH=${4:-$DEFAULT_REMOTE_PATH}

echo -e "${GREEN}🚀 开始从远程同步到本地...${NC}"
echo -e "${YELLOW}远程主机: ${USER}@${SERVER}:${PORT}${NC}"
echo -e "${YELLOW}远程路径: ${REMOTE_PATH}${NC}"
echo -e "${YELLOW}本地路径: ${LOCAL_PATH}${NC}"

# 检查SSH连接
echo -e "${GREEN}🔍 检查SSH连接...${NC}"
if ! ssh -p ${PORT} -o ConnectTimeout=5 -o BatchMode=yes ${USER}@${SERVER} "echo 'SSH连接成功'" > /dev/null 2>&1; then
    echo -e "${RED}❌ SSH连接失败，请检查以下设置：${NC}"
    echo -e "${RED}1. 确保服务器IP正确：${SERVER}${NC}"
    echo -e "${RED}2. 确保用户名正确：${USER}${NC}"
    echo -e "${RED}3. 确保你有SSH访问权限${NC}"
    echo -e "${RED}4. 检查服务器是否在线${NC}"
    exit 1
fi

echo -e "${GREEN}✅ SSH连接成功${NC}"

# 同步文件
echo -e "${GREEN}📁 开始同步文件...${NC}"
rsync -avz --progress \
    -e "ssh -p ${PORT}" \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.DS_Store' \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='.env.production' \
    --exclude='logs' \
    --exclude='*.log' \
    --exclude='tmp' \
    --exclude='temp' \
    --exclude='dist' \
    --exclude='build' \
    --exclude='.next' \
    --exclude='coverage' \
    --exclude='.nyc_output' \
    --exclude='.pytest_cache' \
    --exclude='__pycache__' \
    --exclude='.venv' \
    --exclude='tmux-server-*.log' \
    ${USER}@${SERVER}:${REMOTE_PATH}/ ${LOCAL_PATH}/

# 检查特定文件是否同步成功
echo -e "${GREEN}🔍 检查特定文件是否同步成功...${NC}"
if [ -f "${LOCAL_PATH}/test_client.py" ]; then
    echo -e "${GREEN}✅ test_client.py 已成功同步${NC}"
else
    echo -e "${YELLOW}⚠️ test_client.py 未找到，可能不存在于远程服务器${NC}"
fi

# 显示同步统计
echo -e "${GREEN}📊 同步统计${NC}"
echo -e "${YELLOW}远程主机: ${USER}@${SERVER}:${PORT}${NC}"
echo -e "${YELLOW}远程路径: ${REMOTE_PATH}${NC}"
echo -e "${YELLOW}本地路径: ${LOCAL_PATH}${NC}"
echo -e "${GREEN}✅ 同步完成！${NC}"