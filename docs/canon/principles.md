---
title: MentoMate Principles & Invariants Catalog
status: CANON
last_updated: 2026-08-03
owner: Stream 2 (PRG-20) — estate-canon drain
---

# Principles & Invariants Catalog

The cross-cutting **index** over the domain canon, per `MMT-ADR-0000` §I.3:
each entry is a stable principle ID, a one-line statement, and a pointer into
the canon section that elaborates it — plus links to the ADR that established
it and the guard that enforces it, where those exist. **The rule text lives in
the pointed-at canon, never here.** The durable join is the ID: the canon
section carries the same `[PRIN-NN]` token as a grep-resolvable marker, so
headings can be renamed without breaking the bind. This file is the
conformance surface the `MMT-ADR-0000` §II.1 significance gate reads against.

Seeded by the Stream 2 estate-canon drain (PRG-20; D4 ruled 2026-07-15; index
shape ruled 2026-08-01; drafted under WI-2051 and landed under it per the
operator's 1c ruling on WI-2052's completion fork, 2026-08-02). Pointer homes
follow the 2026-08-02 restructure beat rulings: rule text ruled *keep* remains
in `AGENTS.md` with markers in place; migration of that text into L1 canon
(`docs/architecture.md`) is the planned convergence follow-up and retargets
only the pointers, never the IDs. Every entry re-verified against source
2026-08-03.

## Engineering rules

Elaborated in `AGENTS.md` § Non-Negotiable Engineering Rules (marker = the
ID; ruled keep 2026-08-02). Deep elaborations where they exist:
`docs/architecture.md` § Enforcement Rules (scoped reads, LLM envelope),
`docs/project_context.md` (safeSend, Challenge Round).

| ID | Principle | Established by | Enforced by |
|---|---|---|---|
| PRIN-01 | `@eduagent/schemas` is the shared contract — never redefine API-facing types locally | — | `@nx/enforce-module-boundaries` (barrels) |
| PRIN-02 | Business logic lives in `services/`, never in route handlers | — | eslint G1/G5 (`eslint.config.mjs`) |
| PRIN-03 | Scoped-table reads go through `createScopedRepository(profileId)`; sanctioned deviations pin `profileId` in the WHERE clause | — | — |
| PRIN-04 | Writes verify ownership via explicit `profileId` or the parent chain | — | — |
| PRIN-05 | Shared mobile components stay persona-unaware — semantic tokens, no hardcoded hex (SVG brand components excepted) | — | — |
| PRIN-06 | Durable async work goes through Inngest — never fire-and-forget from route handlers | — | — |
| PRIN-07 | LLM calls route through `services/llm/router.ts` only — no direct provider SDK calls | — | eslint G3 (`eslint.config.mjs`) |
| PRIN-08 | Non-core Inngest dispatches go through `safeSend()`; bare `inngest.send` is core-only and `// core-send:`-annotated | — | `safe-non-core.guard.test.ts` |
| PRIN-09 | State-driving LLM responses use the structured envelope, parsed with `parseEnvelope()`, with a hard cap per signal | — | `scripts/check-prompt-markers.sh` |
| PRIN-10 | LLM prompt changes run the eval harness (Tier-1 snapshot; Tier-2 live) | — | pre-commit eval-snapshot guard |
| PRIN-11 | Challenge Round mastery is server-owned and conservative over structured LLM evidence | `MMT-ADR-0014` (routing tiers) | — |

## Sanctioned exceptions

Registry (the do/don't list) in `AGENTS.md` § Known Exceptions to Engineering
Rules; per-exception rationale in `docs/known-exceptions.md` (marker = the ID).

| ID | Principle | Established by | Enforced by |
|---|---|---|---|
| PRIN-22 | Sanctioned deviations from the engineering rules are registered — never "fix" a registered exception in an unrelated PR, never take one as precedent | per-entry operator rulings (WI-1040/1043/1160/1556/2107) | — |

## Code quality guards

Elaborated in `AGENTS.md` § Code Quality Guards (marker = the ID; ruled keep
2026-08-02), except PRIN-19 and PRIN-20, whose canonical text lives in
`.claude/memory/project_known_bug_patterns.md` (markers at the pattern
headings; catalogued per WI-387 row 4).

| ID | Principle | Established by | Enforced by |
|---|---|---|---|
| PRIN-12 | No internal mocks in integration tests — mock only true external boundaries | — | — |
| PRIN-13 | No new internal `jest.mock()` (GC1) — `jest.requireActual()` with targeted overrides instead | — | GC1 CI ratchet (`scripts/check-gc1-pattern-a.ts`) |
| PRIN-14 | Fetch Response bodies are single-use — never both `.json()` and `.text()` | — | — |
| PRIN-15 | Classify raw errors before formatting them for display | — | — |
| PRIN-16 | Removing a feature removes every artifact — types, keys, constants, fallback branches | — | — |
| PRIN-17 | Verify JSX handler references exist after adding any `Pressable`/`Button` | — | — |
| PRIN-18 | Every test-file edit removes the internal mocks it finds (GC6 boy-scout) | — | `post-edit-jest-mock-check.sh` PostToolUse hook |
| PRIN-19 | No silent fallbacks — a failure must never look like success to the caller | — | — |
| PRIN-20 | Async mutation handlers guard concurrency with synchronous ref locks, not React state alone | — | — |

## Product interaction invariants

| ID | Principle | Established by | Enforced by |
|---|---|---|---|
| PRIN-21 | Every AI-driven interaction carries a human override — the user can always reach an outcome the system did not propose; never a license to route around safety, age gating, or consent | Operator ruling (OPQ-62 carry-over, 2026-07-11); formalization drafted in `MMT-ADR-0046` (**Status: Proposed**, pending Architecture sign-off — this entry confers no ADR authority) | — |

> PRIN-21's canon elaboration home is `ux-design-specification.md` per the D6
> ruling (2026-07-14); that section is not yet landed, so the pointer above
> rests on the operator ruling and the Proposed ADR draft until it is — no
> `[PRIN-21]` marker exists yet. See the WI-2051 extraction draft § open
> questions.
