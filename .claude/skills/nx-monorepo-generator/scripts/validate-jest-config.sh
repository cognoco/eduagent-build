#!/bin/bash
# Validates Jest configuration for an Nx project against monorepo standards
# Usage: validate-jest-config.sh <project-path>
# Example: validate-jest-config.sh apps/web

set -e

PROJECT_PATH="${1:-.}"
ERRORS=0

echo "Validating Jest configuration for: $PROJECT_PATH"
echo "================================================"

# Check 1: tsconfig.spec.json moduleResolution
if [ -f "$PROJECT_PATH/tsconfig.spec.json" ]; then
    if grep -q '"moduleResolution":\s*"node10"' "$PROJECT_PATH/tsconfig.spec.json" 2>/dev/null || \
       grep -q '"moduleResolution": "node10"' "$PROJECT_PATH/tsconfig.spec.json" 2>/dev/null; then
        echo "❌ FAIL: moduleResolution is 'node10' (should be 'nodenext')"
        ERRORS=$((ERRORS + 1))
    elif grep -q '"moduleResolution"' "$PROJECT_PATH/tsconfig.spec.json" && \
         grep -q 'nodenext' "$PROJECT_PATH/tsconfig.spec.json"; then
        echo "✅ PASS: moduleResolution is 'nodenext'"
    else
        echo "⚠️  WARN: moduleResolution not found in tsconfig.spec.json"
    fi

    # Check module setting
    if grep -q '"module":\s*"commonjs"' "$PROJECT_PATH/tsconfig.spec.json" 2>/dev/null || \
       grep -q '"module": "commonjs"' "$PROJECT_PATH/tsconfig.spec.json" 2>/dev/null; then
        echo "❌ FAIL: module is 'commonjs' (should be 'nodenext')"
        ERRORS=$((ERRORS + 1))
    elif grep -q '"module"' "$PROJECT_PATH/tsconfig.spec.json" && \
         grep -q 'nodenext' "$PROJECT_PATH/tsconfig.spec.json"; then
        echo "✅ PASS: module is 'nodenext'"
    fi

    # Check Jest types
    if grep -q '"jest"' "$PROJECT_PATH/tsconfig.spec.json"; then
        echo "✅ PASS: Jest types included in tsconfig.spec.json"
    else
        echo "❌ FAIL: Jest types missing from tsconfig.spec.json"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "❌ FAIL: tsconfig.spec.json not found"
    ERRORS=$((ERRORS + 1))
fi

# Check 2: Production tsconfig.json should NOT have jest types
if [ -f "$PROJECT_PATH/tsconfig.json" ]; then
    if grep -q '"types".*"jest"' "$PROJECT_PATH/tsconfig.json" 2>/dev/null; then
        echo "❌ FAIL: Production tsconfig.json contains 'jest' in types (pollutes production)"
        ERRORS=$((ERRORS + 1))
    else
        echo "✅ PASS: Production tsconfig.json is clean (no jest types)"
    fi
fi

# Check 3: jest.config.ts exists
if [ -f "$PROJECT_PATH/jest.config.ts" ]; then
    echo "✅ PASS: jest.config.ts exists"

    # Check preset inheritance
    if grep -q "preset:" "$PROJECT_PATH/jest.config.ts" && \
       grep -q "jest.preset" "$PROJECT_PATH/jest.config.ts"; then
        echo "✅ PASS: Uses workspace preset"
    else
        echo "⚠️  WARN: May not be using workspace preset"
    fi
else
    echo "❌ FAIL: jest.config.ts not found"
    ERRORS=$((ERRORS + 1))
fi

echo "================================================"
if [ $ERRORS -eq 0 ]; then
    echo "✅ All checks passed!"
    exit 0
else
    echo "❌ $ERRORS check(s) failed"
    exit 1
fi
