# Deep-Review Audit Archive

Persisted output from `/deep-review` (the `claude-deep-review` plugin) runs against this
repo. Each run is a dated subdirectory. Raw per-agent findings are preserved verbatim;
the `SUMMARY-prioritized.md` in each run is the coordinator's holistic re-prioritization
(P0/P1/P2) plus any manual verification performed at presentation time.

> **▶ Start here: [`META-REPORT.md`](./META-REPORT.md)** — consolidated coverage, deduplicated
> findings across all six runs, cross-cutting themes, and the phased remediation plan (here →
> "codebase remediated"). This README is the run index + live carry-over tracker.

> **Convention:** all future deep-review artefacts land here, one dated subdirectory per
> run: `docs/audit/deep-review/YYYY-MM-DD-<aspect-or-scope>/`.

## Runs

| Date | Aspect / scope | Agents | Headline | Artefacts |
|------|----------------|--------|----------|-----------|
| 2026-05-29 | `arch` — whole repo | dependency-mapper, cycle-detector, hotspot-analyzer, pattern-scout, scale-assessor | 0 critical; strong discipline; risk concentrates in the LLM-session vertical + runtime-scale choices | [run dir](./2026-05-29-arch-whole-repo/) · [synthesis](./2026-05-29-arch-whole-repo/REPORT.md) · [prioritized](./2026-05-29-arch-whole-repo/SUMMARY-prioritized.md) |
| 2026-05-30 | `agent-instructions` — instruction surface | agent-instructions-reviewer | **1 CRITICAL: live Logfire `sk-lf-` secret in `settings.local.json`** (confirmed); memory-dir + CLAUDE.md↔AGENTS.md correctness issues | [run dir](./2026-05-30-agent-instructions/) · [raw](./2026-05-30-agent-instructions/agent-instructions-reviewer.md) · [prioritized](./2026-05-30-agent-instructions/SUMMARY-prioritized.md) |
| 2026-05-30 | `security` + `pii` — `apps/api/src` | security-reviewer, pii-leak-scanner | **No P0 — no exploitable cross-tenant / auth-bypass / child-data breach.** 1 P1 PII (minor transcript → Inngest payload); 1 P1 (RLS backstop unwired) | [run dir](./2026-05-30-security-pii-api/) · [security](./2026-05-30-security-pii-api/security-reviewer.md) · [pii](./2026-05-30-security-pii-api/pii-leak-scanner.md) · [prioritized](./2026-05-30-security-pii-api/SUMMARY-prioritized.md) |
| 2026-05-30 | `security` + `pii` — `apps/api/src/inngest` (58 fns) | security-reviewer, pii-leak-scanner | **No P0 — scope-from-event correct.** Systemic PII-at-Inngest-boundary (6 HIGH-class sites, 1 fix pattern); 2 forged-event cross-account child-PII gaps (child-cap, monthly-report). Corrects prior H1 fix guidance + sweep list. | [run dir](./2026-05-30-security-pii-inngest/) · [security](./2026-05-30-security-pii-inngest/security-reviewer.md) · [pii](./2026-05-30-security-pii-inngest/pii-leak-scanner.md) · [prioritized](./2026-05-30-security-pii-inngest/SUMMARY-prioritized.md) |
| 2026-05-30 | `errors` — `apps/api/src` (rule-verification) | silent-failure-hunter | **All 4 CLAUDE.md non-negotiables PASS.** No P0/P1. 1 P2 (bare `catch{}` in `dictation.ts:286`) + 2 LOW. | [run dir](./2026-05-30-errors-api/) · [raw](./2026-05-30-errors-api/silent-failure-hunter.md) · [prioritized](./2026-05-30-errors-api/SUMMARY-prioritized.md) |
| 2026-05-30 | `l10n` + `a11y` — `apps/mobile/src` | localization-scanner, accessibility-scanner | Prior investment, but 2 systemic unguarded gaps: **a11y C1** screen-reader silence in main flow (`announceForAccessibility` used 0×); **~358 hardcoded English strings** across 59 screens (auth screen 0 `t()`). | [run dir](./2026-05-30-l10n-a11y-mobile/) · [l10n](./2026-05-30-l10n-a11y-mobile/localization-scanner.md) · [a11y](./2026-05-30-l10n-a11y-mobile/accessibility-scanner.md) · [prioritized](./2026-05-30-l10n-a11y-mobile/SUMMARY-prioritized.md) |

## Severity / tier legend

Two scales appear in these artefacts:

- **Agent severity** (CRITICAL / HIGH / MEDIUM / LOW) — assigned by each specialist agent
  *within its own domain*. Preserved verbatim in raw files and the synthesis `REPORT.md`.
- **Coordinator tier** (P0 / P1 / P2) — re-ranked across all findings by real production
  risk ("what actually goes wrong, and how badly"). Lives in `SUMMARY-prioritized.md`.
  An agent's HIGH is not automatically a P0.

| Tier | Bar |
|------|-----|
| **P0** | Crash, data loss/corruption, security breach, or compliance violation in production — would page someone. |
| **P1** | Concrete risk of real-world failure or meaningful degradation; not an emergency. |
| **P2** | Genuine improvement, no immediate failure mode. |

