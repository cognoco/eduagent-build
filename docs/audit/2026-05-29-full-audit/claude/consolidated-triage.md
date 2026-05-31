# Consolidated Triage v2 — May-29 Audit Round (DeepSec-R2 + parallel audits)

**Date:** 2026-05-31 · **Author:** Claude (Hex), reconciliation session
**Status:** DRAFT for ratification. **No code changed; no tickets created.**
**Supersedes:** v1 of this file (same path). v1 is preserved only as the narrative in §1.
**Decision it serves:** turn the untriaged May-29 audit outputs into a prioritized
**must / should / consider** view, with architecture-level root causes surfaced *before* we mint
per-finding tickets — so we fix *classes* (one structural change + a guard), not 78 symptoms.

> **What changed in v2 (read §1 + §2 first):** every numeric finding reference was rebuilt against
> `_r2-catalogue.tsv` (v1 had pervasive numbering drift); clusters were re-cut at *invariant*
> boundaries (consent/deletion split out of ACL and billing; dictation/ChatShell split into an
> identity/idempotency cluster); tiering was corrected (the Gemini item was double-counted and
> over-promoted); and coverage gaps were closed (tenant-isolation backstop, forged-internal-event
> authority, per-deep-review-P1 disposition). Driven by full-body reads of the tiering-critical
> findings + a parallel Codex peer review.

---

## 0. Scope & sources (what's in, what's history)

**In scope (the live, untriaged backlog):**
- **DeepSec Round 2** — May-29 re-scan of the remediated tree → **78 actionable findings** in
  `.deepsec/findings/` (76 true-positive + 2 uncertain, after 201 fixed / 41 FP / 3 dup of 323
  raw). By severity: **HIGH 3 · HIGH_BUG 5 · MEDIUM 27 · BUG 43.** Catalogue: `_r2-catalogue.tsv`
  (verified complete: `ls .deepsec/findings/{HIGH,HIGH_BUG,MEDIUM,BUG}` = 3/5/27/43).
