# Ratification-Audit Log (WS-18 takeover)

Orchestrator architecture/product judgment of the embedded decisions in the post-incident
24h PR set. Distinct from `/review`+`/qa` (mechanical AC/DoD close-gate). Verdicts:
**RATIFY** / **RATIFY-w-CHANGES** / **REJECT**. Operator ratifies the verdict.

---

## ADR-0025 (was ADR-0026) — Whole-org erasure tears down surviving relationship edges

- **Source:** PR #1309 (Zuzka session, merged to `main` `f41344ba3`); WI-849 Gap-3 build.
- **Audited:** 2026-06-20 · against ADR text (origin/main), `deletion-v2.ts` Step 2a, canon §3.2/§6.1.
- **Verdict: RATIFY-w-CHANGES** (2 minor text corrections; semantics sound).

### Findings
1. **Significance-gate: correctly ADR-class.** New deletion granularity in the data model + GDPR
   Art-17 path; hard-to-reverse behavioral contract.
2. **Decision is correct.** Whole-org erasure tears down incident `guardianship`/`supportership`
   edges (bidirectional, active+revoked), same txn, before person drop — satisfies the RESTRICT FKs
   the same proven way `consent_grant` re-home does. **Cross-org safety** (drop edge row only, never
   the out-of-org counterpart person) is correct and prevents a data-loss over-reach. RESTRICT FKs
   retained → no migration, no rollback surface, person-granularity guard intact.
3. **Code matches ADR.** `deletion-v2.ts` Step 2a deletes `guardianship` on
   `guardian_person_id ∈ P OR charge_person_id ∈ P` and `supportership` on
   `supporter/supportee ∈ P` — edges only, persons untouched. ✓
4. **Canon lockstep VERIFIED.** §3.2 (356-365) + §6.1 (489-501) edited in the same change-set,
   citing the ADR — satisfies MMT-ADR-0000 lockstep + `check-decision-adr-link`.
5. **Alternatives genuine.** CASCADE (indiscriminate), retain-table (speculative), delete-counterpart
   (over-reach), solve-subscription-here (scope balloon) — all soundly rejected.

### Required changes (fold into the ADR-0026→0025 renumber branch)
- **(a) G2 paragraph:** "escalated for a founder ruling" → **ruled MOOT 2026-06-20 (operator)**; no
  v2-live environment retains the legacy `accounts`/`profiles` tables. Gap 2 closed, not deferred.
- **(b) Subscription deferral target:** **WI-693 (CLOSED) → WI-885 (open)** everywhere it names the
  subscription-teardown deferral — the ADR text, `data-model.md` §3.2/§6.1, and the `deletion-v2.ts`
  comment. (Do NOT touch unrelated WI-693 historical mentions.)

### Residual (acceptable, documented)
- A **subscribed**-account erasure still aborts on the `subscription` RESTRICT FK until the G1 DB-row
  teardown lands (WI-849, this takeover) — and full Stripe-API cancellation lands (WI-885). This is a
  known limitation the ADR already records, not a regression.

### Disposition
- **Renumber + (a)/(b)** → shepherd, in the WI-849 takeover branch (ic-orch-224).
- **Status flip** `Proposed → Accepted` happens on operator ratification of this verdict + the landed
  renumber. Until then it stays `Proposed`.

---

## WI-620 — `review.calibration.requested` PII egress → reference-and-rehydrate

- **Source:** PR #1307 (merged `main` `a6b43c86`, +606/-67). "reference-and-rehydrate review.calibration PII egress."
- **Audited:** 2026-06-20 · against the schema diff, consumer, pii-scrub denylist, tests.
- **Verdict: RATIFY** (no changes; not ADR-class).

### Findings
1. **Sound PII-egress closure.** Removes raw `learnerMessage`/`topicTitle` from the Inngest event
   payload (Inngest persists payloads in a 3rd-party store = PII sub-processor leak); replaces with an
   opaque `learnerMessageEventId` UUID; consumer rehydrates from DB. Same pattern as WI-577.
