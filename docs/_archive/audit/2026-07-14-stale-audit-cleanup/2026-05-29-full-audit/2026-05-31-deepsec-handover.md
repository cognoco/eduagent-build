# Deepsec Handover — for Round-2 Remediation

**Date:** 2026-05-31
**Author:** prior session (Hex / orchestrator)
**Audience:** the agent starting the second round of Deepsec remediation
**Purpose:** disambiguate the two Deepsec runs whose artifacts both live under `.deepsec/`, and state exactly what to act on.

> Filename note: the request named this `2029-05-31-…`; that was a typo. Today is **2026-05-31**, consistent with the `2026-05-29-full-audit/` directory.

---

## TL;DR (read this first)

There are **two different Deepsec scans** mixed together in `.deepsec/`. They are not the same finding set.

- **Round 1 — May 16 (codex/gpt-5.5).** 236 findings → bundled into 14 Work Packages **WI-76 … WI-89** → **already remediated** (that was the "Deepsec sprint"). Documented in `.deepsec/data/eduagent-build/deepsec-to-wi-map.md`. **Do NOT act on these. They are history.**
- **Round 2 source — May 29–30 (Claude opus-4-8).** A full re-scan of the remediated codebase (602 files). After revalidation it produced **78 open findings**. These live in **`.deepsec/findings/`**. **This is your scope. Act on these.**

**Your actionable list = the 78 markdown files in `.deepsec/findings/`** (organised by severity). Everything else under `.deepsec/` is either historical, generated noise, or tooling exhaust — see the file map below.

---

## The two runs, side by side

| | Round 1 (history) | Round 2 (your scope) |
|---|---|---|
| **When** | 2026-05-16 | 2026-05-29 → 05-30 |
| **Model** | codex / gpt-5.5 | Claude **opus-4-8** |
| **Run id(s)** | `20260516050543-…` | `20260529202305-…`, `20260530002217-…`, `20260530025316-…`, plus revalidate runs |
| **Raw findings** | 236 | 323 |
| **Status** | Triaged → WI-76…89 → **remediated** | Revalidated → **78 open** |
| **Where documented** | `deepsec-to-wi-map.md` | `.deepsec/findings/` (+ `reports/report.md`) |
| **Action** | **none — already done** | **triage & fix** |

### Why Round 2 looked alarming but isn't a regression
opus-4-8 grades **far more strictly** than the codex/gpt-5.5 baseline and the codebase grew ~120 files since May 16, so the raw count *rose* (236 → 323) even though Round 1 held. The number that matters is the **revalidation verdict**, not the raw count:

| Verdict | Count | Meaning |
|---|---:|---|
| **Fixed** | 201 | Round-1 remediation confirmed still in place — **do not re-fix** |
| **True-positive (live)** | 76 | Genuinely open — **your work** |
| False-positive | 41 | Not real — ignore |
| Uncertain | 2 | Needs a human/code check — included in the 78 |
| Duplicate | 3 | — |

`findings/` contains the **76 live + 2 uncertain = 78** open items. (The deepsec `status` index says "76 TP"; the export adds the 2 uncertain → 78. Trust the `findings/` export as the actionable list.)

**Net reading: Round-1 remediation substantially held (201 confirmed fixed). The 78 open items are new Round-2 scope — a mix of small residuals in already-touched areas and net-new issue types the stronger model surfaced. They are not reopened WI-76…89 findings.**

---

## What every file under `.deepsec/` is (and whether to trust it)

| Path | What it is | Use it? |
|---|---|---|
| **`findings/`** (BUG/ HIGH/ HIGH_BUG/ MEDIUM subdirs) | **Round-2 open findings, one markdown each.** Self-contained: severity, file+line links, slug, finding, recommendation. | ✅ **This is your work list.** |
| `data/eduagent-build/deepsec-to-wi-map.md` | Round-1 (May 16) traceability: 236 findings → WI-76…89. | 📜 History only. Context for "what was already fixed." Do not action. |
| `data/eduagent-build/reports/report.md` / `report.json` | Round-2 full report (regenerated). `report.json` is per-file with nested `findings[]` incl. `revalidation.verdict`. **Gitignored** — present locally but may be absent on a clean checkout. | ✅ if present; else regenerate (below). |
| `data/eduagent-build/files/*.json` | Per-file analysis; each finding carries `revalidation.verdict` (`fixed`/`true-positive`/`false-positive`/`uncertain`/`duplicate`). Source of truth for verdicts. **Gitignored.** | ✅ for verdict queries; else regenerate. |
| `data/eduagent-build/debug/` | Parse-error logs from the run (JSON-parse failures during investigate/revalidate). | ❌ Noise. Ignore. |
| `data/eduagent-build/error-files.manifest.json` | Resume manifest used to reprocess files after session-limit stalls. | ❌ Process artifact. Ignore. |
| `data/eduagent-build/INFO.md` / `SETUP.md` | Deepsec project context (auth shape, threat model). | ℹ️ Background. |
| `.claude/logs/` | Commit-skill timing logs. | ❌ Ignore. |

**Git caveat:** `files/`, `runs/`, `reports/`, `project.json` are gitignored (regenerable). `findings/`, `debug/`, the manifest, and `tech.json` were committed on **PR #625** (`docs/local-audit-docs-backlog`). `main` does **not** carry the scan outputs. If `findings/` is missing on your checkout, get on the PR-#625 branch or regenerate.