- **Parallel May-29 audits** (un-ticketed): `deep-review/` (6 runs → 1 P0, ~9 P1, ~20 P2),
  `2026-05-29-architecture-audit.md` (ARCH-1…5), `2026-05-29-improve-codebase-architecture.md`
  (deepening #1…11), `workflow-1` (i18n, 960 strings), `workflow-2` (GC6 mocks, 153 sites),
  `workflow-3` (inngest core-send, 2 mismatches), `workflow-4` (audience-matrix drift).
- **The parallel Codex consolidation** in `../codex/` — peer review, reconciled in §2.

**History — NOT in scope:** DeepSec **Round 1** (May-16, 236 findings → WI-76…89 WPs + child items
WI-90…325, all Closed/Done; 14 WPs: WP-ACL/CICD/CONSENT/COST/DATA/DISCLOSE/INPUT/LLM/LOGIC/RACE/
SCORE/STALE/WEBHOOK/XTEN). Per `../2026-05-31-deepsec-handover.md`: R2 revalidation confirmed
**201 R1 fixes held**; the 78 are residuals + net-new, **not** reopened R1 items. `.deepsec/`
mixes both runs — `findings/` = R2 (act); `deepsec-to-wi-map.md` + reports citing 236 = R1 (history).

**Referencing convention (NEW in v2):** findings are cited as **`#<row> · <file> — <title>`** where
`<row>` is the line in `_r2-catalogue.tsv`. The `.deepsec/findings/` files are named by `slug+hash`
with **no inherent numbering** — the `#N` scheme exists only in the TSV, which is why v1 drifted.
Verify any `#N` against the TSV row before acting on it.

**Data-integrity caveats:**
1. The 8 HIGH/HIGH_BUG were read in **full body**; the Gemini, consent-deletion linkage, and
   deletion-atomicity findings were **also** read in full for v2 (see §1). The remaining 67
   MEDIUM/BUG are clustered from **title + slug + file** — re-read each finding md before implementing.
2. Row 78 (`billing/top-up.ts` title parse) — title parsed clean on recount; it is the JWKS-DoS
   row (`middleware/jwt.ts`), not a billing row. Verify the finding md directly before ticketing.
3. R1-correspondence (⟲) is now **evidenced** for the MUSTs (§6), still a hypothesis for the tail.
4. Line numbers in findings are ~2 days old; verify against current HEAD at fix time.

---

## 1. Changelog v1 → v2 (the corrections, for fast ratification)

v1 was directionally right (architecture-first, R2-scope-only, billing-as-a-class) but carried a
**pervasive numbering defect** and two **over-merged clusters**. Corrections, all source-verified:

- **Numbering rebuilt from the TSV.** v1's `#N` cross-refs were assigned from memory, not the
  catalogue. Only rows 1–8 (the full-body-read HIGH/HIGH_BUG) were correct; the entire MEDIUM/BUG
  layer (rows 9–78) had drifted. Concrete v1 errors now fixed:
  - v1 MUST `#17` ("content-safety fails open on classifier error") was a **phantom** — there is no
    such row. Row 17 is OIDC-misuse (`claude.yml`). No "classifier fails open" finding exists in the 78.
  - v1 MUST `#53` ("provider safety-block retried") pointed at row 53 = ModeSwitcher i18n. The real
    Gemini finding is **row 21**. So v1 listed **one MEDIUM finding (row 21) twice, as two MUSTs.**
  - v1 CL-1 `#49/#58/#63` (labeled ACL) are actually JWKS-misclassification / substring-bug /
    UUID-validation — none are ACL. v1 CL-2 billing list (`#18/#44/#45/#72/#78`) was almost entirely
    non-billing (age-gate / IDOR / dup-hook / render-side-effect / JWKS-DoS).
  - The handover's own R1-check targets `#70 snapshot` / `#72 metering` were also mis-numbered
    (row 70 = billing-trial race; row 72 = render-phase side-effect).
- **Tiering corrected.** MUSTs drop from an inflated "~11" to **~10 distinct items**, each with a
  correct reference and (for billing) a bundled break-test. The Gemini item moves MEDIUM→**SHOULD-high**
  (was wrongly MUST ×2). See §8.
- **Two clusters re-cut at invariant boundaries** (the core of the architecture-first goal): consent
  authority and deletion atomicity split out of ACL/billing into their own cluster (CL-C); dictation
  + ChatShell split into an identity/idempotency cluster (CL-J). See §2.4 and §5.
- **Coverage gaps closed:** tenant-isolation backstop (CL-Q), forged-internal-event authority
  (folded into CL-H), and an explicit disposition for **every** deep-review P1 (§7).
- **Chokepoint-ledger** dropped as a planning citation (CL-1's "ledger agrees" line removed); kept
  superseded, method-provenance only.

---

## 2. Reconciliation with the parallel Codex pass (`../codex/`)

Both independent consolidations agree on the load-bearing calls: **R2 scope = 78** (76 TP + 2
uncertain), **R1 = history**, **architecture-first**, **billing must become a tested workstream not
local patches**, and **LLM metering needs a real design (metered-by-construction at `routeAndCall`)
not more route regexes**. Codex raised five corrections; after source-checking, v2 adopts all five
(one with a nuance) and additionally imports coverage Codex surfaced that v1 had dropped.

### 2.1 Codex corrections — accepted

1. **Chokepoint-ledger out of planning.** Accepted. The CL-1 "ledger agrees" citation is removed; the
   server-side-seam conclusion stands on the handover + Codex bucket 2 independently.
2. **Numbering errors.** Accepted and found to be **broader** than Codex flagged — see §1. Rebuilt wholesale.
4. **Keep consent / proxy-write / dictation as separate root causes.** Accepted, and **vindicated by
   the finding bodies** (§2.4) — this is the single most valuable correction for the "fix classes" goal.
5. **Billing HIGH_BUGs aren't done without regression tests in the same workstream.** Accepted; aligns
   with this repo's own rule ("changed code is not fixed code"; security/data fixes require a break
   test). v2 pulls per-patch break tests into the MUST tier; broad harness coverage stays SHOULD.

### 2.2 Codex correction #3 (Gemini) — accepted with a sharpened, now-resolved nuance

Codex: keep the Gemini safety-fallback (row 21) at **SHOULD-high**, not auto-MUST, absent a fresh
read proving release-blocking impact. **I read the body. Codex is right, and my proposed
"escalate-to-MUST if it re-sends to another provider" trigger is already pre-answered:**

- The body **is** MEDIUM / **low-confidence** on safety impact (high-confidence on retry+cost waste),
  and its own revalidation concludes "MEDIUM is appropriate."
- The failover re-send **does** happen ("routeAndCall retries 4× then routes the identical prompt to
  OpenAI/Anthropic") — but the author already weighed that and held MEDIUM because the downstream
  providers carry their own moderation and the Gemini block-bucket is provider-internal / not
  attacker-steerable.
- **Verdict:** one item (row 21), **SHOULD-high**, folded into the LLM-trust workstream (CL-F). Its
  high-confidence half (wasted retry budget + paid fallback on deterministically-blocked prompts)
  also overlaps the cost cluster (CL-G). Fix is localized + cheap; not release-blocking.

### 2.3 Codex additive coverage v1 had dropped — imported

- **Tenant-isolation backstop** (deep-review P1): `withProfileScope` RLS helper exists but is
  **unwired**, and docs claim a backstop that does not exist (false-confidence — exactly what this
  repo's CLAUDE.md warns about). Now **CL-Q**.
- **Forged-internal-event authority** (deep-review P1 ×2): a forged child-cap event can leak a
  child's name; a forged monthly-report event can email child data to the wrong parent. Distinct from
  PII-in-payloads. Now folded into **CL-H** with its own break tests.
- **Per-P1 disposition exit criterion.** v1 silently dropped several deep-review P1s (Neon pool churn,
  unbounded progress materialization, `autoMemoryDirectory` wrong-checkout, Inngest-registration-no-
  guard). v2 adopts Codex's rule: every P1 gets a workstream / deferral / documented non-action (§7).
- **Triage→plan bridge.** Codex's phased sequencing + "one short design note per architecture bucket"
  + "safe-to-ticket-now / do-not-ticket-yet" lists are a better next deliverable than jumping to
  tickets. Adopted as §10.

### 2.4 The two re-cuts, justified by the finding bodies

- **Consent (row 2) is NOT the proxy-write invariant.** Body: a non-owner child can POST
  `/consent/request{childProfileId:<any same-account profile>, parentEmail:<attacker>}`, then the
  **public** `/consent/respond{approved:false}` path **cascade-deletes** that profile
  (`services/consent.ts:811-814`). The finding states **`assertNotProxyMode` does not guard this
  path** — so the CL-B proxy-write fix would have missed it entirely. Merging consent into ACL would
  have shipped a guard that leaves the scariest hole (delete-arbitrary-same-account-profile) open.
  → its own cluster **CL-C**, paired with the deletion-atomicity finding.
- **Deletion (row 6) is half-fixed — scope to the profile path.** Body: the **account** path is
  already hardened (`[Fix Bug #494]`, cancellation predicate now in the `WHERE`). The **profile**
  path (`deleteProfile` via `archive-cleanup.ts`) is the live residual: unconditional
  `DELETE ... WHERE id=$1` racing `restoreConsent()`. Belongs with consent (Codex bucket 3), **not**
  billing. Do **not** re-fix the account path.
- **Dictation (row 4) is identity/idempotency, not billing.** v1 itself double-placed it (CL-2 *and*
  CL-9) and hand-waved "billing-adjacent." The fix is a per-completion identity key + migration —
  shares nothing with billing state transitions. → **CL-J** with ChatShell (row 7).

### 2.5 One Codex claim verified; one Codex hygiene note

- **Verified:** Codex's assertion that the consent denial path *deletes* the target profile is
  correct verbatim (§2.4). It materially raises this finding's standing — it is the highest-impact
  item in the set ("cross-profile data loss is explicitly the project's highest-impact threat").
- **Note:** Codex's README lists `deepsec-to-wi-map.md` (R1 history) as an input. Codex's prose stays
  disciplined about R1-as-history, but ingesting the WI-map risks R1/R2 bleed. v2 keeps the explicit
  ⟲ regression-vs-residual check (§6) as the isolated treatment of that boundary — a strength to retain.

---

## 3. Headline

The 78 DeepSec-R2 findings + parallel audits collapse into **18 root-cause clusters** (§5) under 7
themes. Three are net-new HIGH; five are HIGH_BUG (billing / data-integrity / lifecycle). The rest is
a long tail of **residuals in already-remediated classes** plus **net-new issue *types* the stronger
opus-4-8 model surfaced** that the gpt-5.5 R1 baseline had no slug for (insecure token storage, GDPR
backfill gate, billing overcharge, OIDC misuse, content-safety failover, PII-in-traces).

**The cross-stream signal that justifies fixing classes, not instances:** the same root causes
surface from *independent* audit lenses (§4). i18n found 3× (DeepSec + workflow-1 + deep-review). The
bare-catch in `dictation.ts:286` found by 2 streams (deep-review-errors + ARCH-3; **not** a DeepSec R2 row). The billing bugs
(DeepSec) and "billing has ~3,300 LOC with zero tests" (ARCH-1) are the **same story as symptom vs.
cause**.

**Three things only the parallel audits caught** (DeepSec structurally cannot see them — keep them or
they vanish): the **leaked Logfire secret** (`settings.local.json`, in ≥3 historical commits),
**screen-reader silence in the core session loop** (a11y), and the **unwired RLS backstop the docs
claim exists** (tenant isolation).

---

## 4. Cross-stream convergence map (where independent lenses agree)

| Theme | DeepSec-R2 (TSV rows) | deep-review | arch docs | workflows | Verdict |
|---|---|---|---|---|---|
| i18n hardcoded strings | #53 (ModeSwitcher) | P1 (~358) | — | wf-1 (960) | **same class, 3 streams** → one ratchet+sweep |
| Proxy-mode write authority | #1 (HIGH), #9, #10, #36, #44, #73 | server clean / client gaps | — | wf-4 (audience-matrix) | **incomplete-sweep tail** of R1 WP-ACL |
| Consent/deletion authority | #2 (HIGH), #6 (HIGH_BUG) | Inngest forged-event run | — | — | **own invariant**, not ACL/billing |
| Billing correctness | #5, #8 (HIGH_BUG), #22, #23, #38, #70 | — | ARCH-1 (0 tests) | — | **symptom (DeepSec) = cause (no harness)** |
| LLM I/O trust boundary | #19, #21, #24, #25, #28, #31, #39, #46, #49 | LLM run | ARCH-2 (casts) | wf-3 (core-send) | one boundary, 4 lenses |
| Silent failure (`dictation.ts:286` bare-catch) | *(no DeepSec row)* | errors run | ARCH-3 | — | **2 streams; DeepSec did not surface it** |
| PII / GDPR / Inngest | #26, #29, #30 | P1 Inngest PII + 2 forged-event + P2 sweep | — | — | overlap |
| Unmetered LLM cost | #12, #13, #14, #71 | — | — | — | WP-COST allowlist re-fragility |
| Race / non-atomic | #61, #64, #66, #67, #68 | — | — | — | WP-RACE residual tail |

---

## 5. Root-cause clusters (the unit of remediation)

Tags: **(a)** one structural fix dissolves most · **(b)** shared utility/convention + forward-only
guard, instances still touched · **(c)** genuinely per-instance. ⟲ = sits on an R1-touched file
(§6). Proposed tier in **bold**. Every row 1–78 is assigned to exactly one cluster (folds noted).

### Security / authority

**CL-A · CI/CD & agent-workflow trust + secret hygiene — (a/b) · MUST + SHOULD ⟲**
#3 HIGH (`claude.yml` — any @claude comment invokes a secret-backed agent), #11 (`deploy.yml`
`issues:write` over-scope), #15 (PR metadata interpolated into review prompt unframed), #16/#17
(`id-token:write` with no OIDC exchange), #20 (forgeable review-gate verdict), #35 (hardcoded seed
password fallback), #43 (latent injection sink in dead workflow branch), #50 (maestro gates on job
output, no trigger guard), #52 (`check-gc1-pattern-a` misses multiline `jest.mock` — guard-tooling
gap), #54 (required `smoke` check is a structural no-op).
**Invariant:** secret-backed automation runs only for trusted actors; untrusted issue/PR text is framed
as data; least-privilege job-local permissions; OIDC only where an exchange occurs; no tokens in local
agent settings.
**Plus deep-review P0-1: leaked Logfire `sk-lf-` secret in `settings.local.json`** (gitignored now, in
≥3 historical commits). DeepSec cannot see P0-1.
**Tier:** P0-1 + #3 = **MUST** (P0-1 has a ticking clock: rotate + history decision); the rest SHOULD.

