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

## How canon is authored (the ADR ↔ canon ↔ ARCH-N relationship)

This is the one-screen operating answer to "how does content get *into* `architecture.md` (or any canon doc)?" — consolidated from MMT-ADR-0000 §I.2 / §II.2–II.3 / Part III. The full reasoning lives there; this is the procedure.

1. **Three artifacts, three roles — never conflated.** `architecture.md` (+ `PRD.md`, `ux-design-specification.md`, `principles.md`) is **L1 canon**: the living *what* — outcomes, current rules, no rationale. An **`MMT-ADR-NNNN`** is **L2**: the immutable, dated *why* behind a significant choice. The legacy **`ARCH-1…ARCH-26`** register is a **frozen** pre-ADR record, draining into ADRs. `architecture.md` is **not** a decision log — its title and preamble say so.
2. **Content enters canon only via lockstep.** A significant rule reaches `architecture.md` by landing (or superseding) its ADR **and** editing the exact canon lines in the **same change-set** — never canon without its ADR, never an orphan ADR that leaves canon stale (§II.2). Canon we cannot trace back to an ADR is **grandfathered, not reverse-engineered** into an invented one (§I.2 north-star).
3. **Promotion is the upward lockstep.** When an ADR's rule should bind future work, the *rule* graduates into canon (or the principles catalog) while the ADR keeps the *why++*; promotion copies the rule up and links back, never duplicating the rationale (§II.3).
4. **`ARCH-N` is frozen and absorbs forward.** No new `ARCH-N`; each owes a terminal disposition (promote / tombstone / `corrected-by` / drop), and a promoted entry migrates its code citations to the new ID in the same change (§Part III; worked example: `MMT-ADR-0006`, `MMT-ADR-0018`).

**The invariant that keeps these from drifting:** no ADR, canon doc, or agent-doctrine line declares itself the *sole* system of record. Canon and ADRs are distinct layers that move in lockstep — see the MMT-ADR-0000 "no document is the sole system of record" guard.

## Format

- **Filename:** `MMT-ADR-NNNN-kebab-title.md` (zero-padded 4 digits; flat, domain-agnostic sequence). `MMT` = MentoMate, mirroring the estate's `NEX-ADR-NNNN`.
- **Header:** `# MMT-ADR-NNNN — <title>` then a status line: `**Status:** Accepted (context, date) · **Scope:** … · **Deciders:** …`. Add `**Amends:**` / `**Supersedes:**` / `**aka:**` when relevant.
- **Body:** `## Context` → `## Decision` → `## Consequences` → `## Alternatives considered`. See `MMT-ADR-0001` / `0002` for the house style; `0004`–`0006` are the seed examples.
- **Prose wrapping:** soft-wrap — one physical line per paragraph (and per list item). Do not hard-wrap at a fixed column. Renders identically on GitHub, avoids ragged lines, and keeps edits clean.
- **Reconstructed ADRs** (written after the fact during backfill) carry a `reconstructed YYYY-MM-DD` note; where the original *why* is unrecoverable, record the decision plainly rather than invent a rationale.

## Write for the reader three years out — the timelessness rules

An ADR outlives the project phase that produced it. It must be understandable by someone with **no knowledge of current work items, sprints, plans, or phase codes**. Four rules, distilled from a 2026-07 full-register audit that found the same rot patterns across a dozen ADRs:

1. **No work-item / open-question / ruling IDs as authority.** Never let a decision clause depend on a `WI-NNNN`, `OQ-N`, or ruling code to carry its meaning ("preserves the WI-374 caps", "confidence per OQ-9"). State the rule and its values directly; an ID may appear only as *historical attribution* ("found by a deletion-path audit", "operator-ruled 2026-06-20") — and sparingly.
2. **No stage/phase codes as gates.** "Deferred to Phase F", "pending the T10 bake-off", "the P1 family-3 work" are meaningless once the plan they name is archived. Replace the code with the **functional precondition** the stage was waiting for ("once real minor-traffic verdict data exists to calibrate a threshold", "whichever ADR ratifies the account-based mechanism supersedes this one").
3. **No progress snapshots in the body.** "Not yet enforced", "sign-off pending", "once X lands", "pre-launch we have no such data" are true for a week and confusing forever. The Status line is the only place lifecycle state lives; the body states standing rules that are true whenever read. If a fact is genuinely time-bound, date it ("verified against staging 2026-06-20").
4. **No delegating normative content to specs/plans.** A spec or plan may be cited in Links as *historical context, never authority*. Schema shapes, thresholds, and contracts either live inline in the ADR, in canon (`architecture.md`), or in code/config named as the source of truth — plan files get archived and their task IDs (`T2`, `S5a`) rot.

Cross-ADR references are the opposite of rot — link `MMT-ADR` liberally. Legends for genuinely durable code families (e.g. `MMT-ADR-0011`'s D1–D8 decision IDs) are fine when the ADR defines them.

## Chunking a large doc (reactive, not a policy)

Splitting a large canon or spec doc into per-concern files is reactive editorial practice, not an ADR-class decision (MMT-ADR-0000 §I.5). Do it only in response to **demonstrated contention** (churn + multiple owners colliding), never as a size-triggered mandate. When you do: chunk **by concern plus a dedicated cross-cutting chunk**; keep a **mandatory principle index** (the principles catalog); and keep a spec's decision heading and its `MMT-ADR` link **in the same file** (the ratchet links at file granularity).

## The ratchet (`scripts/check-decision-adr-link.ts`)

CI (`.github/workflows/docs-checks.yml`) fails a `docs/specs|plans` change that adds an ADR-class decision block (a "Decisions / Alternatives / Trade-offs" heading) **without** linking an `MMT-ADR-NNNN`. Today's embedded decisions are grandfathered in `scripts/decision-adr-link-baseline.json` (the backfill is deferred).

- Fix a flagged file: write the ADR, reference its ID in the spec/plan.
- Genuine false positive (a "Decisions" heading that isn't ADR-class): `pnpm run check:decision-adr-link --accept` to grandfather it, and justify in the commit message.

## `ARCH-N` is frozen

`ARCH-1…ARCH-26` (in `docs/specs/epics.md`) is the **closed** legacy architecture-decision register — no new entries. New architecture decisions are `MMT-ADR`s. Existing `ARCH-N` are drained to ADRs as backfill, each with a terminal disposition (promote / tombstone / `corrected-by` / drop); a promoted entry's code citations migrate to the new ID in the same change. See MMT-ADR-0000 Part III and `MMT-ADR-0006` (the worked `ARCH-14` promotion).