2. **IDOR-safe rehydrate.** `review-calibration-grade.ts` reads via `createScopedRepository(db, profileId)`
   + `findOwnedCurriculumTopic({profileId, topicId})` — profileId enforced on every read.
3. **Break test present** (security-fix rule satisfied): `[WI-620 break test]` asserts the payload carries
   the opaque eventId and `not.toHaveProperty` the raw fields, serialized payload excludes the sentinels;
   plus a skip-when-no-reference test + integration twins.
4. **Breaking schema change is contained.** Single producer (`session-exchange.ts`) updated in the same PR;
   legacy in-flight events fail `safeParse` and are skipped by the consumer (a few ungraded calibrations
   over the deploy window — recoverable, not data loss). No other producers.
5. **Forward ratchet added.** `learnerMessage`/`topicTitle` added to the `pii-scrub` denylist — runtime
   guard against re-introduction.

### Disposition
- **Not ADR-class** — applies the established WI-577 reference-and-rehydrate pattern; no new contested
  decision. No ADR, no canon change needed.
- **CLOSE-eligible** once operator ratifies. The "breaking @eduagent/schemas" flag is resolved (contained).

---

## WI-558 / WI-559 — dual-use procedural refusal + source-grounding reply gate

- **Source:** PR #1306 (merged `main` `afda09e7`, +1878/-1 — but 1 substance file, rest snapshot regen).
  WI-558 = real failure "tutor gave **13yo step-by-step opium extraction**" (probe SL-DU02).
  WI-559 = source-grounding leak (model marks source insufficient, answers from memory anyway, HW04).
  Both **Stage=Reviewing**.
- **Audited:** 2026-06-20 · against `exchange-prompts.ts` diff, envelope schema, eval-llm harness.
- **Verdict: REVIEW — CHANGES REQUIRED before close** (sound direction, weak enforcement; child-safety).

### Findings
- **Substance = a single prompt change** (`apps/api/src/services/exchange-prompts.ts`); all other 50+ files
  are regenerated eval snapshots. So the policy is **prompt-only** — no server-side gate, no envelope
  signal for "refusal fired," no hard cap.
- **MUST-FIX — no behavioral regression test.** The fix for a CRITICAL child-safety failure (13yo opium
  extraction) added only deterministic snapshot regen, which proves the prompt *text* changed, NOT that the
  model *refuses*. AGENTS.md Fix-Development-Rules require a negative-path break test attempting the exact
  attack for HIGH/CRITICAL. **SL-DU02 / HW04 do not exist as committed fixtures anywhere, and there is NO
  committed adversarial/red-team eval harness at all.** A future prompt edit silently regresses the leak
  with nothing to catch it.
- **OPERATOR DECISION — the "dosing/administering" refusal may misfire harmfully.** "NEVER give … DOSING"
  could refuse a minor's legitimate medication-safety question ("is this an overdose / how much is safe"),
  where a flat refusal is itself the harm. Needs a product ruling: carve out safe-dosing / overdose-threshold
  (answer-with-care or route to adult/poison-control) vs. let the blanket refusal stand.
- **OPERATOR DECISION — no governance record.** Policy lives only as a prompt string (silently reversible,
  invisible to governance). Record in safety canon (`docs/compliance/identity-compliance-register.md` or a
  safety-policy ADR) — the ratification-class "safety-prompts" surface.

### Keep (sound)
- Teach-vs-how-to line is pedagogically correct (teach what an item IS = legitimate science ed; refuse the
  operational route) — better than blanket refusal. Anticipates the framing jailbreak + the mid-conversation
  "what is it → how is it made" slide. Source-grounding gate ties to the real `private_sources.insufficient`
  envelope signal.

