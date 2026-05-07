#!/usr/bin/env bash
set -euo pipefail

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

for artifact in "$review_file" "$fix_file"; do
    if [[ ! -f "$artifact" ]]; then
        echo "WARNING: ${artifact} not found, skipping" >&2
        continue
    fi
    gh pr comment "$pr_number" --body-file "$artifact"
    echo "Posted: $(basename "$artifact")"
done

echo "Done — review comments posted to PR #${pr_number}"