## Open P0/P1 carry-over (live tracker)

Updated as runs land; clear items as they're fixed.

- [ ] **P0 — C1** Rotate the Logfire `sk-lf-` key + remove the literal from
  `.claude/settings.local.json` (gitignored now, but appears in ≥3 historical commits —
  consider history scrub). *(2026-05-30 agent-instructions)*
- [ ] **P1 — H1** Repoint `autoMemoryDirectory` to the canonical
  `…/nexus/_dev/eduagent-build/.claude/memory` (currently a different, also-existing tree). *(2026-05-30)*
- [ ] **P1 — arch** Bound/pre-aggregate lifetime tables in `snapshot-aggregation.ts:244-252`
  (Worker OOM risk on hot path + daily cron). *(2026-05-29)*
- [ ] **P1 — arch** Re-enable isolate-scoped Neon pool cache (`middleware/database.ts:103`). *(2026-05-29)*
- [ ] **P1 — arch** Add a systematic Inngest-registration guard test (`inngest/index.ts:194`). *(2026-05-29)*
- [ ] **P1 — Inngest PII boundary (SYSTEMIC, supersedes the old "filing.ts H1" item)** Minors'
  raw free-text/transcripts cross the Inngest third-party boundary at **6 HIGH-class sites**:
  `routes/filing.ts:175-180,244-249` (event), `ask-silent-classify.ts:37` +
  `session-exchange.ts:1806` (event, schema-mandated `classifyInput`), `topic-probe-extract.ts`
  + `session-exchange.ts:1196` (event, `learnerMessage`), `auto-file-session.ts:71-76` (step
  return), `freeform-filing.ts:152-159` (step return). **One fix pattern:** carry ids only,
  re-fetch PII **inside the consuming step closure** (NOT a separate `step.run` that returns it),
  drop PII fields from the event schemas. **Correction:** the prior tracker said to copy
  `freeform-filing.ts:151-160` as the safe pattern — it is NOT safe (still returns the
  transcript from the step). *(2026-05-30 inngest)*
- [ ] **P1 — sec MEDIUM (child-cap)** `child-cap-notifications.ts:180-191` inserts the event's
  `childProfileId` without verifying it belongs to the subscription's account → forged-event
  cross-account child-name in another parent's UI. Add the ownership check + break test. *(2026-05-30 inngest)*
- [ ] **P1 — sec MEDIUM (monthly-report)** `monthly-report-cron.ts` trusts the event's
  `(parentId, childId)` and emails a child's name+struggles to the parent without re-checking
  `familyLinks`; mirror `weekly-progress-push.ts:583-586`. Add unlinked-pair test. *(2026-05-30 inngest)*
- [ ] **P2 — Inngest PII step-state sweep** names/birthYear/struggles memoized in step returns:
  `weekly-progress-push.ts:851-861` (+parent email), `monthly-report-cron.ts:475-481`,
  `progress-summary.ts:83-93`, `consent-revocation.ts:112-115` (birth year), `session-completed.ts:1490`,
  `topic-probe-extract.ts:176-179`. **Sweep-list correction:** `weekly-self-reports.ts`,
  `recall-nudge-send.ts`, `session-completed.ts:1120` are CLEAN (local-only) — drop from prior list. *(2026-05-30 inngest)*
- [ ] **P1 — sec L1** Wire Neon RLS (`withProfileScope` unused) **or** add an AST/lint guard
  forbidding raw `db.select().from(<tenant table>)` outside `repository.ts`; reconcile the
  architecture-doc RLS claim. *(2026-05-30 api)*
- [ ] **P1 — a11y C1** Add an iOS `AccessibilityInfo.announceForAccessibility()` path (used 0×
  today) wired to streamed tutor replies, quiz results, loading states, and the session toast —
  one systemic fix covers C1/H1/H3/H4 (screen-reader silence in the main flow). *(2026-05-30 mobile)*
- [ ] **P1 — l10n** ~358 hardcoded English strings across 59 screens bypass `t()` (auth screen
  `sign-in.tsx` has 0 `t()`; `book/[bookId].tsx` 47 `<Text>`/1 `t()`). Route through `t()`
  auth-first; fix the 110 hardcoded `accessibilityLabel`s in the same pass (l10n+a11y); land the
  Phase 3 JSX-literal ratchet so it stops growing. *(2026-05-30 mobile)*
- [ ] **P2 — a11y H2** 0/13 modals use `accessibilityViewIsModal`; add it + focus-on-open. *(2026-05-30 mobile)*

## Not yet run (candidates)

- `errors` — silent-recovery audit in billing/auth/webhook (CLAUDE.md bans it). **Recommended next.**
- `tests` — GC1/GC6 internal-mock backlog, integration-test gaps.
- Targeted security follow-up: grep `inngest/functions/` for handlers reading **two** ids
  (owner + target) from `event.data` and acting on both without an ownership join — the class
  behind both forged-event MEDIUMs; a few un-read `*-send` handlers may share it.
