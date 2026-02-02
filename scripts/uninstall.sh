#!/bin/bash

# OpenServ Cursor Skills Uninstaller
# This script removes OpenServ skills from ~/.cursor/skills/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

uninstall_skill() {
    local skill=$1
    local target_path="$CURSOR_SKILLS_DIR/$skill"

    # Remove symlink or directory
    if [ -L "$target_path" ]; then
        rm "$target_path"
        print_success "Uninstalled $skill (was symlink)"
    elif [ -d "$target_path" ]; then
        rm -rf "$target_path"
        print_success "Uninstalled $skill"
    else
        print_warning "$skill is not installed"
    fi
}

main() {
    echo "OpenServ Cursor Skills Uninstaller"
    echo "==================================="
    echo ""

    # Check if cursor skills directory exists
    if [ ! -d "$CURSOR_SKILLS_DIR" ]; then
        print_warning "Cursor skills directory does not exist"
        exit 0
    fi

    # Determine which skills to uninstall
    local skills_to_uninstall=()
    
    if [ $# -eq 0 ]; then
        # No arguments - uninstall all skills
        skills_to_uninstall=("${ALL_SKILLS[@]}")
        echo "Uninstalling all OpenServ skills..."
    else
        # Specific skills requested
        skills_to_uninstall=("$@")
        echo "Uninstalling specified skills..."
    fi

    echo ""

    # Uninstall each skill
    for skill in "${skills_to_uninstall[@]}"; do
        uninstall_skill "$skill"
    done

    echo ""
    print_success "Uninstallation complete!"
}

main "$@"
