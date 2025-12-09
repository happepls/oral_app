#!/bin/bash

# Oral App Remote to Local Sync Script
# This script ensures remote directory files sync to local project path

set -e

# Configuration
REMOTE_HOST="ser74785.ddns.net"
REMOTE_USER="kennys"
REMOTE_PATH="/home/kennys/IdeaProjects/oral_app"
LOCAL_PATH="/Users/sgcc-work/IdeaProjects/oral_app"
SSH_CONFIG="$LOCAL_PATH/.ssh/config"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if SSH config exists
if [[ -f "$SSH_CONFIG" ]]; then
    log_info "Using SSH config from: $SSH_CONFIG"
    SSH_OPTS="-F $SSH_CONFIG oral-app-remote"
else
    log_warn "SSH config not found, using direct connection"
    SSH_OPTS="$REMOTE_USER@$REMOTE_HOST"
fi

# Function to sync specific directories
sync_directory() {
    local dir_name="$1"
    local exclude_opts=""
    
    case "$dir_name" in
        "node_modules")
            log_info "Skipping $dir_name (excluded)"
            return 0
            ;;
        ".git")
            log_info "Skipping $dir_name (excluded)"
            return 0
            ;;
        "dist"|"build")
            log_info "Skipping $dir_name (excluded)"
            return 0
            ;;
    esac
    
    log_info "Syncing $dir_name..."
    
    # Check if remote directory exists and is accessible
    if ! ssh $SSH_OPTS "test -d '$REMOTE_PATH/$dir_name' -a -r '$REMOTE_PATH/$dir_name'"; then
        log_warn "Directory $dir_name not found or not accessible on remote, skipping"
        return 0
    fi
    
    # Create local directory if it doesn't exist
    mkdir -p "$LOCAL_PATH/$dir_name"
    
    # Use rsync for efficient sync
    if ! rsync -avz --delete \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='*.log' \
        --exclude='.DS_Store' \
        --exclude='dist' \
        --exclude='build' \
        -e "ssh -F $SSH_CONFIG" \
        "oral-app-remote:$REMOTE_PATH/$dir_name/" "$LOCAL_PATH/$dir_name/"; then
        log_error "Failed to sync directory: $dir_name"
        return 1
    fi
}

# Function to check remote connection
check_remote_connection() {
    log_info "Checking remote connection..."
    if ssh $SSH_OPTS "test -d $REMOTE_PATH"; then
        log_info "Remote connection successful"
        return 0
    else
        log_error "Cannot connect to remote or path doesn't exist"
        return 1
    fi
}

# Function to show sync summary
show_summary() {
    log_info "=== Sync Summary ==="
    echo "Local path: $LOCAL_PATH"
    echo "Remote path: $REMOTE_PATH"
    echo "Last sync: $(date)"
    echo "===================="
}

# Main sync function
main_sync() {
    log_info "Starting remote to local sync..."
    
    # Check connection first
    if ! check_remote_connection; then
        exit 1
    fi
    
    # Get list of directories to sync from remote
    log_info "Getting directory list from remote..."
    
    # Use a more robust approach to get accessible directories
    DIRS=$(ssh $SSH_OPTS "cd $REMOTE_PATH && ls -1d */ 2>/dev/null | sed 's|/$||' | grep -v '^\\.'")
    
    if [[ -z "$DIRS" ]]; then
        log_error "No accessible directories found on remote"
        exit 1
    fi
    
    log_info "Found accessible directories: $DIRS"
    
    # Sync each directory
    for dir in $DIRS; do
        sync_directory "$dir"
    done
    
    # Sync root files
    log_info "Syncing root files..."
    rsync -avz --delete \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='*.log' \
        --exclude='.DS_Store' \
        -e "ssh -F $SSH_CONFIG" \
        "oral-app-remote:$REMOTE_PATH/" "$LOCAL_PATH/" \
        --include='*/' \
        --include='*.json' \
        --include='*.js' \
        --include='*.md' \
        --include='*.yml' \
        --include='*.yaml' \
        --include='Dockerfile' \
        --include='.gitignore' \
        --exclude='*'
    
    show_summary
    log_info "Sync completed successfully!"
}

# Function for continuous sync (watch mode)
watch_sync() {
    log_info "Starting watch mode (sync every 30 seconds)..."
    while true; do
        main_sync
        sleep 30
    done
}

# Function for one-time sync
one_time_sync() {
    main_sync
}

# Parse command line arguments
case "${1:-}" in
    "--watch"|"-w")
        watch_sync
        ;;
    "--help"|"-h")
        echo "Usage: $0 [OPTIONS]"
        echo "Options:"
        echo "  -w, --watch    Continuous sync mode"
        echo "  -h, --help     Show this help"
        echo ""
        echo "Examples:"
        echo "  $0              One-time sync"
        echo "  $0 --watch      Continuous sync every 30 seconds"
        ;;
    *)
        one_time_sync
        ;;
esac