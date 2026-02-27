#!/bin/bash

# Development Deployment Script for Oral AI Application
# This script sets up the development environment

set -e  # Exit immediately if a command exits with a non-zero status

# Environment variables
ENVIRONMENT="development"
DOCKER_COMPOSE_FILE="docker-compose.dev.yml"
LOG_FILE="./logs/dev-deploy-$(date +%Y%m%d).log"

# Create logs directory if it doesn't exist
mkdir -p ./logs

# Function to log messages
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        log "ERROR: Docker is not installed"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log "ERROR: Docker Compose is not installed"
        exit 1
    fi
    
    log "Prerequisites check passed"
}

# Function to build images
build_images() {
    log "Building Docker images..."
    
    # Build all images defined in the docker-compose file
    docker-compose -f "$DOCKER_COMPOSE_FILE" build
    
    log "Images built successfully"
}

# Function to start services
start_services() {
    log "Starting services..."
    
    # Start all services in detached mode
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    
    log "Services started"
}

# Function to run development setup
setup_dev_environment() {
    log "Setting up development environment..."
    
    # Wait for services to start
    sleep 10
    
    # Run database migrations if needed
    log "Running database setup..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T user-service npm run migrate || log "Migration not needed or failed"
    
    log "Development environment setup completed"
}

# Function to run health checks
run_health_checks() {
    log "Running health checks..."
    
    # Wait a bit for services to start
    sleep 20
    
    # Check if services are running
    SERVICES=("api-gateway" "user-service" "comms-service" "ai-omni-service" "history-analytics-service" "media-processing-service")
    
    for service in "${SERVICES[@]}"; do
        if docker-compose -f "$DOCKER_COMPOSE_FILE" ps | grep -q "$service.*Up"; then
            log "✓ $service is running"
        else
            log "✗ $service is not running"
            return 1
        fi
    done
    
    # Additional health checks can be added here
    # Example: Check if API gateway is responding
    if curl -f http://localhost:8080/api/health > /dev/null 2>&1; then
        log "✓ API Gateway health check passed"
    else
        log "✗ API Gateway health check failed"
        return 1
    fi
    
    log "All health checks passed"
}

# Function to tail logs
tail_logs() {
    log "Tailing service logs..."
    
    # Tail logs from all services
    docker-compose -f "$DOCKER_COMPOSE_FILE" logs -f
}

# Main setup function
setup() {
    log "Setting up development environment"
    
    check_prerequisites
    build_images
    start_services
    setup_dev_environment
    run_health_checks
    
    log "Development environment setup completed successfully"
}

# Function to stop services
stop() {
    log "Stopping development services..."
    
    docker-compose -f "$DOCKER_COMPOSE_FILE" down
    
    log "Services stopped"
}

# Function to reset environment
reset() {
    log "Resetting development environment..."
    
    docker-compose -f "$DOCKER_COMPOSE_FILE" down -v  # -v removes volumes too
    
    log "Environment reset completed"
}

# Parse command line arguments
case "$1" in
    setup)
        setup
        ;;
    start)
        start_services
        ;;
    stop)
        stop
        ;;
    reset)
        reset
        ;;
    logs)
        tail_logs
        ;;
    health-check)
        run_health_checks
        ;;
    *)
        echo "Usage: $0 {setup|start|stop|reset|logs|health-check}"
        exit 1
        ;;
esac