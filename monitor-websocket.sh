#!/bin/bash

# WebSocket连接监控脚本
# 用于持续监控WebSocket连接状态和性能

set -e

# 配置
COMMS_SERVICE_URL="ws://localhost:8080/api/ws/"
AI_SERVICE_HEALTH="http://localhost:8082/health"
COMMS_SERVICE_HEALTH="http://localhost:3001/health"
LOG_FILE="/tmp/websocket-monitor.log"
MAX_RETRIES=3
RETRY_DELAY=5

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        ERROR)
            echo -e "${RED}[$timestamp] [ERROR] $message${NC}" | tee -a "$LOG_FILE"
            ;;
        SUCCESS)
            echo -e "${GREEN}[$timestamp] [SUCCESS] $message${NC}" | tee -a "$LOG_FILE"
            ;;
        WARN)
            echo -e "${YELLOW}[$timestamp] [WARN] $message${NC}" | tee -a "$LOG_FILE"
            ;;
        INFO)
            echo -e "${BLUE}[$timestamp] [INFO] $message${NC}" | tee -a "$LOG_FILE"
            ;;
        *)
            echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
            ;;
    esac
}

# 健康检查
check_health() {
    local url=$1
    local service=$2
    local retries=0
    
    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            log SUCCESS "$service health check passed"
            return 0
        else
            log WARN "$service health check failed (attempt $((retries + 1))/$MAX_RETRIES)"
            retries=$((retries + 1))
            sleep $RETRY_DELAY
        fi
    done
    
    log ERROR "$service health check failed after $MAX_RETRIES attempts"
    return 1
}

# WebSocket连接测试
test_websocket() {
    local test_id="monitor-$(date +%s)"
    local token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjFjYWIxYWVjLTA1YjEtNGVlZS04ODcxLTRmZGUwODdmYzZkZCIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3NzIxMTQyMjgsImV4cCI6MTc3MjIwMDYyOCwiYXVkIjoib3JhbC1hcHAtdXNlcnMiLCJpc3MiOiJvcmFsLWFwcCJ9.ZOgLiN7q5A0onB-z9JfDmqnywCAhNhlRNRIj67uxxhE"
    
    log INFO "Testing WebSocket connection with ID: $test_id"
    
    # 使用Node.js进行WebSocket测试
    node -e "
        const WebSocket = require('ws');
        const ws = new WebSocket('$COMMS_SERVICE_URL?token=$token&sessionId=$test_id&voice=Serena');
        
        let connected = false;
        let messagesReceived = 0;
        const startTime = Date.now();
        
        ws.on('open', () => {
            connected = true;
            console.log('WebSocket connected successfully');
            ws.send(JSON.stringify({
                type: 'session_start',
                userId: 'monitor-user',
                sessionId: '$test_id'
            }));
        });
        
        ws.on('message', (data) => {
            messagesReceived++;
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'connection_established') {
                    console.log('AI service connection established');
                }
            } catch (e) {
                console.log('Received message:', data.toString().substring(0, 100));
            }
            
            if (messagesReceived >= 2) {
                ws.close(1000, 'Test completed');
            }
        });
        
        ws.on('error', (error) => {
            console.error('WebSocket error:', error.message);
            process.exit(1);
        });
        
        ws.on('close', (code, reason) => {
            const duration = Date.now() - startTime;
            if (connected && messagesReceived > 0) {
                console.log(\`Test successful: connected=\${connected}, messages=\${messagesReceived}, duration=\${duration}ms\`);
                process.exit(0);
            } else {
                console.error(\`Test failed: connected=\${connected}, messages=\${messagesReceived}, closeCode=\${code}\`);
                process.exit(1);
            }
        });
        
        // 超时处理
        setTimeout(() => {
            console.error('Test timeout');
            ws.close(1000, 'Test timeout');
            process.exit(1);
        }, 10000);
    "
}

# 主监控函数
monitor() {
    log INFO "Starting WebSocket connection monitoring..."
    
    while true; do
        log INFO "--- Starting monitoring cycle ---"
        
        # 健康检查
        if ! check_health "$AI_SERVICE_HEALTH" "AI Service"; then
            log ERROR "AI Service is unhealthy, skipping WebSocket test"
            sleep 60
            continue
        fi
        
        if ! check_health "$COMMS_SERVICE_HEALTH" "Comms Service"; then
            log ERROR "Comms Service is unhealthy, skipping WebSocket test"
            sleep 60
            continue
        fi
        
        # WebSocket连接测试
        if test_websocket; then
            log SUCCESS "WebSocket connection test passed"
        else
            log ERROR "WebSocket connection test failed"
            # 可以在这里添加告警机制
        fi
        
        log INFO "--- Monitoring cycle complete ---"
        sleep 300  # 5分钟间隔
    done
}

# 显示帮助
show_help() {
    echo "WebSocket连接监控脚本"
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示帮助信息"
    echo "  -d, --daemon   后台运行模式"
    echo "  -l, --log      显示日志文件路径"
    echo "  -c, --check    执行一次检查并退出"
    echo ""
    echo "日志文件: $LOG_FILE"
}

# 单次检查模式
single_check() {
    log INFO "Performing single connection check..."
    
    # 健康检查
    ai_healthy=false
    comms_healthy=false
    
    if check_health "$AI_SERVICE_HEALTH" "AI Service"; then
        ai_healthy=true
    fi
    
    if check_health "$COMMS_SERVICE_HEALTH" "Comms Service"; then
        comms_healthy=true
    fi
    
    # WebSocket测试
    if [ "$ai_healthy" = true ] && [ "$comms_healthy" = true ]; then
        if test_websocket; then
            log SUCCESS "All checks passed!"
            exit 0
        else
            log ERROR "WebSocket connection test failed"
            exit 1
        fi
    else
        log ERROR "Health checks failed"
        exit 1
    fi
}

# 主程序
main() {
    case "${1:-}" in
        -h|--help)
            show_help
            ;;
        -d|--daemon)
            log INFO "Starting in daemon mode..."
            monitor > /dev/null 2>&1 &
            echo $! > /tmp/websocket-monitor.pid
            log SUCCESS "Monitor started in background (PID: $(cat /tmp/websocket-monitor.pid))"
            ;;
        -l|--log)
            echo "Log file: $LOG_FILE"
            if [ -f "$LOG_FILE" ]; then
                tail -f "$LOG_FILE"
            else
                echo "No log file found yet"
            fi
            ;;
        -c|--check)
            single_check
            ;;
        *)
            monitor
            ;;
    esac
}

# 确保日志目录存在
mkdir -p "$(dirname "$LOG_FILE")"

# 运行主程序
main "$@"