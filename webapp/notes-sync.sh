#!/bin/bash

# Notes Sync - watches storage/ folder and syncs to API

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
STORAGE_DIR="$PROJECT_DIR/storage"
CONFIG_FILE="$PROJECT_DIR/sync.conf"

# Load config
if [[ -f "$CONFIG_FILE" ]]; then
  source "$CONFIG_FILE"
else
  echo "Error: Config file not found at $CONFIG_FILE"
  echo "Create it with API_URL and AUTH_PASSWORD"
  exit 1
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[sync]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[sync]${NC} $1"; }
log_error() { echo -e "${RED}[sync]${NC} $1"; }

# Get auth token
get_token() {
  local response
  response=$(curl -s -X POST "$API_URL/api/auth" \
    -H "Content-Type: application/json" \
    -d "{\"password\": \"$AUTH_PASSWORD\"}" \
    -c - 2>/dev/null | grep notes-auth | awk '{print $7}')
  echo "$response"
}

# Sync a single file
sync_file() {
  local filepath="$1"
  local filename=$(basename "$filepath")
  local relative_path="${filepath#$STORAGE_DIR/}"
  local title="${filename%.md}"
  local content=$(cat "$filepath")

  log_info "Syncing: $relative_path"

  local response
  response=$(curl -s -X POST "$API_URL/api/sync" \
    -H "Content-Type: application/json" \
    -H "Cookie: notes-auth=$AUTH_TOKEN" \
    -d "{
      \"clientId\": \"linux-cli\",
      \"changes\": [{
        \"path\": \"$relative_path\",
        \"content\": $(echo "$content" | jq -Rs .),
        \"action\": \"update\"
      }]
    }")

  if echo "$response" | grep -q '"accepted"'; then
    log_info "✓ Synced: $relative_path"
  else
    log_error "✗ Failed: $relative_path"
    log_error "$response"
  fi
}

# Pull all notes from server
pull_notes() {
  log_info "Pulling notes from server..."

  local response
  response=$(curl -s "$API_URL/api/sync" \
    -H "Cookie: notes-auth=$AUTH_TOKEN")

  echo "$response" | jq -r '.changes[]? | "\(.path)\t\(.content)"' | while IFS=$'\t' read -r path content; do
    if [[ -n "$path" && -n "$content" ]]; then
      local filepath="$STORAGE_DIR/$path"
      mkdir -p "$(dirname "$filepath")"
      echo "$content" > "$filepath"
      log_info "✓ Pulled: $path"
    fi
  done

  log_info "Pull complete"
}

# Watch for changes
watch_changes() {
  log_info "Watching $STORAGE_DIR for changes..."
  log_info "Press Ctrl+C to stop"

  inotifywait -m -r -e close_write -e moved_to --format '%w%f' "$STORAGE_DIR" | while read filepath; do
    if [[ "$filepath" == *.md ]]; then
      sleep 0.5  # Debounce
      sync_file "$filepath"
    fi
  done
}

# Main
case "${1:-watch}" in
  watch)
    AUTH_TOKEN=$(get_token)
    if [[ -z "$AUTH_TOKEN" ]]; then
      log_error "Failed to authenticate. Check your credentials."
      exit 1
    fi
    log_info "Authenticated successfully"
    watch_changes
    ;;
  push)
    AUTH_TOKEN=$(get_token)
    if [[ -z "$AUTH_TOKEN" ]]; then
      log_error "Failed to authenticate"
      exit 1
    fi
    log_info "Pushing all notes..."
    find "$STORAGE_DIR" -name "*.md" -type f | while read filepath; do
      sync_file "$filepath"
    done
    ;;
  pull)
    AUTH_TOKEN=$(get_token)
    if [[ -z "$AUTH_TOKEN" ]]; then
      log_error "Failed to authenticate"
      exit 1
    fi
    pull_notes
    ;;
  *)
    echo "Usage: notes-sync [watch|push|pull]"
    echo ""
    echo "Commands:"
    echo "  watch  - Watch for file changes and sync (default)"
    echo "  push   - Push all local notes to server"
    echo "  pull   - Pull all notes from server"
    exit 1
    ;;
esac
