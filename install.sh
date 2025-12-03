#!/usr/bin/env bash
#
# Notes CLI Installer
# Usage: curl -sSL https://raw.githubusercontent.com/daphen/notes/main/install.sh | bash
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Config
REPO="daphen/notes"
BINARY_NAME="notes-cli"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
CONFIG_DIR="$HOME/.config/notes-cli"

print_banner() {
    echo ""
    echo -e "${CYAN}╭─────────────────────────────────────╮${NC}"
    echo -e "${CYAN}│${NC}  ${BOLD}Notes CLI Installer${NC}               ${CYAN}│${NC}"
    echo -e "${CYAN}╰─────────────────────────────────────╯${NC}"
    echo ""
}

print_step() {
    echo -e "  ${BLUE}→${NC} $1"
}

print_success() {
    echo -e "  ${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "  ${RED}✗${NC} $1"
    exit 1
}

print_warning() {
    echo -e "  ${YELLOW}!${NC} $1"
}

# Detect OS and architecture
detect_platform() {
    local os arch

    case "$(uname -s)" in
        Linux*)  os="linux" ;;
        Darwin*) os="darwin" ;;
        MINGW*|MSYS*|CYGWIN*) os="windows" ;;
        *) print_error "Unsupported OS: $(uname -s)" ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64) arch="amd64" ;;
        aarch64|arm64) arch="arm64" ;;
        armv7l) arch="arm" ;;
        *) print_error "Unsupported architecture: $(uname -m)" ;;
    esac

    echo "${os}_${arch}"
}

# Get latest release version
get_latest_version() {
    curl -sSL "https://api.github.com/repos/${REPO}/releases/latest" |
        grep '"tag_name"' |
        sed -E 's/.*"([^"]+)".*/\1/'
}

# Download and install binary
install_binary() {
    local platform="$1"
    local version="$2"
    local ext=""

    [[ "$platform" == windows_* ]] && ext=".exe"

    local filename="${BINARY_NAME}_${version}_${platform}${ext}"
    local url="https://github.com/${REPO}/releases/download/${version}/${filename}"
    local tmp_file="/tmp/${filename}"

    print_step "Downloading ${BINARY_NAME} ${version} for ${platform}..."

    if curl -sSL -o "$tmp_file" "$url" 2>/dev/null; then
        print_success "Downloaded"
    else
        # Fallback: try to build from source
        print_warning "Pre-built binary not found, building from source..."
        build_from_source
        return
    fi

    # Create install directory
    mkdir -p "$INSTALL_DIR"

    # Install binary
    mv "$tmp_file" "${INSTALL_DIR}/${BINARY_NAME}"
    chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

    print_success "Installed to ${INSTALL_DIR}/${BINARY_NAME}"
}

# Fallback: build from source
build_from_source() {
    if ! command -v go &> /dev/null; then
        print_error "Go is required to build from source. Install Go and try again."
    fi

    print_step "Cloning repository..."
    local tmp_dir=$(mktemp -d)
    git clone --depth 1 "https://github.com/${REPO}.git" "$tmp_dir" 2>/dev/null

    print_step "Building..."
    cd "$tmp_dir/cli"
    go build -o "${INSTALL_DIR}/${BINARY_NAME}" ./cmd/notes-cli
    chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

    rm -rf "$tmp_dir"
    print_success "Built and installed to ${INSTALL_DIR}/${BINARY_NAME}"
}

# Configure the CLI
configure_cli() {
    echo ""
    echo -e "${BOLD}Configuration${NC}"
    echo -e "${DIM}Enter your webapp details to connect the CLI${NC}"
    echo ""

    # Get API URL
    echo -e -n "  ${BOLD}Webapp URL${NC} (e.g., https://notes-abc.vercel.app): "
    read -r api_url

    if [[ -z "$api_url" ]]; then
        print_error "URL is required"
    fi

    # Remove trailing slash
    api_url="${api_url%/}"

    # Get password
    echo -e -n "  ${BOLD}Password${NC}: "
    read -rs auth_password
    echo ""

    if [[ -z "$auth_password" ]]; then
        print_error "Password is required"
    fi

    # Get notes directory
    echo -e -n "  ${BOLD}Notes directory${NC} [~/notes]: "
    read -r notes_dir
    notes_dir="${notes_dir:-$HOME/notes}"
    notes_dir="${notes_dir/#\~/$HOME}"

    # Create config
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$notes_dir"

    cat > "$CONFIG_DIR/config.toml" << EOF
api_url = "$api_url"
auth_password = "$auth_password"
notes_dir = "$notes_dir"
client_id = "notes-cli-$(hostname)"
EOF

    print_success "Config saved to $CONFIG_DIR/config.toml"
}

# Test connection
test_connection() {
    local api_url=$(grep 'api_url' "$CONFIG_DIR/config.toml" | cut -d'"' -f2)
    local password=$(grep 'auth_password' "$CONFIG_DIR/config.toml" | cut -d'"' -f2)

    print_step "Testing connection..."

    local http_code=$(curl -sSL -o /dev/null -w "%{http_code}" \
        -X POST "$api_url/api/auth" \
        -H "Content-Type: application/json" \
        -d "{\"password\":\"$password\"}" 2>/dev/null || echo "000")

    if [[ "$http_code" == "200" ]]; then
        print_success "Connected successfully!"
    else
        print_warning "Could not verify connection (HTTP $http_code)"
        echo -e "  ${DIM}Check your URL and password, then run: notes-cli -init${NC}"
    fi
}

# Check if in PATH
check_path() {
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        echo ""
        print_warning "$INSTALL_DIR is not in your PATH"
        echo ""
        echo -e "  Add this to your ${BOLD}~/.bashrc${NC} or ${BOLD}~/.zshrc${NC}:"
        echo -e "  ${CYAN}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
        echo ""
        echo -e "  Then restart your terminal or run:"
        echo -e "  ${CYAN}source ~/.bashrc${NC}"
    fi
}

# Print success message
print_done() {
    echo ""
    echo -e "${CYAN}╭─────────────────────────────────────╮${NC}"
    echo -e "${CYAN}│${NC}  ${GREEN}Installation complete!${NC}             ${CYAN}│${NC}"
    echo -e "${CYAN}╰─────────────────────────────────────╯${NC}"
    echo ""
    echo -e "  ${BOLD}Quick start:${NC}"
    echo -e "    ${CYAN}notes-cli${NC}         Browse and edit notes"
    echo -e "    ${CYAN}notes-cli -pull${NC}   Pull notes from server"
    echo -e "    ${CYAN}notes-cli -watch${NC}  Auto-sync on changes"
    echo ""
}

# Main
main() {
    print_banner

    # Detect platform
    platform=$(detect_platform)
    print_success "Detected platform: $platform"

    # Get latest version (or use v0.1.0 as fallback)
    version=$(get_latest_version 2>/dev/null || echo "v0.1.0")

    # Install binary
    install_binary "$platform" "$version"

    # Check PATH
    check_path

    # Configure
    configure_cli

    # Test connection
    test_connection

    # Done
    print_done
}

main "$@"