**CL-B · Proxy-mode write authority — (a) · MUST + SHOULD ⟲**
#1 HIGH (`session/_layout.tsx` — proxy write blocked only by a client redirect; live server gap in
session library-filing), #9 (`account.ts` deletion-status read missing the owner gate its 3 siblings
enforce), #10 (`sessions.ts` library-filing writes missing proxy guard — the server gap #1 names),
#36 (`snapshot-aggregation.ts` proxy can mutate child progress), #44 (dead `childProfileId` in
`tellMentorInputSchema` — latent cross-profile IDOR footgun), #73 (`profile.ts` proxy mode not cleared
when saved profile removed — sticky contradictory state).
**Invariant:** a parent viewing a child profile is read-only unless explicitly allowed. Enforce at one
server seam — `requireWritableProfile(c, reason)` wrapping `assertNotProxyMode(c)` — + a guard test
enumerating write handlers that call `requireProfileId()` without it. Then sweep #9/#10/#36/#44/#73.
**Tier:** #1 = **MUST**; remainder SHOULD on the same seam+guard. ⟲ residual of R1 WP-ACL (client-trust
stragglers + net-new service-reachable sites).

**CL-C · Consent-target authority + destructive-lifecycle atomicity — (a) · MUST ⟲ + net-new** *(NEW; split from ACL+billing)*
#2 HIGH (`consent.tsx`+`consent.ts`+route — non-owner mints a denial token for **any** same-account
profile → public deny path **cascade-deletes** it; highest-impact finding in the set), #6 HIGH_BUG
(`deletion.ts`/`archive-cleanup.ts` — **profile path only**; account path already fixed via Bug #494).
**Invariant:** (1) a consent-request target must be a non-owner child currently *requiring* consent,
controlled by the actor allowed to initiate; (2) a public denial token may delete only a profile still
in the exact pending-consent state bound to that token; (3) destructive deletes encode the still-valid
predicate in the `DELETE WHERE` or run check+delete under a transaction/lock (the codebase already does
this for `deleteProfileIfConsentWithdrawn` — `archive-cleanup` is the one site that doesn't).
**Tier:** both **MUST** (irreversible cross-profile data loss; regulatory). Break tests: invalid-target
consent request, owner/adult target rejected, restore-racing-delete. ⟲ #2 residual (R1 WI-295 added
only a client account-membership check); #6 net-new (`archive-cleanup.ts` not in R1 scope).

### Billing / quota

**CL-D · Billing/quota state-machine correctness — (a root + c instances) · MUST + SHOULD ⟲**
#5 HIGH_BUG (trial-expiry cron downgrades a just-converted payer — missing `status='trial'` guard),
#8 HIGH_BUG (top-up credits stranded moving shared-pool→per-profile tier), #22 (RevenueCat identity-
sync caches another account's entitlement), #23 (owner top-up balance leaked to child in quota-
exceeded response), #38 (app-help early-return consumes quota with no LLM call), #70 (`downgradeQuotaPool`
day-28 transition race).
**Invariant:** every transition update carries an expected-current-state predicate; dependent
quota/top-up rows reconcile in the same transaction or via a guarded idempotent follow-up.
**Tier:** #5, #8 = **MUST, and not "done" without per-patch break/regression tests in the same PR**
(repo rule). #22/#23/#38/#70 SHOULD. ⟲ #5 residual; #8 net-new.

