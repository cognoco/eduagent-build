#!/usr/bin/env bash
set -euo pipefail

body_file="${1:?Usage: create-pr.sh <body-file> <title>}"
title="${2:?Usage: create-pr.sh <body-file> <title>}"
base="${BASE_BRANCH:-main}"
artifacts_dir="${ARTIFACTS_DIR:-.}"

branch="$(git branch --show-current)"

existing="$(gh pr list --head "$branch" --json number,url,state 2>/dev/null || echo "[]")"
if [[ "$existing" != "[]" ]] && [[ "$(echo "$existing" | jq length)" -gt 0 ]]; then
    pr_number="$(echo "$existing" | jq -r '.[0].number')"
    pr_url="$(echo "$existing" | jq -r '.[0].url')"
    echo "PR already exists: #${pr_number} — ${pr_url}"
else
    pr_url="$(gh pr create --draft --base "$base" --title "$title" --body-file "$body_file" 2>&1)"
    pr_number="$(gh pr view --json number -q .number)"
    echo "Created PR #${pr_number}: ${pr_url}"
fi

echo "$pr_number" > "${artifacts_dir}/.pr-number"
echo "$pr_url" > "${artifacts_dir}/.pr-url"
echo "Saved PR metadata to ${artifacts_dir}/.pr-number and .pr-url"
