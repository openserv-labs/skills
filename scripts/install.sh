#!/bin/bash

# OpenServ Cursor Skills Installer
# This script copies OpenServ skills to ~/.cursor/skills/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CURSOR_SKILLS_DIR="$HOME/.cursor/skills"

# All available skills
ALL_SKILLS=(
    "openserv-agent-sdk"
    "openserv-client"
    "openserv-launch"
    "openserv-multi-agent-workflows"
    "openserv-ideaboard-api"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

install_skill() {
    local skill=$1
    local source_path="$REPO_DIR/skills/$skill"
    local target_path="$CURSOR_SKILLS_DIR/$skill"

    # Check if skill exists in repo
    if [ ! -d "$source_path" ]; then
        print_error "Skill '$skill' not found in repository"
        return 1
    fi

    # Remove existing installation (symlink or directory)
    if [ -L "$target_path" ]; then
        print_warning "$skill exists as symlink, replacing with copy..."
        rm "$target_path"
    elif [ -d "$target_path" ]; then
        print_warning "$skill already exists, updating..."
        rm -rf "$target_path"
    fi

    # Copy skill directory
    cp -r "$source_path" "$target_path"
    print_success "Installed $skill"
}

main() {
    echo "OpenServ Cursor Skills Installer"
    echo "================================="
    echo ""

    # Create cursor skills directory if needed
    if [ ! -d "$CURSOR_SKILLS_DIR" ]; then
        mkdir -p "$CURSOR_SKILLS_DIR"
        print_success "Created $CURSOR_SKILLS_DIR"
    fi

    # Determine which skills to install
    local skills_to_install=()
    
    if [ $# -eq 0 ]; then
        # No arguments - install all skills
        skills_to_install=("${ALL_SKILLS[@]}")
        echo "Installing all skills..."
    else
        # Specific skills requested
        skills_to_install=("$@")
        echo "Installing specified skills..."
    fi

    echo ""

    # Install each skill
    local failed=0
    for skill in "${skills_to_install[@]}"; do
        if ! install_skill "$skill"; then
            ((failed++))
        fi
    done

    echo ""
    
    if [ $failed -eq 0 ]; then
        print_success "Installation complete!"
        echo ""
        echo "Skills are now available in Cursor. You may need to restart Cursor for changes to take effect."
    else
        print_error "Installation completed with $failed error(s)"
        exit 1
    fi
}

main "$@"
