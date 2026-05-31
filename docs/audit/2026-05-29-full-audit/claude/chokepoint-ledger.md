> # ⛔ SUPERSEDED — do not use for planning (2026-05-31)
> This slice was built on a **wrong premise**: it reasoned over the DeepSec **Round 1**
> (May-16) baseline (WP-ACL 41 / WP-COST 39) **as if those findings were still open**.
> They are not — Round 1 was fully remediated (tickets WI-76…89, all Closed/Done) before
> this session. The actual open scope is **DeepSec Round 2** (May-29 re-scan, **78 open
> findings** in `.deepsec/findings/`) **+ the parallel May-29 audits**. The real ACL
> residual is **4 live findings, not 41**.
>
> The *method* here (root-cause clustering → structural-fix vs point-fix) is still valid and
> is carried forward into **`consolidated-triage.md`**, which operates on the correct R2+audit
> scope. Kept only for method provenance. **Do not action CP-1/CP-2 as written.**
> Background: `../2026-05-31-deepsec-handover.md`.

---

# Chokepoint Ledger — Phase A (pattern-level remediation triage)

**Date:** 2026-05-31 · **Author:** Claude (Hex), reconciliation session
**Status:** SUPERSEDED (see banner). Originally: SLICE — two candidates (WP-ACL, WP-COST), R1 baseline.
**Scope of this slice:** `apps/api/src` + the mobile sites that fold into server enforcement.
**Read-only:** no source changed. Coverage claims confirmed by two read-only `Explore` (sonnet) passes over current HEAD.

---

## Why this document exists (the decision it serves)

The deepsec backlog is already grouped into 14 **symptom** families (WP-ACL, WP-COST, …) →
236 work items WI-90…325 under parents WI-76…89. Grouping by symptom answers *"what kind of
bug is this"*. It does **not** answer the question that decides whether we fix 1 thing or 80:

> **Does this whole family share a single enforcement chokepoint, such that one architectural
> rewire dissolves most of the instances — or is each instance its own fix?**

Phase A answers that *before* any per-finding ticket grind, so we don't hand-fix 80 endpoints
that a single seam would have closed. Each family/finding-class gets one of three tags:

| Tag | Meaning | Remediation unit |
|---|---|---|
| **(a) dissolve** | One seam removes most instances | ~1 architecture WI + a forward-only guard; most child WIs close as *superseded* |
| **(b) reduce + freeze** | Shared utility/convention + ratchet; instances still touched but mechanically | 1 utility WI + 1 guard + a sweep |
| **(c) irreducible** | Genuinely per-instance | Stays an individual WI |

---

## ⚠️ Data-integrity caveats (read before trusting numbers)

1. **WI live-status is UNVERIFIED.** The deepsec-created Notion pages (IDs in
   `.deepsec/data/eduagent-build/work/created-wps.json`) are **not reachable from this
   session's Notion MCP** (`notion-fetch` on `20f1c89a-…-b098` → "Object not found / no
   access") and the on-disk IDs look synthetic-sequential. So I cannot tell which WIs have
   been closed since the **2026-05-16** baseline. **All WI references below are to that
   baseline** (`deepsec-to-wi-map.md`). Confirm live state from the EduAgent/L-Space Notion
   before acting on "supersede these WIs."
2. **Line numbers drift fast.** workflow-4 found 29/32 audience-matrix citations rotted in 9
   days. The `file:line` cites here were re-confirmed by the Explore pass on **2026-05-31
   HEAD**, but re-verify at implementation time.
3. **deepsec totals disagree across its own artifacts** (236 ticketed / 323 latest aggregate /
   78 curated export). This slice reasons over the **236-item ticketed baseline** because that
   is the one mapped to WIs.

---

## CP-1 — WP-ACL → centralized proxy-mode write guard

**Parent:** WI-76 "WP-ACL — Broken access control (proxy-mode & ownership)" · **Baseline children:** 41
**Tag: (a) dissolve — but TWO seams, not one** (refinement of the earlier "one middleware" framing).

### Current state (confirmed)
- Guard: `assertNotProxyMode(c)` at `apps/api/src/middleware/profile-scope.ts:218`. Checks the
  **server-derived** `profileMeta.isOwner` (authoritative) **and** the client `X-Proxy-Mode`
  header (defense-in-depth); throws `HTTPException(403)`.
- **Enforcement = per-handler opt-in.** ~23 call sites repo-wide. The WP-ACL findings are
  precisely the mutation handlers that *forgot to call it*. Reads are allowed in proxy mode;
  **writes** are what must be blocked — so the discriminator is "mutation," not "route."

### What the 41 actually split into (the load-bearing finding)
The family is **not** one homogeneous seam. It is two enforcement layers plus a small residue:

