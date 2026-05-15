# AUDIT-{ID} — {short title}

**Date:** 2026-05-02
**Auditor:** {fork name}
**Scope:** {one-sentence scope statement, copied from the current tracker or work item}
**Status:** RECON COMPLETE (read-only — no fixes applied)
**Companion tracker:** `{current tracker, issue, or plan path}`

---

## TL;DR

{2-4 sentences: what was checked, headline finding, anticipated severity, whether SCHEMA-2 (or other Track B items) is blocked or unblocked by what was found.}

## Severity

**{GREEN | YELLOW | YELLOW-RED | RED}** — {one-line justification grounded in a CLAUDE.md rule or concrete impact.}

## Methodology

- {Command / search / file read 1, with the exact glob/pattern used}
- {Command / search / file read 2}
- {…3-6 bullets total. Reproducibility is the goal — another auditor should be able to re-run these and converge on the same findings.}

## Findings

> Each finding gets its own subsection. If there are zero findings, write **"No findings"** and explain what "clean" looked like in this audit.

### Finding 1 — {short title}

- **Severity:** {GREEN | YELLOW | YELLOW-RED | RED}
- **Files:** `path/to/file.ts:line` (one or many; include line numbers when feasible)
- **Evidence:** {concrete proof — counts, exact grep matches, file excerpts ≤15 words. Link CLAUDE.md rule by name.}
- **Why it matters:** {downstream impact, connection to non-negotiable rules, or risk if left untreated}
- **Anticipated effort:** {minutes / hours / multi-PR}
- **Suggested track:** {B | C | already-shipped | not-actionable}

### Finding 2 — …

## Cross-coupling notes

{Where this audit touches the other three in the batch (TYPES-1 / TESTS-1 / MOBILE-1 / PACKAGE-SCRIPTS-1) or any Track B item already on the punch list. Explicitly call out things the next audit should know — for example, "TYPES-1 should expect to find X because TESTS-1 saw Y." Two-three bullets is fine; more if real coupling exists.}

## Out of scope / not checked

- {Thing deliberately not investigated, with reason}
- {…}

## Recommended punch-list entries

> Format ready to paste into the current tracker. Use the same prose conventions: bold ID, severity line, effort line, files line, why-it-matters line.

```markdown
- **AUDIT-{ID}** {short imperative description}
  - Severity: {…}
  - Effort: {…}
  - Files: {…}
  - Why it matters: {…}
```

## Audit honesty disclosures

- {Anything the audit could not verify with confidence}
- {Sampling vs. full sweep — was every file read, or was a representative sample taken? If sampled, name the sampling rule.}
- {Any tools/queries that failed and were worked around}