**CL-E · Billing test harness (ARCH-1) — (a, structural) · SHOULD (high-leverage)**
Root cause behind CL-D: **~3,300 LOC of billing/quota/idempotency with zero co-located tests.** The
per-patch break tests for #5/#8 live in CL-D (MUST); the **broad transition matrix** (trial→active,
trial→expired, shared-pool↔per-profile, webhook/cron interleavings; outcome assertions: no paid-access
downgrade, no stranded credits, no double-charge/false-deny, no child-visible owner balance) is the
SHOULD here. Without it, CL-D regenerates every feature cycle. **Highest-leverage structural call.**

### LLM

**CL-F · LLM I/O trust boundary — (b) · SHOULD (incl. SHOULD-high)**
#19 (stream extractor can show ≠ persisted reply), #21 (Gemini non-`SAFETY` block → failover re-send;
**SHOULD-high**, see §2.2), #24 (read projector leaks raw envelope when reply empty/non-string), #25
(`strip-envelope` allowlist fails open on unknown key → leaks signals), #28/#31 (learner context
interpolated into system prompt without fencing), #39 (circuit-breaker HALF_OPEN probe can leak and
wedge a provider), #46 (out-of-range `factual_confidence` hard-fails the *entire* envelope), #49
(`jwt.ts` JWKS shape unvalidated `as`-cast → wrongful 401 — cross-ref CL-O).
**Invariant:** one hardened envelope/parse/fence path; fail-closed projection; provider terminal
safety/content blocks are non-transient (no retry/failover re-send); no raw provider/JWKS casts
(AST/lint guard — ARCH-2). **Tier:** SHOULD; #21 SHOULD-high. cross-ref wf-3 core-send.

