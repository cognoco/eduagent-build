# BID-45 UI polish + locale sweep — Execution Tracker

> The lane's substance. `roles/shepherd-protocol.md` holds the process; this holds the
> lane specifics. Disposable by construction — per-WI state lives in Cosmo, never here.

## 🔴 REFINERY RESHAPE — 2026-07-23 (READ FIRST — THIS LANE HAS NO DISPATCHABLE WORK YET)

The refinery pass (work order 39481) returned **ALL FOUR members as `needs-pm`.** This
batch has **zero dispatchable items** until the PM rules. Orient, verify readiness, and
**HOLD — claim nothing.**

- **WI-2106 — HOLD (needs-pm).** Gated on OPQ-128 Q1 (Open). Otherwise execution-ready.
- **WI-2121 — HOLD (needs-pm).** Gated on OPQ-130 (Open); parked pending WI-2225.
- **WI-2129 — HOLD (needs-pm).** Gated on OPQ-128 Q2 (Open). Otherwise execution-ready.
- **WI-1876 — HOLD (needs-pm).** AC enumerates ~50–75 untranslated strings; real
  baseline is 114. Refinery wants a property-defined set. Await PM AC amendment.

**Net: nothing to dispatch. Post your readiness line, hold, and wait for the
orchestrator (`orchestrator:claude:mentomate`) to feed items as the PM rules the four
above.** WI-2106 and WI-2129 share OPQ-128 as one ruling surface, so they may unblock
together.

## Charter

Land the four BID-45 member items to Cosmo Close: three QA-fix-factory UI coherence items
and one systematic localisation defect.

"Done" = every member item Closed by the independent reviewer, with no absorption of
adjacent polish.

## BINDING membership — exactly four items, no absorption

| WI | Stage at formation | Pri | Workstream | Item |
|---|---|---|---|---|
| WI-2106 | Backlog | P2 | QA Fix Factory | One coherent focal animation in Journal empty states |
| WI-2121 | Backlog | P2 | QA Fix Factory | Remove learner-persona copy from supporter pre-auth |
| WI-2129 | Backlog | P2 | QA Fix Factory | Consolidate duplicate Mentor home prompt cards |
| WI-1876 | Backlog | P3 | Mobile UX & Navigation | Untranslated strings shipped identically across locales |

**This lane is a magnet for scope creep.** "While I'm in here" is how a four-item polish
batch becomes a redesign. Anything outside these four is a **formation finding** — escalate
on the lane, do not absorb, however small it looks.

## Sequence

The three QA Fix Factory items (WI-2106, WI-2121, WI-2129) share a surface — take them in
that order while context is warm. WI-1876 is independent and can go any time; it is the one
item likely to touch many files at once, so land it last to avoid conflicting with the
others' diffs.

## Canon authority

Repo `AGENTS.md` (eduagent-build) governs engineering rules, including **UI strings hygiene**
(~char 23,248) and the **hardcoded-JSX-literal ratchet** (~char 24,335) — both directly
relevant to WI-1876 and both comfortably inside the readable region.

**Read AGENTS.md knowing it is truncated**: ~54.5k characters against a ~40k harness ceiling,
so "Repo-Specific Guardrails" (char 41,090) onward — including **PR Review & CI Protocol**
(char 50,054) and Code Quality Guards — may be absent from your context. Read the file
directly for anything in that range.

## Gate discipline

- **No merge without an explicit Gate-1 grant** from `orchestrator:claude:mentomate`, per PR,
  naming the exact head SHA. `/cosmo:merge`'s own predicate is NOT sufficient.
- Request Gate-1 with the verdict **BODY**, not a check status. A completed CodeRabbit review
  **rewrites its summary comment into a walkthrough**; a frozen "currently processing" marker
  is a dead review, not a pending one.
- "Review skipped / no new commits since the last review" is the **incremental-ledger trap** —
  bookkeeping, not coverage. Escalate to `@coderabbitai full review` once.
- Never push a commit to re-trigger a reviewer — a new head voids the verdict you hold.
- **Gate-1 is a code-quality gate, not an AC-conformance gate.** The independent adversarial
  reviewer owns conformance and the close. Point each AC at what *demonstrates* it.

## Scope fences

No schema migrations, no external-contract changes, no clacks/substrate edits, no
quartet-protocol edits. Executors never merge. Never self-close.

Locale note for WI-1876: the defect is strings shipped *identically* across locales, so the
proof is comparative — evidence must show the strings differing per locale after the fix, not
merely that a translation file changed.

## Pointers

- Batch brief: BID-45 page in Cosmo (item list + rationale)
- Orchestrator: `orchestrator:claude:mentomate` — route `needs-orchestrator` / `blocked` /
  `decision` lines to lane `ui-locale-b45`
- Standard: `zdx/standard/` (schema, lifecycle, DoR/DoD, conformance)
