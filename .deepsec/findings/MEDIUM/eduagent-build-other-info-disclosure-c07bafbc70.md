# [MEDIUM] Envelope key-allowlist fails open: an envelope with an unrecognized top-level key renders raw (leaks signals/private_sources)

**File:** [`apps/mobile/src/lib/strip-envelope.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/lib/strip-envelope.ts#L35-L134) (lines 35, 36, 37, 38, 39, 40, 41, 116, 128, 129, 134)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** low  •  **Slug:** `other-info-disclosure`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

stripEnvelopeJson() is the mobile render-boundary defense that strips a leaked LLM envelope down to its `.reply` before display. The confirmation check (L128) requires `Object.keys(parsed).every(k => KNOWN_ENVELOPE_KEYS.has(k))` — every top-level key must be in the hardcoded set {reply, signals, ui_hints, private_sources, confidence} (L35-41). If any key is NOT recognized, the whole condition is false and the function returns `rawContent` verbatim (L134) — i.e. the ENTIRE envelope JSON, including `signals` and `private_sources`, is rendered into the chat bubble. `private_sources` is named to indicate hidden teaching context the learner is not meant to see. This makes the guard fail OPEN: the moment `llmResponseEnvelopeSchema` in @eduagent/schemas gains a new top-level field that isn't mirrored into KNOWN_ENVELOPE_KEYS here (a cross-package constant with no compile-time link to the schema), every leaked envelope of that shape dumps its internals to the UI rather than projecting to `.reply`. The trigger path is the documented one — a non-streaming code path that bypasses parseEnvelope/server-side projection. The two constants and the Zod schema must be manually kept in lockstep, and nothing enforces that. Severity is bounded because this is a secondary defense (the server-side projector is primary) and exposure is drift-contingent, hence low confidence.

## Recommendation

Make the fallback fail safe instead of open: when `reply` is a non-empty string and at least one structural sibling is present, project to `.reply` even if an unknown sibling key exists (an unknown key is more likely a future envelope field than user prose). Alternatively, derive KNOWN_ENVELOPE_KEYS from `llmResponseEnvelopeSchema.keyof()` in @eduagent/schemas so the set can never drift from the schema, and add a test asserting the two stay in sync.

## Revalidation

**Verdict:** uncertain

The code behavior is exactly as described: the confirmation at line 128 requires `Object.keys(parsed).every(k => KNOWN_ENVELOPE_KEYS.has(k))`, so a single unrecognized top-level key flips the whole condition false and the function returns rawContent verbatim (line 134) — the full envelope JSON including signals and private_sources. And private_sources is genuinely sensitive: the schema comment (llm-envelope.ts:474-480) states it is 'never rendered to the learner.' However, three facts make live exploitability unconfirmable. (1) No live drift: I verified the current llmResponseEnvelopeSchema (llm-envelope.ts:428-488) has exactly the five top-level keys {reply, signals, ui_hints, private_sources, confidence}, which match KNOWN_ENVELOPE_KEYS precisely — so every valid envelope today is handled correctly. (2) The leak requires a compound, non-attacker-controllable precondition: the primary server-side projector (projectAiResponseContent/parseEnvelope) must be bypassed so a raw envelope reaches the bubble, AND that raw blob must contain an unknown 6th key. A learner cannot reliably force the server-projection bypass, so this is an opportunistic leak that only coincides with a separate server bug, not a controllable exploit. (3) The 'return raw on unknown key' behavior is a deliberate CR-PR129-M7 tradeoff (lines 22-27) to avoid mangling legitimate JSON-shaped prose; inverting it reintroduces that risk. So the fail-open property is real and worth hardening (deriving KNOWN_ENVELOPE_KEYS from `llmResponseEnvelopeSchema.keyof()` so it can never drift), but I cannot confirm a reachable production path that actually leaks private_sources today. Effective severity is low/defense-in-depth given the preconditions.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-26)
- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-16)
