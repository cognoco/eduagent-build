# Deep-Review Meta-Report — Consolidated Findings & Remediation Plan

**Date:** 2026-05-30 · **Scope:** six `/deep-review` runs across the whole `eduagent-build`
monorepo · **Author:** review coordinator (Hex), synthesizing the per-run prioritized summaries
in this directory.

This report consolidates everything from the six runs into one picture: what was audited, what
was found (deduplicated and cross-referenced), the recurring themes, and a phased plan to get
from here to "codebase remediated." Per-run detail and raw agent findings live in the dated
subdirectories; the [`README.md`](./README.md) index has the live carry-over tracker.

---

## 1. Executive summary

**The codebase is unusually well-disciplined.** Across six runs, only **one** confirmed
production-grade defect surfaced (a leaked secret, already gitignored), and the highest-stakes
questions — cross-tenant isolation, auth, the silent-recovery ban, scope-from-event in background
jobs — all came back **clean and verified**. Most "findings" are data-minimization, defense-in-depth,
and unguarded-class gaps, not active breaches.

The work that remains is therefore **bounded and mostly systemic**: a handful of recurring patterns,
each fixable once and then frozen with a forward-only guard (the team's own established style —
GC1, persona-fossil, i18n keep-rot). The single most important framing of this report:

> **Most findings are not "a bug here" — they are "a class with no backstop yet."** Remediation
> should land the guard per class, not just patch instances. That is both higher-leverage and
> exactly how this team already works.

Tally across all runs (deduplicated): **1 P0 · ~9 P1 · ~20 P2.** No P0 in application logic — the
sole P0 is the leaked credential.

---

## 2. What was audited (coverage & caveats)

| # | Run | Scope | Aspects | Coverage caveat |
|---|-----|-------|---------|-----------------|
| 1 | [arch](./2026-05-29-arch-whole-repo/) | whole repo | dependency, cycles, hotspots, patterns, scale | Churn unavailable (history squashed to one day) — hotspots ranked on size/fan-in |
| 2 | [agent-instructions](./2026-05-30-agent-instructions/) | instruction surface | CLAUDE.md/AGENTS.md, 34 skills, settings, hooks | — |
| 3 | [security+pii](./2026-05-30-security-pii-api/) | `apps/api/src` | security, pii | Read trust-boundary core in full; not every one of 45 routes line-by-line |
| 4 | [security+pii](./2026-05-30-security-pii-inngest/) | `apps/api/src/inngest` | security, pii | security read 24/57 fns in full + grep-screened rest; pii examined all 59 |
| 5 | [errors](./2026-05-30-errors-api/) | `apps/api/src` | errors (rule-verification) | — |
| 6 | [l10n+a11y](./2026-05-30-l10n-a11y-mobile/) | `apps/mobile/src` | l10n, a11y | a11y contrast assessed from tokens, not rendered pixels |

**What was NOT audited (known gaps):**
- **Mobile `code` / `security` / `perf` / `types`** — mobile got only l10n + a11y. Client-side
  `isOwner` gating gaps (audience-matrix F1–F14) and mobile perf (god screens) are unaudited
  (server-side gating *was* verified clean in run 3).
- **Dependency supply chain, CI/CD pipeline, secret history** — `/deep-review security` only
  lightly touches these. → **This is the gap `/cso` fills** (see §6).
- **Runtime / dynamic behavior** — every run is static. The a11y C1 and l10n leaks are *found*
  statically but *confirmed* only at runtime (VoiceOver on, non-English locale).
- **Inngest fan-out tail** — the highest-yield next security query (handlers reading two ids —
  owner + target — and acting on both without an ownership join) was named but not exhausted.

---

## 3. Consolidated findings (deduplicated, by priority)

Severities are the coordinator's cross-domain re-prioritization (P0/P1/P2), not the agents'
in-domain labels. `[v]` = coordinator verified against source.

### P0 — Fix now
| ID | Finding | Location | Run |
|----|---------|----------|-----|
| **P0-1** `[v]` | Plaintext Logfire `sk-lf-` secret embedded in config; gitignored now but present in ≥3 historical commits | `.claude/settings.local.json:7` | 2 |

