#!/bin/bash

# OpenServ Cursor Skills Importer
# This script imports OpenServ skills from ~/.cursor/skills/ into this repository

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

import_skill() {
    local skill=$1
    local source_path="$CURSOR_SKILLS_DIR/$skill"
    local target_path="$REPO_DIR/$skill"

    # Check if skill exists in ~/.cursor/skills
    if [ -L "$source_path" ]; then
        print_warning "$skill is a symlink in ~/.cursor/skills, skipping (nothing to import)"
        return 0
    elif [ ! -d "$source_path" ]; then
        print_error "Skill '$skill' not found in ~/.cursor/skills"
        return 1
    fi

    # Check if target already exists
    if [ -d "$target_path" ]; then
        print_warning "$skill already exists in repo, updating..."
        rm -rf "$target_path"
    fi

    # Copy skill directory from ~/.cursor/skills to repo
    cp -r "$source_path" "$target_path"
    print_success "Imported $skill from ~/.cursor/skills"
}

main() {
    echo "OpenServ Cursor Skills Importer"
    echo "================================"
    echo ""

    # Check if cursor skills directory exists
    if [ ! -d "$CURSOR_SKILLS_DIR" ]; then
        print_error "Cursor skills directory does not exist: $CURSOR_SKILLS_DIR"
        exit 1
    fi

    # Determine which skills to import
    local skills_to_import=()
    
    if [ $# -eq 0 ]; then
        # No arguments - import all skills
        skills_to_import=("${ALL_SKILLS[@]}")
        echo "Importing all skills from ~/.cursor/skills..."
    else
        # Specific skills requested
        skills_to_import=("$@")
        echo "Importing specified skills..."
    fi

    echo ""

    # Import each skill
    local failed=0
    for skill in "${skills_to_import[@]}"; do
        if ! import_skill "$skill"; then
            ((failed++))
        fi
    done

    echo ""
    
    if [ $failed -eq 0 ]; then
        print_success "Import complete!"
        echo ""
        echo "Skills have been imported from ~/.cursor/skills into this repository."
        echo "You can now commit the changes with git."
    else
        print_error "Import completed with $failed error(s)"
        exit 1
    fi
}

main "$@"
