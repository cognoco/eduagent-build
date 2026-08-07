# Suitability-judge output gate — display timing and residual exposure

**Status:** draft for DPO review · 2026-08-01
**Controller:** ZWIZZLY AS · **Product:** MentoMate
**Subject:** timing semantics of the minor-facing suitability-judge output gate
**Relates to:** MMT-ADR-0016 §1–§3 (safety and judge architecture), WI-1365,
DPIA safeguarding sections

---

## 1. Why this note exists

The suitability judge is a safeguarding control for under-18 learners. On one of
the two response paths it operates as a **post-display replacement** rather than a
**pre-display block**. That distinction is not visible from the control's name or
from the ADR, and it is material to how the safeguard should be described in the
DPIA. It is recorded here deliberately rather than left to be discovered during
review.

**No learner is currently exposed.** The mechanism is inert
(`JUDGE_ENFORCEMENT_ENABLED` defaults to `false`, `apps/api/src/config.ts:251`),
the product is pre-launch, and there are zero users. No enforcement threshold has
been set: MMT-ADR-0016 §3 phase-5 requires the threshold be calibrated from real
minor-traffic verdict data before the flag is flipped.

## 2. What the control does

A judge model evaluates the tutor's candidate reply against an
age-appropriateness rubric and returns a structured verdict. When the verdict is
`violation`, the reply is withheld and replaced. It is the last stage in the
response pipeline, running **after** the deterministic gates (dangerous-procedure
gate, minor PII-echo gate), over already-gated text.

The judge is vendor-independent of the tutor and runs non-reasoning, per
MMT-ADR-0016 §2.

**Scope limits (by design, MMT-ADR-0016 §1 — over-blocking is a hard failure
equal in weight to under-blocking):**

- Minor-only. An adult learner never invokes the judge.
- Unknown age fails **closed** to minor; a learner who fails closed to minor but
  computes as `adult` by year-only maths is framed to the stricter `adolescent`
  rubric.
- Blocks **only** on `overall === 'violation'`. A `concern` verdict never blocks
  (telemetry only).
- Category allowlist: never blocks on `over_blocking` or `topic_drift`. A
  `violation` flagged exclusively with allowlisted categories passes.
- Judge unavailable (route error, no JSON, invalid schema) → **fails open** and
  raises a structured operator alarm. Fail-closed is reserved for a concrete
  `violation` verdict.
- Unknown tutor vendor → fails open with alarm, because vendor-independence
  cannot be resolved and blocking on a guess is not justified.

## 3. The timing distinction

The gate is invoked at the same point in both response paths, but the paths differ
in whether anything has already reached the learner.

| Path | Code | Behaviour | Exposure |
|---|---|---|---|
| **Non-streaming** (`exchange.process`) | `apps/api/src/services/exchanges.ts:2086` | Nothing is displayed until the response returns. The gate runs before return, so a blocked reply is never rendered. | **None — true pre-display block** |
| **Streaming** (`session-exchange.stream`) | `apps/api/src/services/session/session-exchange.ts:5016` | Tokens stream to the client as generated. The judge evaluates the completed reply, and a block rides the `sourceReplacement` rail (`:5046`) so the client replaces text it has already displayed. | **Yes — post-display replacement** |

The streaming path is the primary interactive surface.

## 4. Residual exposure — statement

On the streaming path, a minor **may briefly see reply text that the judge
subsequently rules a violation**, for the interval between that text being
streamed and the verdict returning. Fail-closed protects the persisted record and
the final rendered state; it does not prevent the text having been momentarily
visible.

**The interval is currently unmeasured.** It spans from the emission of the
relevant tokens to completion of generation plus judge round-trip. The judge runs
non-reasoning, so its round-trip is expected to be short, but this should be
measured before the flag is flipped rather than asserted.

Two properties bound the exposure:

- **The judge is a backstop, not the only layer.** MMT-ADR-0016's v1 posture is
  vendor refusal + prompt-layer safety preamble + judge + a deterministic
  intent-shaped tripwire floor for the two catastrophic categories (self-harm
  method-seeking, CSAM). Content reaching the judge has already passed the
  preamble and the deterministic gates. The judge backstops the router's
  content-category refusals that have no deterministic backstop (MMT-ADR-0016 §3
  phase-5, Gap B).
- **Fail-open by construction.** Because judge unavailability passes the reply
  through with an alarm, the control is best-effort by design. It reduces
  exposure; it does not eliminate it. This is a deliberate choice — an unavailable
  judge is an availability failure, not evidence that content is unsafe, and
  blocking on it would convert an outage into a mass over-block.

## 5. Why it is designed this way

Buffering the reply until the verdict lands would remove the exposure window, at
these costs:

- The learner would wait through generation **and** judge round-trip before seeing
  any text, replacing progressive display with a single delayed block of text.
- That penalty would fall **exclusively on under-18 learners** — the group the
  control protects — producing a visibly slower product for minors than for
  adults.
- It would diverge from the deterministic gates, which already use the same
  replacement rail, fragmenting the gating architecture.

Streaming with replacement is the standard pattern for this trade-off, and it is
consistent across every gate in the pipeline.

## 6. Alternatives considered

1. **Buffer until judged (minors only).** Rejected for the reasons in §5 —
   materially degrades the protected group's experience; revisit if measured judge
   latency proves low enough to make the penalty negligible.
2. **Disable streaming for minors entirely.** Rejected — same objection, larger.
3. **Block on `concern` as well as `violation`.** Rejected — MMT-ADR-0016 §1 treats
   over-blocking as a hard failure equal to under-blocking; a `concern` threshold
   would produce spurious refusals.
4. **Fail closed on judge unavailability.** Rejected — converts a provider outage
   into a total block for minors.

## 7. Open items before the flag is flipped

1. **Measure** the streaming exposure window and the judge round-trip on the
   minor path. Currently unmeasured.
2. **Calibrate** the enforcement threshold from real minor-traffic verdict data
   (MMT-ADR-0016 §3 phase-5 requirement — no threshold may be set before this).
3. **Confirm** with the DPO that post-display replacement is an acceptable
   safeguard characterisation for the DPIA, or that §6 alternative 1 should be
   adopted for minors.
4. **Re-verify** this note if the tutor or judge model, provider, or the streaming
   architecture changes — a provider change is already a DPIA review trigger.

## 8. Code references

| Element | Location |
|---|---|
| Gate decision + orchestrator | `apps/api/src/services/suitability-gate.ts` |
| Judge invocation | `apps/api/src/services/policy-engine/judge-suitability.ts` |
| Streaming call site + replacement rail | `apps/api/src/services/session/session-exchange.ts:4998–5047` |
| Non-streaming call site | `apps/api/src/services/exchanges.ts:2076–2095` |
| Feature flag default (`false`) | `apps/api/src/config.ts:251` |
| Blocked / unavailable telemetry | `emitSuitabilityBlockedEvent`, `emitSuitabilityJudgeUnavailableEvent` |

> **Note on vendor-independence, for a separate thread:** the runtime
> independence check passes `tutorVendor: result.provider` — the *serving host*
> enum, not the model developer. MMT-ADR-0016 §2's stated rationale is shared
> blind spots, which is a property of training lineage. The two readings coincide
> today but would diverge if tutor and judge were hosted by the same provider.
> Tracked separately; not a finding of this note.