**CL-G · LLM metering / unmetered cost — (b: chokepoint) · MUST(1) + SHOULD ⟲**
#12/#13 (`quick-check` route + answer-eval reach `routeAndCall` but are absent from metering patterns),
#14 (homework-summary LLM can run without quota), #71 (recall grade computed before cooldown claim →
wasted paid call). + the high-confidence cost half of #21.
**Invariant (design decision required):** Option A — keep route metering + a coverage guard tying every
`routeAndCall`/`routeAndStream` call-site to a metered route or an explicit exemption; Option B —
metered-by-construction at the call boundary (require a metering context), **preserving per-logical-
action quota** (create-subject / homework / session-exchange share one action id; provider-cost
telemetry stays per call). Option B needs a short design note (touches pricing semantics).
**Tier:** quick-check/homework metering fix = **MUST** (money impact, real trigger — softest MUST, no
security/data/compliance angle); the guard/chokepoint = SHOULD. ⟲ residual of R1 WP-COST allowlist.

### Privacy

**CL-H · PII / GDPR / Inngest boundary + forged-internal-event authority — (b) · SHOULD (incl. SHOULD-high) ⟲** *(forged-event authority NEW)*
#26 (`session-completed-observe` logs full raw event payload incl. error strings), #29 (freeform-filing
retry sends transcript to LLM without re-checking GDPR consent), #30 (raw learner subject → Sentry).
+ deep-review P1s: **Inngest event payloads/step returns carry minors' transcripts**, **forged child-cap
event leaks child name**, **forged monthly-report event emails child data to wrong parent**.
**Invariant:** events carry ids + non-sensitive control fields only; PII is fetched inside the consuming
`step.run` (never returned); any event carrying two authority ids (owner + target child) revalidates the
relationship in the consumer; GDPR/memory consent re-checked inside background jobs before external
processing. **Tier:** regulatory → SHOULD; child-PII + forged-event-authority **SHOULD-high** (with
break tests for forged child-cap / monthly-report pairings). ⟲ #29/#36-class residual of R1 WP-CONSENT.

### Correctness / lifecycle

**CL-I · Race conditions / non-atomic writes (residual) — (c) · SHOULD/CONSIDER ⟲**
#61 (`onboarding` non-CAS version bump → lost update), #64 (`language-curriculum` regenerate
delete-all→insert race), #66 (vocabulary SM-2 RMW), #67 (`home-surface-cache` celebration writes),
#68 (`celebrations` read outside `FOR UPDATE`). Residual tail of R1 WP-RACE. Rank by blast radius:
#64/#61 SHOULD; #66/#67/#68 CONSIDER.

**CL-J · State identity / idempotency / stale-async UI — (a/c) · MUST(2) + CONSIDER** *(NEW; dictation pulled from billing)*
#4 HIGH_BUG (`dictation/result.ts` keyed only by profile/date/mode → same-day completions overwrite —
silent learner-data loss; needs a per-completion identity key + migration), #7 HIGH_BUG (dormant RN-Web
`ChatShell` voice controls call stale session handlers — needs a dormant-shell pointer/event guard, not
per-control patches), #69 (recall-test double-submit via independent in-flight guards).
**Tier:** #4, #7 = **MUST**; #69 CONSIDER. ⟲ both #4 and #7 are residuals (R1-touched files, class-incomplete).