### P1 — Should fix
| ID | Finding | Location | Run |
|----|---------|----------|-----|
| **P1-1** `[v]` | **Inngest PII boundary (SYSTEMIC, 6 HIGH sites):** minors' transcripts/free-text in event payloads + memoized step returns | `filing.ts:175-249`, `ask-silent-classify.ts:37`, `topic-probe-extract.ts`, `auto-file-session.ts:71-76`, `freeform-filing.ts:152-159` | 3,4 |
| **P1-2** `[v]` | **a11y C1 (SYSTEMIC):** screen-reader silence in the core session loop; `announceForAccessibility` used 0× → also fixes H1/H3/H4 | `apps/mobile/src` (chat/session stream) | 6 |
| **P1-3** `[v]` | **l10n:** ~358 hardcoded English strings across 59 screens bypass `t()`; auth screen has 0 `t()` | `sign-in.tsx`, `book/[bookId].tsx`, +57 | 6 |
| **P1-4** `[v]` | Forged-event cross-account child-name (consumer doesn't re-verify child∈account) | `services/child-cap-notifications.ts:180-191` | 4 |
| **P1-5** | Forged-event cross-account: child name+struggles emailed to wrong parent (no `familyLinks` recheck) | `monthly-report-cron.ts:256-643` | 4 |
| **P1-6** `[v]` | Tenant isolation has no DB backstop — RLS helper unwired; one line of defense | `packages/database/src/rls.ts:46-66` | 3 |
| **P1-7** | Unbounded lifetime materialization on hot path → Worker OOM risk | `snapshot-aggregation.ts:244-252` | 1 |
| **P1-8** `[v]` | Per-request Neon pool churn (cache disabled) | `middleware/database.ts:103` | 1 |
| **P1-9** `[v]` | `autoMemoryDirectory` points at a different checkout → silent memory divergence | `.claude/settings.local.json:11` | 2 |

### P2 — Worth noting (condensed; full detail per-run)
- **Arch/scale:** `session-exchange.ts` 3,321-LOC god module (triple-flagged); 4-node runtime SCC
  `{settings,family-access,consent,notifications}`; silent Inngest-registration sync
  (`inngest/index.ts:194`); fetch-all-filter-in-JS; god screens/files; schemas flat barrel;
  `metering.ts` collision; half-migrated billing; type-only + curriculum cycles; permissive nx
  enforcement; `test-seed.ts` bundle check. *(Run 1)*
- **Inngest PII step-state sweep:** `weekly-progress-push.ts:851-861` (+parent email),
  `monthly-report-cron.ts:475-481`, `progress-summary.ts:83-93`, `consent-revocation.ts:112-115`
  (birth year), `session-completed.ts:1490`, `topic-probe-extract.ts:176-179`. *(Run 4)*
- **Security defense-in-depth:** consent-revocation delete branch missing `account_id` guard;
  module-level env singletons; CORS reflects localhost in all envs; `sql.raw` `SET LOCAL`;
  LLM-output slice → Sentry. *(Runs 3,4)*
- **a11y:** 0/13 modals `accessibilityViewIsModal` `[v]`; form-input labels; celebration components
  not `accessible={false}`; missing `role="button"`. *(Run 6)*
- **l10n:** 29 manual-pluralization sites (wrong for Polish); 4 `toLocaleDateString('en-US')`. *(Run 6)*
- **errors:** `dictation.ts:286` bare `catch{}` `[v]`; `consent.ts:672`; `stripe-webhook.ts:87`. *(Run 5)*
- **Governance:** CLAUDE.md↔AGENTS.md contradiction; `.deepsec/AGENTS.md` injection surface;
  `scope-keyword-check.sh` dead skill ref; skill `description:` rule violations; stale citations. *(Run 2)*

### Verified clean (don't re-litigate)
Tenant isolation (scoped-repo + parent-chain joins, no raw `db.*` in routes); JWT hardening;
webhook signature verification; LLM envelope + server-owned challenge-round mastery; scope-from-event
across destructive crons; **all 4 silent-recovery non-negotiables PASS**; perfect 7-locale key
parity; static a11y labels (~175/178 files, 0 unlabeled icon buttons). The codebase's good patterns
are real and guard-tested.

---

## 4. Cross-cutting themes (why a plan, not a checklist)

Five themes recur across runs. Each maps to **one systemic fix + one guard**, which is the unit of
remediation work:

1. **The Inngest third-party trust boundary.** PII findings cluster here because Inngest persists
   both event payloads and memoized step returns. → Fix pattern: *ids across the boundary, re-fetch
   inside the consuming step.* Guard: a test that fails CI on PII fields in `inngest.send` data or
   `step.run` returns. (Precedent exists: `[SEC-6/BUG-722]` maskEmail.)
2. **"One line of defense."** Tenant isolation (RLS unwired), i18n (JSX ratchet not landed), a11y
   (no announce path / lint), cycles (no `madge --circular` in CI) — each relies on a single control
   with no backstop. → The remediation is frequently *land the backstop*, not patch an instance.
3. **Defend at the producer, not the consumer.** The two cross-account gaps (P1-4, P1-5) are
   consumers trusting an id-pairing their producer validated. → Re-validate at the consumer + break test.
4. **The session-learning vertical is the gravity well.** `session-exchange.ts` and its siblings
   concentrate arch risk, CPU, and merge conflict. → Decompose pure decisions from I/O (no-behavior-change).
5. **Unguarded classes grow.** ~358 hardcoded strings, the Inngest-PII pattern, raw-`db.select`
   risk — all grow because no ratchet stops them. → This team already burns down backlogs with
   forward-only ratchets (GC1, persona-fossil, i18n keep-rot); apply the same to each class here.

---

## 5. Remediation plan — from here to "remediated"

Organized as **workstreams** (a fix + its guard travel together) sequenced into **phases**. Each
fix follows the repo's rules: worktree-per-change (`.worktrees/<WI>`), `/commit`, integration tests
for `apps/api`, eval harness for any LLM-prompt change, **break-tests for security fixes**, and the
**"sweep when you fix"** rule (fix all siblings or record a deferred sweep with an ID).

### Phase 0 — Contain (now; hours)
- **P0-1:** Rotate the Logfire `sk-lf-` key in Logfire (human action); remove the literal from
  `settings.local.json`; decide on history scrub. **In parallel, kick off `/cso`** (§6) — it's
  independent and closes the secret/supply-chain loop while Phase 1 proceeds.
- **P1-9** + cheap governance fixes (memory-dir repoint; `scope-keyword-check.sh` dead-skill ref;
  CORS localhost env-gate) — minutes each, no risk.

### Phase 1 — High-leverage "one fix, many findings" (days)
- **Workstream D (a11y):** add the iOS `announceForAccessibility()` path wired to streamed replies,
  quiz results, loading states, toast → closes **C1/H1/H3/H4** at once; then modals (H2). *(P1-2)*
- **Workstream C (cross-tenant):** add consumer re-validation to child-cap (P1-4) and monthly-report
  (P1-5), each with a forged-pair **break test**.
- **Scale quick wins:** re-enable the Neon pool cache (P1-8); bound the lifetime tables (P1-7) —
  both small, self-contained, directly de-risk production.

### Phase 2 — Systemic sweeps + their guards (1–2 weeks)
- **Workstream B (Inngest PII):** apply the ids-across-boundary pattern to all 6 HIGH sites (P1-1) +
  the P2 step-state sweep; drop PII fields from the two event schemas; **land a CI guard** that fails
  on PII in Inngest payloads/step returns.
- **Workstream E (l10n):** auth-first `t()` sweep (`sign-in.tsx` → `sign-up.tsx` → `book/[bookId]`
  → summaries) (P1-3); fix the 110 hardcoded `accessibilityLabel`s in the same pass (l10n **and**
  a11y); **land the Phase 3 JSX-literal ratchet** so it stops growing; fix manual plurals + date hardcodes.
- **Workstream C cont.:** wire Neon RLS **or** land the AST guard forbidding raw
  `db.select().from(<tenant table>)` outside `repository.ts` (P1-6); reconcile the architecture-doc claim.

### Phase 3 — Structural + remaining guards (background, 2–4 weeks)
- **Workstream F (arch):** split `session-exchange.ts` pure decisions into `exchange-decisions.ts`
  (no behavior change); break the 4-node SCC (`notification-settings.ts` + `consent-rules.ts`);
  add the Inngest-registration completeness test; wire `madge --circular` into CI; convert
  fetch-all-filter sites to SQL.
- **Workstream G (governance):** reconcile CLAUDE.md↔AGENTS.md (single source / Ruler / pointer);
  add the `.deepsec` trust boundary; fix skill `description:` rule violations + stale citations.
- Remaining P2 cleanup (errors swallows, metering rename, billing-facade migration, etc.).

### Phase 4 — Verify & freeze
- Re-run the relevant `/deep-review` aspect on each touched surface; confirm no new P0/P1.
- Confirm every fixed **class** now has a landed guard (the exit bar below).

### "Remediated" — exit criteria
1. **P0-1** rotated + removed + history decision made.
2. **All P1** closed, each with a regression/break test (red-green per `verification-before-completion`).
3. **Every finding-class has a forward-only guard landed** (Inngest-PII test, RLS/AST guard, JSX
   i18n ratchet, a11y announce-path lint or component, `madge --circular`, Inngest-registration test).
4. **Every P2** either fixed or tracked as a work item with owner + target date (per "sweep when you fix").
5. Re-audit of touched surfaces returns green.

---

## 6. Where `/cso` fits

`/cso` is **not redundant** with these runs — it covers the one threat class `/deep-review` barely
touches: **secrets archaeology (git history), dependency supply chain (`pnpm audit`, lockfile,
licenses), and CI/CD pipeline security (`.github/workflows`, token scope, action pinning).** Given
P0-1 proved secret hygiene isn't airtight, run `/cso` **in Phase 0, in parallel** with the secret
rotation — it's independent of the code remediation and directly extends the P0 investigation
(are there sibling secrets in history? is the supply chain clean?). After `/cso`, **stop auditing** —
coverage is comprehensive and the marginal audit now yields less than the remediation work.

---

## 7. Recommended immediate next step

Two things can start at once, with no conflict:
1. **You:** rotate the Logfire key (P0-1) — only you can, and it's the only finding with a ticking clock.
2. **Me:** kick off `/cso` (closes the secret/supply-chain loop) **and/or** begin Phase 1 — I'd start
   with the **a11y announce path** (one fix, four findings, unblocks blind users of the core loop) or
   the **Inngest-PII sweep** (systemic, with the guard). Each fix goes in its own worktree with the
   required break/regression test.

The audit phase is done. The codebase is in good shape; the path to "remediated" is bounded,
mostly systemic, and plays to this team's existing strength — fix the class, land the guard, move on.
