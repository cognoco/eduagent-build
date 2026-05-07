#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

branch="$(git branch --show-current)"
base="${BASE_BRANCH:-main}"

echo "Pushing ${branch} to origin..."
echo "Commits ahead of origin/${base}:"
git log --oneline "origin/${base}..HEAD"

if git push -u origin HEAD; then
    echo "Push succeeded: ${branch}"
else
    echo "Push failed. Diagnostics:" >&2
    git remote get-url origin || true
    git branch --show-current || true
    git config credential.helper || true
    exit 1
fi