| Layer | What it is | Representative baseline WIs | Seam |
|---|---|---|---|
| **HTTP-route writes** (~maj.) | POST/PUT/PATCH/DELETE handlers in `routes/*` missing the guard | WI-137 billing, WI-139 books, WI-147 curriculum, WI-153 filing, WI-161 parking-lot, WI-165 retention, WI-171 sessions, WI-173 settings, WI-177 subjects, WI-181 vocabulary | **Seam 1** |
| **Service-layer writes** | functions in `services/*` reachable from **Inngest/crons with no request context** | WI-198 curriculum svc, WI-238 session-crud, WI-244 session-homework, WI-246 session-summary, WI-250 settings svc, WI-239 session-events, WI-251 snapshot-agg | **Seam 2** |
| **Mobile client guards** | client-only checks; fold into server enforcement (server-side fix makes the client bypass moot) | WI-263, WI-264, WI-270, WI-273, WI-274, WI-277, WI-279, WI-283, WI-295, WI-301, WI-307 | (covered by Seam 1/2) |
| **"Proxy-allowed?" design calls** | parent marking child **celebration/nudge** seen — may be *intended* as allowed | WI-143 celebrations, WI-159 nudges, WI-270 home | per-route decision |

> **Why this matters:** a request middleware (Seam 1) does **nothing** for the service-layer
> findings — those are called from background jobs where there is no `Context`. Treating WP-ACL
> as "add one Hono middleware" would silently leave the Inngest-reachable writes open. This is
> the single most important correction this slice produces.

### Proposed remediation
- **Seam 1 — HTTP write-guard middleware.** After `profileScopeMiddleware`, a middleware that
  **default-denies non-GET methods when `!profileMeta.isOwner`**, unless the route is on a small
  explicit **proxy-allowed-write allowlist** (the celebration/nudge "design calls" above, once
  confirmed legit). Method-based default-deny is the clean discriminator; opt-out, not opt-in.
- **Seam 2 — service-layer actor guard.** A required `actor`/ownership argument (or a guard at
  the service boundary) on the profile-owned write functions, so the check travels with the call
  regardless of caller (HTTP or Inngest). Pairs naturally with the WP-XTEN ownership-helper work.
- **Forward-only guard (the "freeze"):** an AST/lint rule that fails CI when a new `routes/*`
  mutation handler or a profile-owned service write ships without passing through the guard —
  so the class can't regrow (mirrors the existing GC1 / persona-fossil ratchet style).

### Coverage verdict
- **~25–30 of 41 collapse** to Seam 1 + Seam 2 (route writes + service writes + the mobile
  items that fold in).
- **~3–5 are "proxy-allowed?" product decisions** (celebrations/nudges) — quick calls, then
  either allowlist or guard.
- A **few overlap WP-XTEN** (cross-tenant-id, WI-80) and are better fixed by the ownership-join
  helper than the proxy guard — count them once, under whichever seam lands first.

### Constraints / risks
- **Orthogonal to V0/V1 nav** (tab visibility) and to the two-data-access-patterns rule (read
  scoping) — no collision. Verified there's no central behavior that legitimately *depends* on
  proxy-mode writes.
- **Risk:** an over-broad default-deny breaks a legitimate proxy write. Mitigation: the
  allowlist is explicit and small; each non-GET route currently working in proxy mode must be
  enumerated before flipping the default. **A break test per seam is mandatory** (repo rule:
  security fixes require a negative-path test).

---

## CP-2 — WP-COST → metered-by-construction at the LLM call boundary

**Parent:** WI-77 "WP-COST — Unmetered LLM / expensive API abuse" · **Baseline children:** 39
**Tag: (a) dissolve — with a hard design caveat (separate cost-metering from the quota unit).**

### Current state (confirmed)
- Metering is an **HTTP middleware with a hardcoded route allowlist** (`middleware/metering.ts`).
  `isLLMRoute(path)` matches a finite list; **anything not listed is never metered** — this is
  **DS-043 / WI-132** ("allowlist misses authenticated LLM endpoints"), the *root* of the family.
- **Quota unit = per-HTTP-request** (one decrement per metered route), not per-LLM-call.
- **DS-044 / WI-133 (HIGH_BUG):** decrement happens before `next()`; a throwing handler is **not
  refunded** — no try/finally.
- The real LLM boundary is `routeAndCall` / `routeAndStream` (`services/llm/router.ts`), ~60 call
  sites, doing routing/retry/failover/envelope parsing — **but zero quota accounting today.**

### Why the boundary is the only universal seam
- **Spot-check (all confirmed unmetered, all via routeAndCall):** book-generation, language-detect,
  subject creation, assessments, homework — they reach `routeAndCall` and sit *outside* the allowlist.
- **Inngest is the clincher:** background LLM calls (progress-summary, monthly-report,
  subject-prewarm, post-session-suggestions) go through `routeAndCall` and have **no HTTP
  middleware at all**. The allowlist *cannot* ever meter them. **Only the call boundary can.**

### The hard design caveat (make-or-break — do not skip)
Metering today is **per-logical-action**; `routeAndCall` is **per-LLM-call**, and they are **not
1:1**. Confirmed multi-call actions:
- "Create subject" → language-detect + subject-resolve + curriculum gen = **3+** calls
- One session message → classify-input + main exchange = **2** calls
- Homework → OCR + classify + summary = **3** calls

