#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

artifacts_dir="${1:?Usage: post-review-comments.sh <ARTIFACTS_DIR>}"

pr_file="${artifacts_dir}/.pr-number"
review_file="${artifacts_dir}/review/consolidated-review.md"
fix_file="${artifacts_dir}/review/fix-report.md"

if [[ ! -f "$pr_file" ]]; then
    echo "ERROR: ${pr_file} not found — cleanup-create-pr must run first" >&2
    exit 1
fi

pr_number="$(cat "$pr_file")"
echo "Posting review comments to PR #${pr_number}..."

posted_count=0
for artifact in "$review_file" "$fix_file"; do
    if [[ ! -f "$artifact" ]]; then
        echo "WARNING: ${artifact} not found, skipping" >&2
        continue
    fi
    gh pr comment "$pr_number" --body-file "$artifact"
    echo "Posted: $(basename "$artifact")"
    posted_count=$((posted_count + 1))
done

if [[ $posted_count -eq 0 ]]; then
    echo "ERROR: no review artifacts found — expected at least one of consolidated-review.md or fix-report.md" >&2
    exit 1
fi

echo "Done — posted ${posted_count} review comment(s) to PR #${pr_number}"
