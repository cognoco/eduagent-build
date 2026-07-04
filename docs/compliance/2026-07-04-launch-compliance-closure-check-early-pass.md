# Launch Compliance Closure Check — EARLY PASS

**Work item:** WI-1507 (Complete launch compliance closure check against actual data flows) · **Pass:** EARLY (run-twice rider; a FINAL GATE re-run is owed before store submission) · **Date:** 2026-07-04 · **Reviewer:** launch-compliance shepherd (WS-29).

**Method:** source-of-truth code audit (grep/read, `file:line`) cross-checked against the compliance artifacts. Not a policy-doc reading. Live-prod catalog state is out of lane — flagged as an ops action, not asserted here.

> **What this is / is not.** This note is **engineering evidence feeding the DPO/counsel launch decision** — it is not itself the C-5 launch gate. The go/no-go below is an engineering-readiness verdict; the legal go/no-go is the DPO's on a signed DPIA.

**Artifacts reviewed:** `docs/compliance/dpia.md`, `docs/compliance/ropa.md`, `docs/compliance/identity-compliance-register.md`, `docs/privacy-policy.html`, `docs/screenshots_and_store_info/app-privacy-data-safety-worksheet.md`, `docs/audit/2026-06-07-data-retention-and-erasure-audit.md`. Code: `apps/api/src/services/identity-v2/*`, `apps/api/src/services/llm/router.ts`, `apps/api/src/middleware/account.ts`, `apps/api/src/routes/{account,homework}.ts`, `packages/schemas/src/age.ts`, `packages/database/src/schema/*`, mobile hooks.

---

## Bottom line — engineering-readiness verdict

**NO-GO for onboarding the first real consent-gated child today** — gated on the **C-5 DPIA launch gate** (DPIA is an unsigned v0.1 draft; DPO unappointed). That is a **legal/process** gate, not an engineering defect.

**The engineering substrate is in materially good shape.** The identity-foundation (v2) schema the DPIA assesses is **built and unconditionally live in production**, and three of the DPIA's own launch-blocking conditions are now **met in code** (below). The residual work is (a) legal sign-off + counsel-set values, (b) doc-currency fixes, and (c) a small set of code-vs-doc contradictions this pass surfaced.

---

## Bucket A — progress the DPIA/ROPA do not yet reflect (MET in code)

The DPIA (draft 2026-06-08) and ROPA both assert the target schema is *"ratified but **not yet built**; execution is post-Phase-P, gated on WI-530; launch is downstream of building it."* **That framing is now stale.** The v2 substrate is live:

- `apps/api/src/middleware/account.ts:143` calls `resolveIdentityV2` **unconditionally** for every authenticated request — `login → person → membership → organization` is the sole identity-resolution path. No `IDENTITY_V2_ENABLED` flag exists in production code (test-only; not in `config.ts`).
- `knowledge_assertions` + `deletion_audit` tables exist and are actively written — `packages/database/src/schema/identity.ts:548-564,678-710`; `deletion_audit` inserted at `deletion-v2.ts:521,578,644,740,798` and `consent-v2.ts:605`.

Against this, **DPIA §"Launch-blocking conditions" #3 and #5 are satisfied in code**, and the §6.2 "incomplete erasure" mitigations are wired:

| DPIA condition | Status in code | Evidence |
|---|---|---|
| #3(a) New delete flow erases external **Clerk identity** | **MET** | `account-deletion.ts:118-204` captures `clerkUserId` pre-delete, calls `deleteClerkUser()` after DB cascade confirms |
| #3(b) New delete flow erases **`byok_waitlist`** email | **MET** | `deletion-v2.ts:538-543` (`tx.delete(byokWaitlist).where(eq(email, ownerEmail))`) |
| #5 Consent flow on the `consent_grant` event log; `lawful_basis` recorded; `deletion_audit` written | **MET (structurally)** | `consent-v2.ts` writes `consent_grant`; erasure re-homes to `person_retain`/`consent_receipt` — closes the legacy I-C1 receipt-destruction defect by construction |
| 30-day transcript purge running | **MET** | `RETENTION_PURGE_ENABLED=true` in prod Doppler (verified 2026-06-08); cron `transcript-purge-cron.ts` purges `session_events` at 30d |
| Voice = transcription-only, no emotion inference (C-2 / DPIA A14) | **MET** | `use-speech-recognition.ts` = on-device OS STT, text only; no raw-audio upload; emotion terms appear only as prohibitions |
| Gemini excluded for under-18 (C-1 / DPIA 6.4) + **CI guard** | **MET** | `router.ts:648-681` (legacy age gate) + `426-435,501-518` (v2 fail-closed `FALLBACK_FORBIDDEN={gemini,vertex}`); guards `router.policy-wiring.test.ts`, `router.fallback-compliance.test.ts` |
| No AI-training toggle rendered to minors (C-1) | **MET (vacuously)** | No `aiTraining` toggle exists anywhere in `apps/mobile/src` — render-gate cannot fire |

Deletion/export/consent flows confirmed to match the privacy policy: **7-day** deletion grace (`deletion-v2.ts:104-105`), **7-day** consent-withdrawal grace then cascade delete (`consent-revocation.ts:162,197,403-411`), owner-only export (`account.ts:266-271`). Homework images are **transient — not retained** (`homework.ts:101-177`: in-memory OCR, no DB/object-store write), closing the data-safety worksheet's open question.

**Action (doc-owner):** update the DPIA + ROPA substrate framing from "not yet built / downstream of building" to "built and live," and perform the DPIA's own required *"re-confirmation pass against the built schema with live `file:line`"* — this note supplies most of it. **The DPO is currently being asked to sign a document that describes the system as unbuilt when it is live.**

---

