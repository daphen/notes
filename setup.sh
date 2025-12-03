#!/usr/bin/env bash
#
# Local Development Setup
# For production deployment, use the Vercel Deploy button in README.md
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBAPP_DIR="$SCRIPT_DIR/webapp"
CLI_DIR="$SCRIPT_DIR/cli"

print_header() {
    echo ""
    echo -e "${CYAN}╭─────────────────────────────────────────────────────╮${NC}"
    echo -e "${CYAN}│${NC}  ${BOLD}$1${NC}"
    echo -e "${CYAN}╰─────────────────────────────────────────────────────╯${NC}"
    echo ""
}

print_step() { echo -e "  ${BLUE}→${NC} $1"; }
print_success() { echo -e "  ${GREEN}✓${NC} $1"; }
print_error() { echo -e "  ${RED}✗${NC} $1"; exit 1; }
print_warning() { echo -e "  ${YELLOW}!${NC} $1"; }

# Check prerequisites
check_prereqs() {
    print_header "Checking Prerequisites"

    command -v node &>/dev/null && print_success "Node.js $(node --version)" || print_error "Node.js required"
    command -v go &>/dev/null && print_success "Go $(go version | awk '{print $3}')" || print_error "Go required"

    if command -v pnpm &>/dev/null; then
        print_success "pnpm $(pnpm --version)"
        PKG_MANAGER="pnpm"
    elif command -v npm &>/dev/null; then
        print_success "npm $(npm --version)"
        PKG_MANAGER="npm"
    else
        print_error "pnpm or npm required"
    fi
}

# Setup webapp
setup_webapp() {
    print_header "Setting Up Webapp"

    cd "$WEBAPP_DIR"

    # Check for .env.local
    if [[ ! -f .env.local ]]; then
        print_step "Creating .env.local..."

        echo -e -n "  ${BOLD}Database URL${NC} (PostgreSQL): "
        read -r db_url

        echo -e -n "  ${BOLD}Password${NC}: "
        read -rs password
        echo ""

        jwt_secret=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)

        cat > .env.local << EOF
DATABASE_URL=$db_url
JWT_SECRET=$jwt_secret
AUTH_PASSWORD=$password
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF
        print_success "Created .env.local"
    else
        print_success ".env.local already exists"
    fi

    print_step "Installing dependencies..."
    $PKG_MANAGER install
    print_success "Dependencies installed"

    print_step "Pushing database schema..."
    $PKG_MANAGER run db:push
    print_success "Database ready"
}

# Build CLI
build_cli() {
    print_header "Building CLI"

    cd "$CLI_DIR"

    print_step "Building notes-cli..."
    go build -o notes-cli ./cmd/notes-cli
    print_success "Built notes-cli"

    # Install to ~/.local/bin
    mkdir -p "$HOME/.local/bin"
    cp notes-cli "$HOME/.local/bin/"
    print_success "Installed to ~/.local/bin/notes-cli"
}

# Configure CLI
configure_cli() {
    print_header "Configuring CLI"

    local config_dir="$HOME/.config/notes-cli"
    mkdir -p "$config_dir"

    # Get password from webapp config
    local password=$(grep AUTH_PASSWORD "$WEBAPP_DIR/.env.local" | cut -d'=' -f2)

    echo -e -n "  ${BOLD}Notes directory${NC} [~/notes]: "
    read -r notes_dir
    notes_dir="${notes_dir:-$HOME/notes}"
    notes_dir="${notes_dir/#\~/$HOME}"
    mkdir -p "$notes_dir"

    cat > "$config_dir/config.toml" << EOF
api_url = "http://localhost:3000"
auth_password = "$password"
notes_dir = "$notes_dir"
client_id = "notes-cli-dev"
EOF

    print_success "Config saved to $config_dir/config.toml"
}

# Print done
print_done() {
    print_header "Setup Complete!"

    echo -e "  ${BOLD}Start the webapp:${NC}"
    echo -e "    ${CYAN}cd webapp && $PKG_MANAGER dev${NC}"
    echo ""
    echo -e "  ${BOLD}In another terminal, run the CLI:${NC}"
    echo -e "    ${CYAN}notes-cli${NC}"
    echo ""
}

main() {
    print_header "Local Development Setup"
    echo -e "  ${DIM}For production, use the Deploy to Vercel button in README${NC}"

    check_prereqs
    setup_webapp
    build_cli
    configure_cli
    print_done
}

main "$@"
