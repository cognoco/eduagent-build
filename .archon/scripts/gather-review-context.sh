#!/usr/bin/env bash
set -euo pipefail

artifacts_dir="${ARTIFACTS_DIR:-.}"
base="${BASE_BRANCH:-origin/main}"

pr_id="$(rg -oP 'PR-\d+' "${artifacts_dir}/work-order.md" | head -1 || echo "UNKNOWN")"
echo "PR ID: ${pr_id}"

echo ""
echo "=== Diff Stats ==="
git diff --stat "${base}...HEAD"

echo ""
echo "=== Changed Files ==="
git diff --name-only "${base}...HEAD"

echo ""
echo "=== New Abstractions ==="
git diff "${base}...HEAD" \
    | rg '^\+' \
    | rg '(export )?(interface |type |abstract class )' \
    || echo "(none found)"

mkdir -p "${artifacts_dir}/review"

if command -v fd &>/dev/null; then
    stale="$(fd -t d -d 1 'pr-' "${artifacts_dir}/../reviews" --changed-before 7d 2>/dev/null || true)"
    if [[ -n "$stale" ]]; then
        echo ""
        echo "=== Cleaning stale review dirs ==="
        echo "$stale" | xargs rm -rf
        echo "Removed: ${stale}"
    fi
fi

echo ""
echo "Review artifacts dir: ${artifacts_dir}/review/"