Naively metering at `routeAndCall` would charge a user **3× for one "create subject."** That
changes user-visible quota and would **break the pricing model.** So the seam must split two ideas:
- **Cost metering / abuse ceiling** (every call, for spend + abuse) → `routeAndCall` is perfect.
- **User-facing quota unit** ("N messages/month") → stays per-logical-action; multiple calls
  share **one quota-action id**.

### Proposed remediation
- **Make `routeAndCall` require a billing context** (`profileId` + a `quotaActionId`): a call
  without it **throws / fails typecheck**. That is "metered by construction" — you cannot make an
  unmetered LLM call. Replaces the route allowlist (kills DS-043 as a class).
- **Thin `meteredAction()` wrapper** owns the per-action quota decrement; calls inside one action
  share its `quotaActionId`, preserving today's quota semantics.
- **DS-044 refund becomes trivial:** with accounting at the call boundary inside a try/finally,
  refund-on-throw is built in, not a separate fix.
- **Forward-only guard:** lint/AST rule — no `routeAndCall` without billing context.

### Coverage verdict — and the split that must NOT be folded in
- **~30 of 39 are quota-metering** → collapse to the routeAndCall chokepoint (book-generation,
  language-detect, subject/assessment/curriculum/dictation/homework-summary/learner-input/
  retention/subject-resolve/suggestions/tell-mentor/recall-test, …) + DS-043 + DS-044.
- **~5–6 are RATE-LIMITING, a different seam** — abuse throttle keyed by account/IP, **not** paid
  quota: WI-146 consent email, WI-179 support outbox, OCR-abuse, mobile consent (WI-262/309).
  These must **not** be folded into CP-2; they belong to their own small "rate-limit" candidate.
- **Plumbing cost:** thread `profileId` + `quotaActionId` through ~60 call sites — mechanical,
  and exactly what the forward-only guard enforces.

### Constraints / risks
- **Primary risk = pricing-model regression** if cost-metering and the quota unit are conflated.
  The `meteredAction()` split is the mitigation; needs a test asserting "create subject" still
  costs the user **1**, not 3.
- Quota is sensitive billing state (repo threat model) → **break tests required** (false
  exhaustion *and* free-chat bypass).

---

## What this slice implies for the rest of the backlog

The method holds, with one sharpened lesson worth carrying forward:

1. **"Dissolve" usually means a small N of seams, not literally one.** Both top candidates are
   genuinely (a), but ACL needs **two** seams (HTTP + service) and COST needs **one seam + one
   carve-out** (rate-limiting is not COST). Expect the same shape elsewhere — name the seams
   precisely rather than collapsing to a single number.
2. **The Inngest/background dimension keeps deciding the seam.** For both families, the
   background-reachable code is what rules out a middleware-only fix and forces a
   service-/call-boundary seam. The other families with heavy Inngest exposure (WP-CONSENT
   "re-check withdrawn consent in jobs", PII-at-Inngest) will likely land the same way.
3. **Every (a) here pairs with a forward-only guard** — consistent with how this team already
   freezes classes (GC1, persona-fossil, i18n keep-rot). The remediation unit is **fix-the-class +
   land-the-guard**, not patch-N.
4. **Likely tags for the untouched families** (hypotheses to confirm in the next slice, not yet
   code-verified): WP-XTEN → (a) ownership-helper + AST guard; WP-CONSENT → (a/b) consent-gate at
   Inngest registration; WP-LLM injection → (b) fence-utility + envelope; WP-RACE/WP-LOGIC →
   mostly (c); WP-CICD → (b) one CI-hardening pass; i18n/GC6 → (b) already framed as ratchet+sweep.

---

## Decisions needed before I extend this to the full backlog

1. **Sign off the method + depth** shown here (two-seam naming, code-confirmed coverage, guard
   pairing) — or adjust what you want each candidate row to contain.
2. **WI live-status:** can you (or an EduAgent-Notion session) confirm whether WI-76…325 are
   still open at the 05-16 baseline or partly closed? Determines whether the full ledger
   *rewrites* live tickets or *annotates* a backlog you'll reconcile.
3. **Rate-limiting carve-out:** agree it's a separate candidate from WP-COST (my rec: yes).
4. **Extend now?** On sign-off I apply the identical treatment to the remaining 12 families +
   the B/C-stream findings (deep-review P-tiers, the 2 arch docs, the 4 workflows), producing the
   complete chokepoint ledger + the residual (c) list that goes to issue-level.

---

### Provenance
- Code confirmation: 2 read-only `Explore` (sonnet) passes, 2026-05-31 HEAD — guard definition,
  call-site counts, middleware chain, routeAndCall reachability, multi-call impedance analysis.
- Finding source: `deepsec-to-wi-map.md` (2026-05-16 baseline, 236 items) + `deep-review/META-REPORT.md`.
- Not verifiable this session: live WI status (Notion workspace not reachable from here).