### Regenerating report/verdicts if needed
From inside `.deepsec/` (deps already installed; reuses logged-in `claude` CLI):
```bash
pnpm deepsec report                              # rebuilds reports/report.md|json from current state
pnpm deepsec export --format md-dir --out ./findings   # rebuilds findings/
pnpm deepsec status                              # severity + revalidation tally
```
Do **not** re-run `scan`/`process`/`revalidate` for triage — that re-scans and costs hours/quota. Only the report/export/status commands are needed to read existing state.

---

## How to read a finding

Each `findings/<SEV>/eduagent-build-<slug>-<hash>.md` is self-contained:

```
# [HIGH] Consent request can target arbitrary same-account profiles
**File:** apps/mobile/src/app/consent.tsx (lines 46, 148, …)
**Severity:** HIGH • **Confidence:** high • **Slug:** acl-check
## Owners …
## Finding   ← what's wrong and the attack/impact
## Recommendation   ← suggested fix
```
The `slug` groups findings into families (e.g. `acl-check`, `expensive-api-abuse`, `other-race-condition`). The file+line links point at `main` on GitHub.

---

## The Round-2 actionable set (78 open findings)

By severity: **HIGH 3 · HIGH_BUG 5 · MEDIUM 27 · BUG 43.**

### HIGH (3) — fix first
1. **Proxy-mode session write protection relies on a client-side redirect for non-metered writes** — `apps/mobile/src/app/(app)/session/_layout.tsx` (`acl-check`)
2. **Consent request can target arbitrary same-account profiles** — `apps/mobile/src/app/consent.tsx` (`acl-check`)
3. **Any @claude issue or comment can invoke a secret-backed agent** — `.github/workflows/claude.yml` (CI supply-chain)

### HIGH_BUG (5) — billing/data-integrity, high priority
1. **Same-day dictations in the same mode overwrite each other** — `apps/api/src/services/dictation/result.ts`
2. **Trial-expiry cron can downgrade a just-converted paying subscriber** (missing `status='trial'` guard) — `apps/api/src/services/billing/trial.ts`
3. **Deletion cancellation/restoration checks are not atomic with final deletes** — `apps/api/src/services/deletion.ts`
4. **Dormant web ChatShell still exposes voice controls bound to stale session handlers** — `apps/mobile/src/components/session/ChatShell.tsx`
5. **Top-up credits permanently stranded after upgrading from a shared-pool tier to a per-profile tier** — `apps/api/src/services/billing/top-up.ts`

### Thematic clusters in the remaining MEDIUM/BUG
- **`acl-check` parent-proxy write-guard** — the standout theme. Round 1 largely closed it (30 confirmed fixed); **4 remain live** (incl. the 2 mobile HIGHs above). Pattern: a guard that blocks parent-proxy sessions from writing to child data exists but isn't enforced server-side at every site. Treat the live ones as an incomplete-sweep tail.
- **`expensive-api-abuse`** (LLM/cost), **`other-race-condition`**, **`other-logic-bug`** — residuals in already-touched families.
- A long tail of **net-new `other-*` slugs** (e.g. `other-insecure-token-storage`, `other-missing-gdpr-consent-gate`, `other-billing-overcharge`, `other-unbounded-input`) with **zero fixed siblings** — these are issue *types* the codex baseline never had a slug for. They are new, not reopened.

---

## Interpretation caveats (avoid the traps that caused the confusion)

1. **Old vs new is the #1 trap.** If a doc mentions **WI-76…89**, the **236-finding total**, the **May-16 run id**, or **`deepsec-to-wi-map.md`**, it's Round 1 — already done. If it's a file under **`findings/`** or the **May-29/30 report**, it's Round 2 — your scope.
2. **Don't re-fix the 201 "Fixed."** Those are confirmed-still-remediated. Re-touching them wastes effort and risks regressions.
3. **The 2 "uncertain" need a human/code look** before they're treated as real — they're in the 78 but not confirmed.
4. **Counts don't compare across runs** (different models). Use verdicts, not raw totals.
5. **Verify before fixing.** These findings are ~1 day old and the tree moves; confirm each against current code (per the repo's "changed code is not fixed code" rule) and add a break-test for any CRITICAL/HIGH security fix.

---

## Provenance (so the oddities make sense)

The Round-2 run was done on the orchestrator machine against the logged-in Claude **Max subscription** (not an API key). It repeatedly hit the **5-hour session limit** (~300 deep analyses/window) and, at higher concurrency, an intermittent **CLI logout** (`Not logged in`) from concurrent OAuth token refresh. It was therefore completed across several resumed passes (concurrency 1–2, error-only manifests). That history explains `debug/` (parse-error logs) and `error-files.manifest.json` — both are process exhaust, safe to ignore. Full operational notes are in the orchestrator's memory (`deepsec-opus-subscription-session-limit`).

---

## Suggested Round-2 workflow

1. Confirm you're reading **`findings/`** (Round 2), not `deepsec-to-wi-map.md` (Round 1).
2. Triage in severity order: **HIGH → HIGH_BUG → MEDIUM → BUG.** Start with the 3 HIGH + 5 HIGH_BUG above.
3. For each: open the finding md, verify the issue still exists in current code, then fix (break-test for security/HIGH).
4. Resolve the 2 `uncertain` items by code inspection before deciding.
5. Capture the confirmed work as **WI items under a "Deepsec round 2" sprint** (mirror the Round-1 WI-76…89 pattern; see `deepsec-to-wi-map.md` for the shape) so it enters normal triage.
6. The parent-proxy `acl-check` cluster is the highest-leverage theme — consider one consolidated server-side write-guard fix + a guard test over a per-file scatter.
