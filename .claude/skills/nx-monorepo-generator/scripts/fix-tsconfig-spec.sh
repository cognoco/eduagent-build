#!/bin/bash
# Fixes tsconfig.spec.json module resolution after Jest generator
# Usage: fix-tsconfig-spec.sh <project-path>
# Example: fix-tsconfig-spec.sh apps/web

set -e

PROJECT_PATH="${1:-.}"
TSCONFIG_SPEC="$PROJECT_PATH/tsconfig.spec.json"

if [ ! -f "$TSCONFIG_SPEC" ]; then
    echo "❌ Error: $TSCONFIG_SPEC not found"
    exit 1
fi

echo "Fixing TypeScript module resolution in: $TSCONFIG_SPEC"

# Create backup
cp "$TSCONFIG_SPEC" "$TSCONFIG_SPEC.bak"

# Fix module and moduleResolution using sed
# Handle both quoted formats: "key": "value" and "key":"value"
sed -i 's/"module":\s*"commonjs"/"module": "nodenext"/g' "$TSCONFIG_SPEC"
sed -i 's/"moduleResolution":\s*"node10"/"moduleResolution": "nodenext"/g' "$TSCONFIG_SPEC"
sed -i 's/"moduleResolution":\s*"node"/"moduleResolution": "nodenext"/g' "$TSCONFIG_SPEC"

# Verify the fix
if grep -q '"nodenext"' "$TSCONFIG_SPEC"; then
    echo "✅ Fixed: module and moduleResolution set to 'nodenext'"
    rm "$TSCONFIG_SPEC.bak"
else
    echo "⚠️  Warning: Could not verify fix. Check $TSCONFIG_SPEC manually."
    echo "   Backup saved as: $TSCONFIG_SPEC.bak"
fi

echo ""
echo "Run validation: validate-jest-config.sh $PROJECT_PATH"
