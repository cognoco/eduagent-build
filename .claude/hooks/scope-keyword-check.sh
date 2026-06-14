#!/bin/bash
# UserPromptSubmit hook: triggers scope enumeration when the user's prompt
# mentions high-risk multi-state surfaces (flag matrices, route guards, mode
# switching, profile shapes, migrations).
#
# Purpose: prevent the "half-migration" failure mode where new code paths ship
# while old single-flag kill-switches remain — the slip pattern seen in PR 376.
#
# Tune the keyword regex below if false positives become annoying.

prompt=$(jq -r '.prompt // ""' 2>/dev/null)

if [ -z "$prompt" ]; then
  exit 0
fi

# Skip when the user is operating on existing code rather than editing it.
# These verbs/nouns indicate commit/review/sync work, not new design — the
# pre-flight enumeration would block the agent from completing the operation.
if echo "$prompt" | grep -qiE '\b(commit|commits|committing|push|pushing|pushed|merge|merging|merged|rebase|rebasing|revert|reverting|cherry-?pick|stash|stashing|amend|amending|PR|PRs|pull request|pull requests|review|reviewing|/commit|/ship|/fix-ci)\b'; then
  exit 0
fi

# Skip when the work is editing docs/logs/config rather than code.
# Pre-flight enumeration doesn't apply to README updates, memory edits,
# adding a log line, or tweaking a json config — the state-matrix concern
# doesn't exist for these surfaces.
if echo "$prompt" | grep -qiE '\.(md|mdx|log|txt|json|ya?ml)\b|\b(README|CHANGELOG|docs/|documentation|memory|MEMORY\.md|CLAUDE\.md|console\.log|logger\.|log line|log entry|logging line|telemetry line)\b'; then
  exit 0
fi

# Narrow keyword list — tune if too noisy or too quiet.
# Word-boundary anchors on V0/V1 to avoid matching e.g. "iOS 16".
if echo "$prompt" | grep -qiE 'MODE_NAV_V[01]|feature[ _.-]?flag|profile[ _.-]?shape|mode[ _.-]switch|route[ _.-]guard|auth[ _.-]gate|nav[ _.-]contract|\bV0\b|\bV1\b'; then
  cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"SCOPE-RISK KEYWORD DETECTED in user prompt. Before any code edit this turn, you MUST enumerate the full surface yourself: (1) every file gating on this dimension today, (2) every cell of the relevant state matrix that exists (e.g. V0 x V1, mode x isOwner, owner x hasLinkedChildren), (3) what changes under the new path and what must be preserved, (4) which cells have no owner. Present the map and wait for confirmation. This hook guards against the half-migration pattern (new code ships, old single-flag kill-switches stay) that produced the PR 376 slip."}}
EOF
fi

exit 0
