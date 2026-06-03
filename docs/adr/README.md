# Architecture Decision Records (`MMT-ADR-NNNN`)

The repo's **decisions layer** — the *why* behind contested, significant choices. Ratified by [`MMT-ADR-0000`](./MMT-ADR-0000-documentation-layer-model-and-decisions-layer.md), which is the canonical explanation; this README is the short operating guide.

> **Home.** ADRs live here, in `docs/adr/` — the decided L2 home (MMT-ADR-0000 §I.4). The broader `docs/` reorganisation the target structure implies (canon into `docs/canon/`, the `assets/` + `_archive/` drains) is a deferred follow-up.

## When does something need an ADR? — the significance gate

Write an ADR when the decision is **architecturally significant** — when **any** of these hold (the same gate the `decision-adr-link` ratchet enforces on specs/plans; full text in MMT-ADR-0000 §II.1):

1. **Deviates** from a documented principle, pattern, standard, or constraint — including the CLAUDE.md "Non-Negotiable Engineering Rules" (comply-or-explain; the strongest trigger).
2. **Constrains others** — establishes or changes an invariant, contract, or interface future work must follow.
3. **Moves a quality attribute / NFR** (security, privacy, performance, cost, availability, a11y) or changes an FR/AC.
4. **Structural or cross-cutting** — module boundaries, data model / flow, dependencies, public interfaces, or a concern spanning many components.
5. **Selects or replaces a foundational technology or pattern.**

**Release valve — decide inline, no ADR:** the choice is local, reversible, *and* conforms to existing principles, and no reader would ask "why this way?" The list is an OR and **defaults to flag it** — when in doubt, it is significant. Routine, reversible, conforming choices are not ADRs.

## The lockstep rule (the thing that prevents drift)

A decision has two halves that must move in **one change-set**:

- the **ADR** records the immutable *why* (dated; superseded by later ADRs, never silently edited);
- **canon** (`architecture.md` / `PRD.md` / `CONTEXT.md`) records the living *what* — the plain current rule.

When a decision lands or changes, you touch **both** in the same commit/PR. Never write the ADR and leave canon stale, or edit canon without the ADR. When an ADR's rule should bind future work, **promote** it — the rule graduates into canon while the ADR remains the dated *why++* (MMT-ADR-0000 §II.3).

## Format

- **Filename:** `MMT-ADR-NNNN-kebab-title.md` (zero-padded 4 digits; flat, domain-agnostic sequence). `MMT` = MentoMate, mirroring the estate's `NEX-ADR-NNNN`.
- **Header:** `# MMT-ADR-NNNN — <title>` then a status line: `**Status:** Accepted (context, date) · **Scope:** … · **Deciders:** …`. Add `**Amends:**` / `**Supersedes:**` / `**aka:**` when relevant.
- **Body:** `## Context` → `## Decision` → `## Consequences` → `## Alternatives considered`. See `MMT-ADR-0001` / `0002` for the house style; `0004`–`0006` are the seed examples.
- **Prose wrapping:** soft-wrap — one physical line per paragraph (and per list item). Do not hard-wrap at a fixed column. Renders identically on GitHub, avoids ragged lines, and keeps edits clean.
- **Reconstructed ADRs** (written after the fact during backfill) carry a `reconstructed YYYY-MM-DD` note; where the original *why* is unrecoverable, record the decision plainly rather than invent a rationale.

## Chunking a large doc (reactive, not a policy)

Splitting a large canon or spec doc into per-concern files is reactive editorial practice, not an ADR-class decision (MMT-ADR-0000 §I.5). Do it only in response to **demonstrated contention** (churn + multiple owners colliding), never as a size-triggered mandate. When you do: chunk **by concern plus a dedicated cross-cutting chunk**; keep a **mandatory principle index** (the principles catalog); and keep a spec's decision heading and its `MMT-ADR` link **in the same file** (the ratchet links at file granularity).

## The ratchet (`scripts/check-decision-adr-link.ts`)

CI (`.github/workflows/docs-checks.yml`) fails a `docs/specs|plans` change that adds an ADR-class decision block (a "Decisions / Alternatives / Trade-offs" heading) **without** linking an `MMT-ADR-NNNN`. Today's embedded decisions are grandfathered in `scripts/decision-adr-link-baseline.json` (the backfill is deferred).

- Fix a flagged file: write the ADR, reference its ID in the spec/plan.
- Genuine false positive (a "Decisions" heading that isn't ADR-class): `pnpm run check:decision-adr-link --accept` to grandfather it, and justify in the commit message.

## `ARCH-N` is frozen

`ARCH-1…ARCH-26` (in `docs/specs/epics.md`) is the **closed** legacy architecture-decision register — no new entries. New architecture decisions are `MMT-ADR`s. Existing `ARCH-N` are drained to ADRs as backfill, each with a terminal disposition (promote / tombstone / `corrected-by` / drop); a promoted entry's code citations migrate to the new ID in the same change. See MMT-ADR-0000 Part III and `MMT-ADR-0006` (the worked `ARCH-14` promotion).
