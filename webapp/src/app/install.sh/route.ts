import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Get the base URL from the request
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const script = generateInstallScript(baseUrl);

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'inline; filename="install.sh"',
    },
  });
}

function generateInstallScript(apiUrl: string): string {
  return `#!/usr/bin/env bash
#
# Notes CLI Installer
# Generated for: ${apiUrl}
#

set -e

# Colors
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
CYAN='\\033[0;36m'
BOLD='\\033[1m'
DIM='\\033[2m'
NC='\\033[0m'

# Config - URL is baked in from the webapp
API_URL="${apiUrl}"
BINARY_NAME="notes-cli"
INSTALL_DIR="\${INSTALL_DIR:-\$HOME/.local/bin}"
CONFIG_DIR="\$HOME/.config/notes-cli"

print_banner() {
    echo ""
    echo -e "\${CYAN}╭─────────────────────────────────────╮\${NC}"
    echo -e "\${CYAN}│\${NC}  \${BOLD}Notes CLI Installer\${NC}               \${CYAN}│\${NC}"
    echo -e "\${CYAN}╰─────────────────────────────────────╯\${NC}"
    echo ""
}

print_step() { echo -e "  \${BLUE}→\${NC} \$1"; }
print_success() { echo -e "  \${GREEN}✓\${NC} \$1"; }
print_error() { echo -e "  \${RED}✗\${NC} \$1"; exit 1; }
print_warning() { echo -e "  \${YELLOW}!\${NC} \$1"; }

detect_platform() {
    local os arch
    case "\$(uname -s)" in
        Linux*)  os="linux" ;;
        Darwin*) os="darwin" ;;
        MINGW*|MSYS*|CYGWIN*) os="windows" ;;
        *) print_error "Unsupported OS: \$(uname -s)" ;;
    esac
    case "\$(uname -m)" in
        x86_64|amd64) arch="amd64" ;;
        aarch64|arm64) arch="arm64" ;;
        armv7l) arch="arm" ;;
        *) print_error "Unsupported architecture: \$(uname -m)" ;;
    esac
    echo "\${os}_\${arch}"
}

download_binary() {
    local platform="\$1"
    local releases_url="https://api.github.com/repos/daphen/notes/releases/latest"

    print_step "Fetching latest release..."

    local version
    version=\$(curl -sSL "\$releases_url" 2>/dev/null | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\\1/' || echo "")

    if [[ -z "\$version" ]]; then
        print_warning "Could not fetch release, building from source..."
        build_from_source
        return
    fi

    local ext=""
    [[ "\$platform" == windows_* ]] && ext=".exe"

    local filename="\${BINARY_NAME}_\${version}_\${platform}\${ext}"
    local download_url="https://github.com/daphen/notes/releases/download/\${version}/\${filename}"

    print_step "Downloading \$BINARY_NAME \$version..."

    mkdir -p "\$INSTALL_DIR"

    if curl -sSL -o "\${INSTALL_DIR}/\${BINARY_NAME}" "\$download_url" 2>/dev/null; then
        chmod +x "\${INSTALL_DIR}/\${BINARY_NAME}"
        print_success "Downloaded to \${INSTALL_DIR}/\${BINARY_NAME}"
    else
        print_warning "Download failed, building from source..."
        build_from_source
    fi
}

build_from_source() {
    if ! command -v go &> /dev/null; then
        print_error "Go is required to build from source. Install Go first."
    fi

    print_step "Cloning repository..."
    local tmp_dir=\$(mktemp -d)
    git clone --depth 1 "https://github.com/daphen/notes.git" "\$tmp_dir" 2>/dev/null

    print_step "Building..."
    cd "\$tmp_dir/cli"
    mkdir -p "\$INSTALL_DIR"
    go build -o "\${INSTALL_DIR}/\${BINARY_NAME}" ./cmd/notes-cli
    chmod +x "\${INSTALL_DIR}/\${BINARY_NAME}"

    rm -rf "\$tmp_dir"
    print_success "Built and installed"
}

configure_cli() {
    echo ""
    echo -e "\${BOLD}Configuration\${NC}"
    echo -e "\${DIM}Server: \${API_URL}\${NC}"
    echo ""

    # Get password
    echo -e -n "  \${BOLD}Enter your password\${NC}: "
    read -rs password
    echo ""

    if [[ -z "\$password" ]]; then
        print_error "Password is required"
    fi

    # Test authentication
    print_step "Verifying credentials..."

    local http_code
    http_code=\$(curl -sSL -o /dev/null -w "%{http_code}" \\
        -X POST "\${API_URL}/api/auth" \\
        -H "Content-Type: application/json" \\
        -d "{\\"password\\":\\"\$password\\"}" 2>/dev/null || echo "000")

    if [[ "\$http_code" != "200" ]]; then
        print_error "Authentication failed. Check your password."
    fi

    print_success "Authenticated!"

    # Get notes directory
    echo ""
    echo -e -n "  \${BOLD}Notes directory\${NC} [~/notes]: "
    read -r notes_dir
    notes_dir="\${notes_dir:-\$HOME/notes}"
    notes_dir="\${notes_dir/#\\~/$HOME}"

    # Create config
    mkdir -p "\$CONFIG_DIR"
    mkdir -p "\$notes_dir"

    cat > "\$CONFIG_DIR/config.toml" << CONF
api_url = "\$API_URL"
auth_password = "\$password"
notes_dir = "\$notes_dir"
client_id = "notes-cli-\$(hostname)"
CONF

    print_success "Config saved"
}

check_path() {
    if [[ ":\$PATH:" != *":\$INSTALL_DIR:"* ]]; then
        echo ""
        print_warning "\$INSTALL_DIR is not in your PATH"
        echo ""
        echo -e "  Add to your \${BOLD}~/.bashrc\${NC} or \${BOLD}~/.zshrc\${NC}:"
        echo -e "  \${CYAN}export PATH=\\"\\\$HOME/.local/bin:\\\$PATH\\"\${NC}"
        echo ""
    fi
}

print_done() {
    echo ""
    echo -e "\${CYAN}╭─────────────────────────────────────╮\${NC}"
    echo -e "\${CYAN}│\${NC}  \${GREEN}Installation complete!\${NC}             \${CYAN}│\${NC}"
    echo -e "\${CYAN}╰─────────────────────────────────────╯\${NC}"
    echo ""
    echo -e "  \${BOLD}Commands:\${NC}"
    echo -e "    \${CYAN}notes-cli\${NC}         Browse notes"
    echo -e "    \${CYAN}notes-cli -pull\${NC}   Pull from server"
    echo -e "    \${CYAN}notes-cli -push\${NC}   Push to server"
    echo -e "    \${CYAN}notes-cli -watch\${NC}  Auto-sync"
    echo ""
}

main() {
    print_banner

    echo -e "  \${DIM}Installing CLI for:\${NC}"
    echo -e "  \${CYAN}\${API_URL}\${NC}"
    echo ""

    platform=\$(detect_platform)
    print_success "Platform: \$platform"

    download_binary "\$platform"
    check_path
    configure_cli
    print_done
}

main "\$@"
`;
}
