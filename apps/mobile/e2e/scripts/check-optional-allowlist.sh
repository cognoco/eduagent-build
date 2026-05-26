#!/usr/bin/env bash
# check-optional-allowlist.sh — Gate on unjustified optional: true usages.
#
# Context (BUG-626):
#   251 `optional: true` usages exist across 75 E2E flow files. Maestro silently
#   skips failing assertions when optional: true is set, which defeats the purpose
#   of the test. Without a gate, new unjustified uses accumulate unnoticed.
#
# Rules enforced by this script:
#   1. Files listed in optional-allowlist.txt are pre-approved — all their
#      optional: true usages are accepted without inline justification.
#      Allowlisted files are setup/infra flows where optional is structural
#      (persona routing, system dialog dismissals, etc.).
#
#   2. Files NOT in the allowlist must have an inline `# justified:` comment
#      on the same line as every `optional: true`. Format:
#        optional: true  # justified: <reason>
#      A justification in the preceding comment block is NOT sufficient —
#      the comment must be on the same line so it survives reformatting and
#      is visible in review context.
#
# Usage:
#   bash apps/mobile/e2e/scripts/check-optional-allowlist.sh
#   # Exit 0 = all usages are justified or allowlisted.
#   # Exit 1 = one or more violations found (see output).
#
# Add to pre-commit or CI:
#   bash apps/mobile/e2e/scripts/check-optional-allowlist.sh || exit 1
#
# To add a new optional: true to a non-allowlisted flow:
#   - Add `  # justified: <reason>` on the same line, OR
#   - Add the whole file to optional-allowlist.txt with a reason comment.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ALLOWLIST_FILE="$E2E_DIR/optional-allowlist.txt"
FLOWS_DIR="$E2E_DIR/flows"

if [ ! -f "$ALLOWLIST_FILE" ]; then
  echo "ERROR: optional-allowlist.txt not found at $ALLOWLIST_FILE" >&2
  exit 1
fi

# Build set of allowlisted paths (relative to e2e dir, stripping comments/blanks)
declare -A allowlisted
while IFS= read -r line; do
  # Strip leading/trailing whitespace and skip blank lines + comment lines
  trimmed="${line#"${line%%[![:space:]]*}"}"
  trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
  [[ -z "$trimmed" || "$trimmed" == \#* ]] && continue
  allowlisted["$trimmed"]=1
done < "$ALLOWLIST_FILE"

violations=()

# Scan all yaml files under flows/
while IFS= read -r -d '' yamlfile; do
  # Compute path relative to e2e dir (e.g. flows/quiz/quiz-dispute.yaml)
  relpath="${yamlfile#"$E2E_DIR/"}"

  # Skip if this file is in the allowlist
  if [[ -n "${allowlisted[$relpath]+_}" ]]; then
    continue
  fi

  # Find lines with optional: true that lack an inline # justified: comment
  lineno=0
  while IFS= read -r line; do
    lineno=$((lineno + 1))
    # Match lines with actual YAML `optional: true` key-value (not comment lines
    # that merely mention the string "optional: true" as prose).
    # A real YAML optional: true line contains `optional: true` as a value
    # (possibly with leading whitespace) — it is NOT a pure comment line.
    if echo "$line" | grep -qE '^[^#]*optional: true'; then
      # Check for inline justified comment on the same line
      if ! echo "$line" | grep -q '# justified:'; then
        violations+=("$relpath:$lineno: missing '# justified:' comment — $line")
      fi
    fi
  done < "$yamlfile"
done < <(find "$FLOWS_DIR" -name "*.yaml" -print0)

if [ ${#violations[@]} -eq 0 ]; then
  echo "OK: all optional: true usages are either allowlisted or have an inline # justified: comment."
  exit 0
fi

echo "" >&2
echo "ERROR: unjustified optional: true usages found." >&2
echo "" >&2
echo "Each non-allowlisted flow file must annotate every optional: true with:" >&2
echo "  optional: true  # justified: <reason why this step may legitimately be absent>" >&2
echo "" >&2
echo "Violations (${#violations[@]}):" >&2
for v in "${violations[@]}"; do
  echo "  $v" >&2
done
echo "" >&2
echo "To fix:" >&2
echo "  1. Add an inline '# justified: <reason>' comment on the same line, OR" >&2
echo "  2. Add the flow file to apps/mobile/e2e/optional-allowlist.txt with a comment" >&2
echo "     explaining why all its optional: true usages are structurally necessary." >&2
echo "" >&2
exit 1
