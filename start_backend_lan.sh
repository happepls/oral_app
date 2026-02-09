#!/bin/bash

# 获取局域网 IP 地址 (Linux)
IP_ADDR=$(hostname -I | awk '{print $1}')

echo "正在启动后端服务..."
echo "当前局域网 IP 地址: $IP_ADDR"
echo "API 基础路径应配置为: http://$IP_ADDR:8080/api"
echo "WebSocket 路径应配置为: ws://$IP_ADDR:8080/api/ws"

# 启动 Docker 容器
docker compose up -d

echo "------------------------------------------------"
echo "服务已启动。请确保手机与电脑处于同一局域网。"
echo "如果无法连接，请检查电脑防火墙是否允许 8080 端口入站。"
echo "------------------------------------------------"
