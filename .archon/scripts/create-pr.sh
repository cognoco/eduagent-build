#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

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
    pr_url="$(gh pr create --draft --base "$base" --title "$title" --body-file "$body_file")"
    # gh pr create returns the PR URL with the number as the final path
    # segment (e.g. https://github.com/owner/repo/pull/123). Extract the
    # number from the URL instead of round-tripping `gh pr view`.
    pr_number="$(basename "$pr_url")"
    echo "Created PR #${pr_number}: ${pr_url}"
fi

echo "$pr_number" > "${artifacts_dir}/.pr-number"
echo "$pr_url" > "${artifacts_dir}/.pr-url"
echo "Saved PR metadata to ${artifacts_dir}/.pr-number and .pr-url"
