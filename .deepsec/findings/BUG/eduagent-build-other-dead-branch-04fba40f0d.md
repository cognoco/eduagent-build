# [BUG] Redundant if/else in fallbackAnalysis — both branches identical (harmless)

**File:** [`apps/api/src/services/learner-input.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/learner-input.ts#L78-L88) (lines 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-dead-branch`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

In fallbackAnalysis (lines 78-88), the conditional `if (lowered.includes('prefer') || lowered.includes('helps me') || lowered.includes('best when')) { notes.push(trimmed); } else { notes.push(trimmed); }` executes the identical statement in both branches, so the keyword test has no effect. Output is correct either way (the note is always pushed), so there is no functional or security impact. It signals incomplete logic — the author likely intended to categorize 'prefer/helps me/best when' input differently (e.g., as a learning preference vs. a generic note) but both paths write to the same `notes` array. Not a security issue; only the LLM fallback path is affected and the result is benign. SCANNER FALSE-POSITIVE NOTE: the flagged `insecure-crypto` lines (79-82) are `string.includes()` calls with no cryptography, and the flagged `xss` lines (111-112) build an LLM prompt with `escapeXml(text)` applied — not browser HTML.

## Recommendation

Either remove the dead conditional (keep a single `notes.push(trimmed)`), or implement the intended differentiation (e.g., route preference-keyword matches into a distinct communicationNotes bucket). No security change required.

## Revalidation

**Verdict:** true-positive

Confirmed in current code. fallbackAnalysis (lines 78-88) contains `if (lowered.includes('prefer') || lowered.includes('helps me') || lowered.includes('best when')) { notes.push(trimmed); } else { notes.push(trimmed); }` — both branches execute the identical statement, so the keyword test is dead and has no effect. The note is always pushed, so output is correct and there is no functional or security impact; it only signals incomplete logic (the author likely intended to bucket preference-keyword input into communicationNotes differently). This is a legitimate code-quality/dead-branch BUG, not a security issue, exactly as the finding states. The finding's own scanner-false-positive notes are also accurate: the includes() calls are not cryptography, and the escapeXml(text) prompt construction is not browser HTML. Verdict: true-positive at BUG severity.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-27)