## Bucket B — pre-tracked launch conditions still OPEN (not new)

These are already in the DPIA/ROPA/privacy-policy as launch gates; status confirmed still open:

1. **DPO appointed + DPIA signed** (C-5, DPIA #1). — legal/process. **HARD BLOCKER.**
2. **Provider DPAs signed** on business tier + US-transfer checks (DPIA #2). Gemini *enforcement* is done in code; DPA *signatures* are process, unverifiable from the repo.
3. **Privacy-policy pre-publish TODOs** (DPIA #4): DPO name, controller registered address, EU Art 27 rep, UK rep, final age-floor confirmation — open in the `PRE-PUBLISH TODO` HTML comment (`privacy-policy.html:67-73`).
4. **`person_retain.*.retention_period` values set** (not placeholder) — counsel-owned (DPIA #7, ROPA open items).
5. **Policy-engine jurisdiction content populated** for launch jurisdictions — PM-owned compliance-population workstream (DPIA #8). **Status unknown — confirm before go-live.**

---

## Bucket C — NEW contradictions this pass surfaced (not in the DPIA's list) → DECISIONS

Route to the named owner; presented as open, not pre-resolved:

- **C1 — Privacy policy analytics OVERCLAIM.** §3 claims *"aggregated, de-identified analytics."* No product-analytics system exists — the only telemetry is Sentry error monitoring (`package.json` has only `@sentry/*`; mobile `lib/analytics.ts` writes Sentry breadcrumbs; `routes/analytics.ts` only HMAC-hashes a profileId and transmits nothing). An affirmative disclosure of processing that does not occur. **Decision (policy-owner/counsel):** soften §3 to "error monitoring only (Sentry)" **or** implement the analytics it describes. *Recommend: amend the policy.*

- **C2 — DPIA A13 name-minimization claim vs code.** DPIA §4 / A13 claim identifiers are *"stripped from LLM requests."* The learner's **first name is sent verbatim** to the LLM (`exchange-prompts.ts:734`). For a children's product, an affirmative false minimization claim in a legal doc is the material issue. **Decision (product + counsel):** *tokenize/strip* the name before the prompt (name in UI, token in prompt may preserve pedagogy) **or** *amend the DPIA* to disclose that the first name is sent to processors. Do not foreclose the strip option.

- **C3 — Controller-entity mismatch.** Privacy policy names the controller **"Cognoco s.r.o."** (`privacy-policy.html:21,66`); DPIA + ROPA say controller *"[legal entity name — TODO], established in Norway."* Clean factual contradiction. **Decision (counsel):** reconcile the controlling legal entity across all three before publish.

- **C4 — Privacy-policy profiling disclosure (C-1 canon / GDPR Art 13(2)(f)).** Adaptive profiling is real (`learning_profiles`, mastery, `needs_deepening_topics`). The canon requires copy to disclose profiling **as present and lawful** and never claim ADM is engineered out. The policy discloses "personalised tutoring / coaching insights" but not profiling explicitly. **Decision (policy-owner):** add an explicit profiling-present-and-lawful disclosure line.

- **C5 — Store data-safety worksheet is stale** (dated 2026-05-15). Says minimum age **11** (`MINIMUM_AGE=11`); code is **13** (`packages/schemas/src/age.ts:10`). Cites **legacy** tables (`accounts.email`, `profiles.display_name`, `consent_states`, `family_links`); production identity/consent is v2 (`person`/`login`/`consent_grant`). Its "homework image retention" and "raw audio" open questions are now resolved (transient / transcript-only). **Action (before store submission = the FINAL GATE):** refresh the worksheet against current code.

---

## AC4 tie — WI-1442 (consent audit-trail survival) + the prod-catalog check

The **live v2 delete path is compliant**: it writes a surviving `deletion_audit` and re-homes `consent_grant → consent_receipt` (`person_retain`) before cascade — structurally closing the legacy consent-receipt-destruction defect. **Residual risk = whether the three legacy delete paths WI-1442 names are still reachable in production.** That is exactly **WI-1442**'s AC1 ("audit which legacy paths are still reachable post-identity-v2 cutover") — **still Captured/open**. This pass ties its finding there rather than duplicating it.

Reachability hinges on prod schema state: migration `0129_m_repoint.sql` re-pointed live FKs to v2 tables, but the legacy-table **DROP** (`apps/api/drizzle/_freeze-only/0118_m_drop.sql`) is `@freeze-only` — **not in the applied chain**; `identity-graph.ts:358-378` still dual-writes legacy tables behind a runtime `tableExists('accounts')` check. The repo **cannot prove** legacy tables are gone from prod.

**Action (ops / orchestrator — live-prod read, out of shepherd lane):** run `SELECT to_regclass('public.accounts'), to_regclass('public.consent_states');` against staging + prod. If non-null, feed the result into WI-1442's reachability audit (a still-present legacy table + a reachable legacy delete path = a real consent-audit-survival gap).

---

## Go / No-Go

| | |
|---|---|
| **Engineering readiness** | **Substantially ready.** v2 substrate live; erasure/consent/retention/LLM-routing verified against the assessed design; Gemini-under-18 CI-guarded. |
| **Legal / process gate (C-5)** | **NOT MET** — unsigned draft DPIA, no DPO. **This is the launch gate.** |
| **Overall (first real child)** | **NO-GO** until Bucket B #1–#5 close. Bucket C are should-fix contradictions (fix before/at launch, route to owners). |

**FINAL GATE (run-twice) still owed before store submission:** re-run this check against then-current code + refreshed store worksheet (C5) + prod-catalog result, and confirm Bucket B closures. Lifecycle of this second pass (keep WI-1507 open vs a sibling FINAL-GATE WI) is an orchestrator decision — surfaced in the WS-29 signal.