**CL-K · Data correctness / loss (non-billing) — (c) · SHOULD/CONSIDER**
#41 (capitals duplicate aliases not actually accepted), #57 (sample-lesson buttons stay disabled),
#58 (review-calibration substring misclassifies answers), #59 (memory-facts-backfill cursor skips
errored profiles — silent data gap), #60 (child learning-prefs previews parent's accommodation),
#74/#75 (dictation/quiz timezone day-bucketing — UTC vs local off-by-one). #59 SHOULD (silent skip);
rest CONSIDER.

### Mobile / content

**CL-L · Untrusted-content rendering sink — (a) · SHOULD-high** *(NEW as its own cluster)*
#33 (`MessageBubble` renders remote markdown images → zero-click exfil / prompt-injection), #34
(`ThemedMarkdown` opens LLM links with no scheme allowlist → phishing/deep-link abuse).
**Invariant:** fix the **shared sink**, not callers — disable remote images, enforce a scheme/origin
allowlist (or render tutor-reply links as plain text), with a test at `ThemedMarkdown` level so every
caller inherits it. **Tier:** SHOULD-high (Must/Should boundary per Codex — clean broad-coverage sink
fix; no confirmed live trigger, so not MUST, but a minors-app exfil vector).

**CL-M · a11y screen-reader silence — (a, parallel-only) · SHOULD**
deep-review P1: `announceForAccessibility` used 0× → core session/quiz/loading/toast loops silent to
VoiceOver. One shared announcement hook wired to session+quiz first. DeepSec can't see this.

**CL-N · i18n hardcoded strings — (b: ratchet) · SHOULD**
#53 + workflow-1's **960** across 92 files + deep-review's ~358 (+110 a11y labels leaking English).
One Phase-3 JSXText/StringLiteral baseline ratchet (seed from wf-1) **before** the sweep, then
auth-first → high-count screens. **One program, not 960 tickets.**

### Hygiene / infra

**CL-O · Error handling / silent failure / misclassification — (c) · SHOULD**
#47 (`sessions.ts` 500+Sentry instead of 404 for unknown id), #48 (`vocabulary` review masks DB
errors as 422 + echoes raw error), #49 (JWKS misclassification — cross-ref CL-F). Plus the
`dictation.ts:286` bare `catch{}` (deep-review-errors + ARCH-3; **no DeepSec R2 row** — not in the
TSV). Classify raw error before formatting (repo rule). Small, well-localized.

