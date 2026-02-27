#!/bin/bash

# Production Deployment Script for Oral AI Application
# This script deploys the application to production environment

set -e  # Exit immediately if a command exits with a non-zero status

# Environment variables
ENVIRONMENT="production"
DOCKER_COMPOSE_FILE="docker-compose.prod.yml"
LOG_FILE="/var/log/oral-ai-deploy-${ENVIRONMENT}.log"

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

# Function to backup current deployment
backup_current_deployment() {
    log "Backing up current deployment..."
    
    # Create a timestamped backup of the current docker-compose file
    if [ -f "$DOCKER_COMPOSE_FILE" ]; then
        cp "$DOCKER_COMPOSE_FILE" "${DOCKER_COMPOSE_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
        log "Backup created: ${DOCKER_COMPOSE_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    else
        log "No existing docker-compose file to backup"
    fi
}

# Function to pull latest images
pull_latest_images() {
    log "Pulling latest images..."
    
    # Pull all images defined in the docker-compose file
    docker-compose -f "$DOCKER_COMPOSE_FILE" pull
    
    log "Images pulled successfully"
}

# Function to stop current services
stop_current_services() {
    log "Stopping current services..."
    
    # Stop all services defined in the docker-compose file
    docker-compose -f "$DOCKER_COMPOSE_FILE" down
    
    log "Current services stopped"
}

# Function to start new services
start_new_services() {
    log "Starting new services..."
    
    # Start all services in detached mode
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    
    log "New services started"
}

# Function to run health checks
run_health_checks() {
    log "Running health checks..."
    
    # Wait a bit for services to start
    sleep 30
    
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

# Function to cleanup old images
cleanup_old_images() {
    log "Cleaning up old images..."
    
    # Remove dangling images
    docker image prune -f
    
    # Optionally remove unused images (uncomment if desired)
    # docker image prune -af
    
    log "Cleanup completed"
}

# Main deployment function
deploy() {
    log "Starting deployment to $ENVIRONMENT environment"
    
    check_prerequisites
    backup_current_deployment
    pull_latest_images
    stop_current_services
    start_new_services
    run_health_checks
    cleanup_old_images
    
    log "Deployment to $ENVIRONMENT completed successfully"
}

# Rollback function
rollback() {
    log "Initiating rollback..."
    
    # Stop current services
    docker-compose -f "$DOCKER_COMPOSE_FILE" down
    
    # Start previous version (this would require keeping previous docker-compose files)
    # For now, just restart the current configuration
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    
    log "Rollback completed"
}

# Parse command line arguments
case "$1" in
    deploy)
        deploy
        ;;
    rollback)
        rollback
        ;;
    health-check)
        run_health_checks
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|health-check}"
        exit 1
        ;;
esac