### Disposition
- **HOLD close** (both Reviewing). MUST-FIX #1 (codify SL-DU02 + HW04 as `pnpm eval:llm --live` regression
  assertions) → a follow-up WI (or added to 558's AC). #2 + #3 need operator rulings.
- **Systemic flag (bigger than 558/559):** a product serving minors has **no committed adversarial eval
  harness**. Candidate for a dedicated WI (Bug Lane or a safety PRG).

---

## MMT-ADR-0024 — Scope chip supersedes mode/proxy tab-shape navigation

- **Source:** PR #1275 (Proposed). V2 app-shell nav + relationship-lens data access.
- **Audited:** 2026-06-20 · against scope-resolution.ts, navigation-contract.ts, the alternatives.
- **Triage:** ADR-class 5/5. **Content verdict: DECISION SOUND — ratify; one enforcement flag.**

### Findings
1. **Centralizing scope ownership is correct.** Rejecting per-screen filters (scope re-decided per screen =
   the IDOR-risk pattern) and proxy-promotion (proxy = operate-AS-child, wrong lens) is right. The machinery
   already exists: `scope-resolution.ts` derives the chip list from **active** supportership edges
   (`isNull(revokedAt)`) — edge-derived + active-only as specified.
2. **Edge-derived boundary is coherent.** Supportership = everyday viewing lens; guardianship/org/payer do
   NOT create a chip scope (consistent with MMT-ADR-0008: guardianship is a distinct *operation*). Verified
   the parent-views-child case is NOT stranded — it's served by a **separate `FamilyHome` surface**
   (navigation-contract.ts), not the chip.
3. **Access-control principle is right** ("server asserts active supportership before supportee reads; client
   hiding is not access control").

### The one flag (acceptance gate, not a design flaw)
- The security guarantee is only as strong as its enforcement at **every** supportee-data-reading endpoint.
  The ADR states the rule; a single endpoint that reads supportee data without the assert = an IDOR. Acceptance
  should require a **forward conformance guard** (GC1/persona-fossil pattern) proving assert-before-read coverage
  — otherwise the guarantee is paper.

### Disposition
- **Ratify the decision.** On operator sign-off, Status Proposed→Accepted + the architecture.md "Scope Chip
  Relationship Lens" canon lands lockstep. Implementation conformance (the coverage guard) is the build gate.

---

## MMT-ADR-0023 — Defer subject creation for short freeform conversations

- **Source:** PR #1245 (Proposed). Amends MMT-ADR-0021 D3 ("subject required up front").
- **Audited:** 2026-06-20 · against ADR-0021, the V2 spec §3.1, sessions.ts schema, the alternatives.
- **Triage:** ADR-class 4/5. **Content verdict: DIRECTION SOUND — ratify the direction; risk is in the fork.**

### Findings
1. **"Defer, don't guess" is the right answer.** Genuinely cross-subject openers ("analysis", "translation")
   are irreducibly ambiguous at turn-1; "not a stronger guesser" is correct. Aligns with V2 spec §3.1 ("first
   subject through the conversation, not a setup form"). Alternatives correctly rejected (S1 eager+override =
   floor not fix; stronger classifier = unsolvable; status-quo = recurring mis-commit).
2. **The risk lives in the deferred M1/M2 fork, not the direction.**
   - **M1 (nullable subjectId + null-sweep):** high blast radius — NOT NULL→nullable on core session tables
     touched by every read path; interacts with the `createScopedRepository`/profileId-protection
     non-negotiable (a nullable subject must not open a scoping hole). Needs the spike.
   - **M2 (draft buffer):** new lifecycle (abandonment, idempotent replay, metering attribution).
3. **Missing third option to add to the spike:** a **sentinel "pending" subject** — always create a real
   per-session subject row (satisfies NOT NULL, NO migration, NO new draft store), rename-or-discard on
   crystallization. Costs: transient subject rows + orphan cleanup + merge-on-crystallize. Avoids both M1's
   null-sweep and M2's draft lifecycle; worth weighing in the spike.

### The hard gate (either mechanism)
- The safety-tripwire + metering MUST cover the subjectless/pending opening turns — a subjectless opener must
  not become an unmetered, un-tripwired chat loophole. Make this a hard acceptance criterion.

### Disposition
- **Ratify the DIRECTION.** Acceptance = approve the direction + commission the M1/M2/sentinel spike (measure
  null-handling blast radius) — NOT a greenlight of a specific build. Canon lockstep (architecture.md/PRD
  persistence-boundary) lands with the chosen mechanism.