**CL-P · Input validation / unbounded / crashes — (c) · SHOULD/CONSIDER**
#32 (quiz `complete-round` unbounded attempts), #55 (deep-link `homeworkProblems` JSON unvalidated),
#62 (`masteryScore` NaN), #63 (`subjectId` UUID missing → 500), #65 (`subjectId` array case), #76
(`answerGiven` no cap before O(m·n) Levenshtein), #77 (uncapped dictation chunks), #78
(`jwt.ts` unauth forced JWKS re-fetch → DoS amplification). Mobile crashes (#55/#62/#63/#65) SHOULD;
server bounds (#32/#76/#77/#78) CONSIDER — except #78 SHOULD (availability).

**CL-Q · Tenant-isolation backstop — (a, design spike) · SHOULD** *(NEW per deep-review P1)*
`withProfileScope` RLS helper exists but is **unwired**; docs claim an RLS backstop that does not
exist (false confidence). **Decision:** (1) wire real Neon/Postgres RLS for profile-owned tables and
use `withProfileScope` in live paths, OR (2) if impractical in the Worker/Drizzle model, an AST/lint
guard forbidding raw tenant-table reads outside scoped-repo/approved parent-chain joins + correct the
docs. Short design spike first. **Not before** active data-loss/security MUSTs.

**CL-R · Architecture / hygiene debt + scale P1s — (c) · CONSIDER (with explicit P1 dispositions)**
ARCH-4 + improve-codebase #1–11 (session-exchange ~3,321-LOC monolith; challenge/filing/profile/nav
seams), workflow-2 (153 GC6 internal mocks; ratchet exists), workflow-4 (audience-matrix doc citations
rotted → retire in favor of `navigation-contract`), and the small-fry rows #42 (harmless dead branch),
#45 (divergent duplicate `useRestoreConsent`), #51/#56 (dev-only gating/parse inconsistencies), #72
(render-phase `sessionStorage` side-effect). **Plus deep-review scale P1s** (Neon pool churn, unbounded
progress-lifetime materialization, Inngest-registration hand-maintained no-guard, `autoMemoryDirectory`
wrong-checkout) — these get explicit dispositions in §7, not silent burial.

**Folds:** age-gate (#18 birth-year, #37 fail-open-on-missing-birthYear) → COPPA-adjacent, SHOULD-watch,
tracked under CL-P. Token hygiene (#27 Clerk tokens to web localStorage) → SHOULD, tracked under CL-A.

---

## 6. R1-correspondence (⟲) — evidenced for the MUSTs

Method: grep `deepsec-to-wi-map.md` (R1) for each MUST's file → "R1 touched it" (regression/residual
candidate) vs "net-new file." Bodies refine regression-vs-residual.

| MUST finding | R1 ref? | Classification | Ticketing implication |
|---|---|---|---|
| #3 `claude.yml` | yes (2×) | **residual / deferred** — candidate never-closed WP-CICD / WI-95 | one targeted WI-95 check; else new ticket |
| #2 consent (`consent.tsx`+`.ts`) | yes (1×+5×, WP-CONSENT) | **residual** — R1 added only client `profileBelongsToAccount` (WI-295); server authority never added | **new** ticket (linked to WI-295) |
| #6 deletion (`archive-cleanup.ts`) | **no** | **net-new** — account path fixed (Bug #494); profile path never in R1 scope | **new** ticket |
| #5 `billing/trial.ts` | yes (1×) | **residual** — R1 touched trial, not this guard | **new** ticket (one WI confirm) |
| #4 `dictation/result.ts` | yes (2×) | **residual** — R1 fixed other dictation issues, not identity | **new** ticket |
| #7 `ChatShell.tsx` | yes (2×) | **residual** — stale-instance class, R1-incomplete | **new** ticket |
| #8 `billing/top-up.ts` | **no** | **net-new** | **new** ticket |

**Conclusion for decision #4:** essentially all MUSTs are **new tickets** (net-new or residual-
incomplete-coverage), **not reopens**. Only **#3 / `claude.yml`** is a "never-closed" candidate worth a
single WI-95 lookup before deciding new-ticket vs linked-reopen. No clean regressions found in the MUSTs.

---

## 7. Deep-review P1 disposition (exit criterion: every P1 has a home)

| Deep-review P1 | Disposition |
|---|---|
| Logfire `sk-lf-` secret in `settings.local.json` (P0) | **MUST** — CL-A (rotate + history decision) |
| Inngest payloads/step-returns carry minors' transcripts | **SHOULD-high** — CL-H |
| Forged child-cap event leaks child name | **SHOULD-high** — CL-H (break test) |
| Forged monthly-report event → child data to wrong parent | **SHOULD-high** — CL-H (break test) |
| RLS helper `withProfileScope` unwired + false doc | **SHOULD** — CL-Q (design spike) |
| Screen-reader silence in core session loop | **SHOULD** — CL-M |
| Hardcoded mobile English strings | **SHOULD** — CL-N |
| `autoMemoryDirectory` points at wrong checkout | **SHOULD** — CL-R (agent-governance; quick fix) |
| Inngest registration hand-maintained, no guard | **SHOULD** — CL-R (registration completeness test) |
| Unbounded progress-lifetime materialization | **CONSIDER** — CL-R (scale; needs profiling) |
| Per-request Neon pool churn | **CONSIDER** — CL-R (scale; runtime DB lifecycle decision) |

---

## 8. Proposed must / should / consider (re-tiered)

> "MUST" = money/data/security/compliance impact with a real trigger, ship before next release.
> "SHOULD" = real risk or high-leverage class fix, not an emergency. "CONSIDER" = improvement, no live
> failure mode.

### MUST — ~10 distinct items (down from v1's inflated ~11)
- **P0-1** Logfire secret — rotate + history decision *(CL-A; clock ticking)*
- **#3** `claude.yml` secret-backed agent invocable by any @claude comment *(CL-A; verify = WI-95)*
- **#1** proxy-write blocked only by client redirect (server seam + guard) *(CL-B)*
- **#2** consent target → arbitrary same-account profile deletion *(CL-C; highest-impact)*
- **#6** deletion **profile path** non-atomic vs restore *(CL-C; account path already fixed)*
- **#5** trial-expiry downgrades a just-converted payer — **+ break test** *(CL-D)*
- **#8** top-up credits stranded on tier change — **+ break test** *(CL-D)*
- **#4** same-day dictation overwrite — silent data loss *(CL-J)*
- **#7** dormant ChatShell voice bound to stale handlers *(CL-J)*
- **#12/#13 + #14** quick-check / homework-summary unmetered LLM *(CL-G; softest MUST — cost-only)*

### SHOULD — class fixes + real risk
**CL-E billing test harness (ARCH-1)** · CL-B remainder (#9/#10/#36/#44/#73 on the seam+guard) ·
CL-C break tests · CL-F envelope/parse/cast hardening + #21 Gemini (SHOULD-high) · CL-G metering
guard/chokepoint · CL-H PII/GDPR + forged-event authority (SHOULD-high) · CL-L markdown sink
(SHOULD-high) · CL-M a11y announce path · CL-N i18n ratchet+sweep · CL-O silent-failure ·
CL-Q tenant-isolation spike · CL-A remainder (CI perms, OIDC #16/#17, token storage #27, seed pw #35) ·
higher-blast races (#64, #61) · #78 JWKS-DoS · #59 backfill-skip · circuit-breaker #39.

### CONSIDER — debt, no live failure
CL-R (session-exchange split, GC6 mocks, audience-matrix doc, dead-code, render-purity, scale P1s) ·
mobile UI races/stale-state (#66/#67/#68/#69) · timezone (#74/#75) · server input bounds
(#32/#76/#77) · age-gate watch (#18/#37) · quiz logic (#57/#58).

---

## 9. Architecture-vs-pointfix calls (the "don't fix 78 symptoms" decisions)

Five clusters where a **structural fix + a forward-only guard** beats per-finding tickets — decide
these *before* breaking into work items. Each pairs the fix with a guard (the team's established
pattern: GC1, persona-fossil, i18n keep-rot, the WP-STALE cron guard from PR #575). Remediation unit =
**fix the class + land the guard.**

1. **CL-E billing test harness (ARCH-1)** — stand up the transition matrix, or CL-D recurs. Highest leverage.
2. **CL-B proxy-write server seam + guard** (`requireWritableProfile` + handler-enumeration test) vs. 6 client patches.
3. **CL-C consent/deletion canonical target validator + atomic guarded deletes** vs. patching two endpoints. *(NEW — would have been missed under v1's ACL merge.)*
4. **CL-G metered-by-construction at `routeAndCall`** (or coverage guard) vs. extending the allowlist a 2nd time.
5. **CL-F LLM-boundary guard** (forbid raw provider/JWKS casts; one fence/envelope path; terminal safety blocks) vs. whack-a-mole on injection/parse residuals.
   *(CL-N i18n ratchet is a 6th, already the documented Phase-3 plan; CL-Q is a design spike, not yet a committed structural fix.)*

---

## 10. Triage → plan bridge (adopted from Codex; do this next, before tickets)

**Write one short design note per architecture-first bucket**, each ending with: chosen invariant ·
files likely touched · current findings covered · guard/test required · issue-sized slices.
1. `consent-deletion-authority.md` (CL-C)
2. `proxy-mode-write-invariant.md` (CL-B)
3. `billing-transition-invariants.md` (CL-D/E)
4. `llm-metering-coverage.md` (CL-G)
5. `inngest-pii-boundary.md` (CL-H)
6. `llm-provider-safety-classification.md` (CL-F, if not folded)

**Safe to ticket immediately** (no architecture decision needed): Logfire rotation, claude.yml trust
gate, `ThemedMarkdown` sink, trial-status predicate (#5), top-up tier-transition (#8), dictation
identity (#4), ChatShell dormant guard (#7), seed-password removal (#35), core-send mismatches (wf-3).

**Do NOT ticket yet** (await the design note): individual `assertNotProxyMode` gaps, individual
Inngest PII payloads, broad i18n migration, broad LLM allowlist sweeps, RLS wiring vs AST guard,
audience-matrix line-citation patching.

**Suggested phasing:** Phase 0 contain + decide (Logfire, claude.yml, the 6 design notes) → Phase 1
MUST workstreams (each with break/regression tests) → Phase 2 systemic guards → Phase 3 a11y/i18n
burn-down → Phase 4 structural debt.

**Ticketing shape (decision #4):** mirror R1 — a "DeepSec Round 2" sprint + per-cluster Work Packages
(CL-A…CL-R) + child Items. Parallel-only items (Logfire, a11y CL-M, billing harness CL-E, i18n CL-N,
GC6 mocks, tenant-isolation CL-Q) join the same sprint as their own WPs. The live Cosmo WI DB
(`collection://36fd1119-9955-4684-8bfe-deb145e6a21f`) already holds R1 up to ~WI-325; new IDs continue
from the current max (confirm at mint time via the `notion` skill).

---

## 11. Open questions before planning (need your call)

1. **Ratify the re-tiered MUST list** in §8 (~10 items) — or adjust. (Note the softest MUST is the
   cost-only metering item #12/#13/#14; demote to SHOULD if "MUST = security/data/compliance only.")
2. **Green-light the 5 structural calls** in §9 — especially CL-E (billing harness) and the **NEW**
   CL-C (consent/deletion authority), which v1 would have missed.
3. **Confirm the ticketing shape** in §10 (DeepSec-R2 sprint + per-cluster WPs; parallel-only items as
   their own WPs in the same sprint).
4. **Resolved during this pass:** TSV #52 is the GC1-multiline-guard gap (CL-A); the `dictation.ts:286`
   bare-catch has **no** DeepSec R2 row (deep-review + ARCH-3 only, CL-O). No open numbering items remain.
5. **Should I now write the 6 design notes** (§10) — the actual next deliverable — or do you want to
   adjust clusters/tiers first?

---

### Files in this triage
- `consolidated-triage.md` — this doc (v2).
- `_r2-catalogue.tsv` — all 78 R2 findings (sev · slug · file+lines · title); the canonical `#N` source.
- `chokepoint-ledger.md` — **SUPERSEDED** (R1-baseline slice); method provenance only, do not action.
- Parallel Codex pass: `../codex/{architecture-first-remediation-strategy,consolidated-evidence-ledger}.md`.
- Source: `../2026-05-31-deepsec-handover.md`, `.deepsec/findings/`, `../deep-review/`,
  `../2026-05-29-architecture-audit.md`, `../2026-05-29-improve-codebase-architecture.md`,
  `../workflow-{1,2,3,4}/`.
</content>
</invoke>
