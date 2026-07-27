# Review rule — a safety gate must hold on every path, not just the primary

> **Interim standalone home.** This rule belongs in `principles.md`; that file
> does not exist yet (its creation is **WI-2052**). Until it lands, this is the
> citable home. WI-2052 should fold this rule in and leave a pointer here.
>
> **Provenance:** the four confirmed P1s from the 2026-07-14 `/improve` audit
> (WI-1985/1986/1987/1988) shared one archetype. **WI-2004** captured the class.

## The defect class

A safety / compliance / data-integrity gate is enforced on the **primary path**
and silently **absent on a degraded or secondary path** that reaches the same
guarded resource. The primary path looks correct in review and in the happy-path
test; the gap lives on the path nobody re-derived — the fallback, the crash-recovery
sweep, the person-scoped variant of an org-scoped fix, the "unlisted by default"
branch.

All four audit instances were this, not four unrelated bugs:

| # | Surface | Primary (gated) | Secondary path that was NOT gated | Fix WI |
|---|---|---|---|---|
| 1 | LLM routing | primary model honours the under-18 vendor ban | the **fallback** selector could still route a minor to Gemini | WI-1986 |
| 2 | Identity erasure | whole-org erasure tears down incident edges | the four **person-scoped** erasure paths did not → FK-abort | WI-1985 |
| 3 | Homework cache | normal-completion purge deletes the capture | the **crash/orphan** path left plaintext photos on disk | WI-1988 |
| 4 | Query persistence | known-PII families excluded from disk | an **unlisted/new** family persisted by default (fail-open) | WI-1987 |

Instance 4 is the same class in its dual form: "gate on the primary path only" ≡
"**fail-open** on the unenumerated path." The fix — a default-**deny** allowlist —
is "assert the gate on the path you didn't list," exactly like wiring the teardown
into the erasure path you didn't cover.

## The rule (apply in review)

When you add or review a safety/compliance/integrity gate, **enumerate every path
that reaches the guarded resource** and assert the gate on each — do not assume the
primary path is the only one:

1. **List the paths.** Primary, **fallback/degraded**, **crash/recovery/orphan**,
   **scoped variants** (person- vs org-, read- vs write-side), and the
   **default/unlisted** branch. Writing them down is the rule; most misses are a
   path never named.
2. **Gate is present on each** — or the omission is explicitly justified in the
   same change (as `docs/registers/safety-guards/master.md` justifies its
   prompt-only rows).
3. **Fail closed on the unenumerated path.** A default-**allow** / denylist is a
   primary-path-only gate by another name: it protects what you remembered and
   leaks what you didn't. Prefer default-deny / allowlist.
4. **A guard test per path.** Each secondary path carries a test that FAILS if the
   gate is re-introduced primary-only. It runs in the **always-on** suite — a
   DB-gated integration test does not guard the class in day-to-day CI.

## Guard tests (worked examples)

Each instance has a targeted guard that reds if its gate reverts to primary-only:

- **1 — LLM fallback:** `apps/api/src/services/llm/router.fallback-compliance.test.ts`
  → `[WI-1986] legacy fallback path never routes under-18 learners to Gemini`.
  Revert probe: neutralise the under-18 branch in `getFallbackConfig`
  (`router.ts` ~L1064) → the minor/adolescent/fail-closed rows red.
- **2 — person-scoped erasure:**
  `apps/api/src/services/identity-v2/deletion-v2.edge-teardown-wiring.test.ts`
  (WI-2004; call-site invariant, runs in the default API suite) +
  `deletion-v2.integration.test.ts` → `person-scoped deletes tear down edges
  (WI-1985)` (behavioural, staging-DB). Revert probe: drop
  `tearDownPersonEdgesTx(tx, personId)` from any one path → that path's row reds.
- **3 — homework cache orphan sweep:** `apps/mobile/src/hooks/use-homework-ocr.test.ts`
  → `cache cleanup (WI-1988)`. Revert probe: disable the mount-time
  `sweepOrphanedHomeworkCaptures()` → `sweeps orphaned … older than the TTL` reds.
- **4 — persistence fail-closed default:** `apps/mobile/src/lib/query-persister.test.ts`
  → `shouldPersistQuery [WI-1987]`, esp. `DEFAULT-DENY: an arbitrary/unaudited
  query key does not persist`. Revert probe: make `shouldPersistQuery` fail-open
  → the DEFAULT-DENY row and every PII-exclusion row red.
