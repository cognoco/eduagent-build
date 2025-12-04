#!/bin/bash
# Installs testing enhancement libraries based on project type
# Usage: install-testing-libs.sh <project-type> <project-path>
# Example: install-testing-libs.sh ui apps/web
#          install-testing-libs.sh node apps/server
#          install-testing-libs.sh logic packages/schemas

set -e

PROJECT_TYPE="${1:-}"
PROJECT_PATH="${2:-.}"

if [ -z "$PROJECT_TYPE" ]; then
    echo "Usage: install-testing-libs.sh <project-type> <project-path>"
    echo ""
    echo "Project types:"
    echo "  ui     - Full testing stack (jest-dom, user-event, msw)"
    echo "  node   - Node.js projects (jest-dom, msw)"
    echo "  logic  - Pure logic packages (no enhancements needed)"
    exit 1
fi

cd "$PROJECT_PATH"

case "$PROJECT_TYPE" in
    ui)
        echo "Installing UI testing enhancements..."
        pnpm add --save-dev @testing-library/jest-dom @testing-library/user-event msw
        echo ""
        echo "✅ Installed: @testing-library/jest-dom, @testing-library/user-event, msw"
        echo ""
        echo "Next steps:"
        echo "  1. Create jest.setup.ts with: import '@testing-library/jest-dom';"
        echo "  2. Add to jest.config.ts: setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']"
        ;;
    node)
        echo "Installing Node.js testing enhancements..."
        pnpm add --save-dev @testing-library/jest-dom msw
        echo ""
        echo "✅ Installed: @testing-library/jest-dom, msw"
        echo ""
        echo "Note: MSW is optional for Node projects. Only use if testing HTTP endpoints."
        ;;
    logic)
        echo "Logic package - no testing enhancements needed."
        echo "Basic Jest is sufficient for pure function tests."
        ;;
    *)
        echo "❌ Unknown project type: $PROJECT_TYPE"
        echo "Valid types: ui, node, logic"
        exit 1
        ;;
esac
