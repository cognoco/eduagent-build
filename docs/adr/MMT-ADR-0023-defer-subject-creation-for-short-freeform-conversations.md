# MMT-ADR-0023 — Defer subject creation for short freeform conversations (subjectless opening turns)

**Status:** Proposed · 2026-06-19 · **Scope:** Freeform / Ask-Anything session persistence — *subject* resolution timing · **Deciders:** Architect (jjoerg) + PM (owner, Zuzana) · **Amends:** MMT-ADR-0021 (freeform Library-filing threshold / narrower persistence path) · **Builds on:** MMT-ADR-0000 (decisions layer)

> **Proposal, not yet accepted.** Per the lockstep rule (MMT-ADR-0000 §II.2 / `docs/adr/README.md`), the canon edits this would imply (`architecture.md` → "Freeform Ask Anything — narrower persistence path"; `PRD.md` → "Ask Anything / Freeform Persistence Boundary") land **in the same change-set as acceptance**, never at proposal time. This file records the *why* and the open implementation fork so the decision can be ruled deliberately rather than smuggled into a bugfix.

> **Re-vet 2026-06-30:** **KEEP PROPOSED / AMEND.** This remains a proposal because no acceptance sign-off or mechanism choice exists. The product-shell spec and S1 task are context pointers only; they do not supply the authority for the ADR. The architectural spine is the turn-1 subject commitment risk plus ADR-0021's persistence boundary.

## Context

MMT-ADR-0021 ruled that a freeform Ask-Anything session is a **narrower persistence path**: it does not mint a topic mid-chat, and it auto-files into the Library only once the conversation is *sustained* (`FILING_CONFIG.minFreeformExchanges`, currently 5). That deferral applies to the **topic** layer. It deliberately kept the **subject** required up front — ADR-0021 Decision 3 states the system "may resolve or ask for the subject so events carry a `subjectId`", because `session_events.subjectId` and `learning_sessions.subjectId` are `NOT NULL` (`packages/database/src/schema/sessions.ts`), and `ensureSession` returns `null` without one (`apps/mobile/src/components/session/use-session-streaming.ts:342`).

The consequence is a **turn-1 subject commitment**: a freeform / V2-mentor turn must pin a subject on the first message, before the conversation that would clarify it has happened. For genuinely ambiguous openers this forces a bad choice between a subject-picker gate and a silent (often wrong) classification:

- Real instance (2026-06-19): a learner asked about **"analysis"** and the classifier committed the session to **English** — when they meant mathematical analysis. "analysis" is inherently cross-subject (literary analysis vs mathematical analysis); no classifier confidence threshold makes it reliably right at turn 1.

A turn-1 commitment fights the desired conversation-first cold-start structurally: the commitment is forced before the conversation exists. A near-term implementation can reduce the harm with eager subject creation, no grid gate, and an always-visible override, but it cannot eliminate a *confident* mis-commit — the override chip is the only catch. The robust answer is **not a stronger guesser** but to let the conversation clarify the subject before committing.

## Decision (proposed)

A freeform / mentor-turn conversation may run its **opening turns without a committed subject**. The subject is created or attached only once the conversation either (a) makes the subject **unambiguous**, or (b) crosses a **sustained threshold** — whichever comes first. Three invariants:

1. **Subjectless opening turns are allowed.** The opening exchanges of a freeform / V2-mentor turn persist (or are held) without a `subjectId`. The mentor teaches and, where the opener is ambiguous, disambiguates *in its own conversational reply* (which the LLM does well) rather than the client guessing or gating on turn 1.
2. **The subject crystallizes from the conversation, not a turn-1 guess.** Once the subject is unambiguous (the learner names it, the topic becomes clear) or the sustained threshold is reached, the system creates/attaches the subject and reconciles the opening events to it. A *quick* throwaway exchange that never crystallizes creates **no subject** — mirroring ADR-0021's "a quick exchange stays lightweight" rule, one level up.
3. **Symmetry with ADR-0021's topic rule.** Subject-deferral is the topic-deferral philosophy applied one layer higher: a short throwaway chat creates **neither subject nor topic**; a sustained chat crystallizes a subject (and, if filed, a topic). This makes the persistence boundary consistent across both layers instead of "topic deferred, subject forced".

This **amends** ADR-0021 Decision 3's "subject is required up front" position. ADR-0021's topic invariants (no hidden topic anchors; topic-bound features stay topic-keyed) are unchanged and carry forward.

### The implementation fork (to be ruled at acceptance)

The DB invariant (`subjectId NOT NULL`) is the obstacle, and there are two ways through — this proposal does **not** pre-pick one; it requires a spike on null-handling blast radius first:

- **M1 — Nullable `subjectId`.** Make `session_events.subjectId` and `learning_sessions.subjectId` nullable; backfill on crystallization. Cleanest data model for "subjectless until it isn't", but a migration on the **shared, no-regress** session pipeline, and every read/repo/`createScopedRepository` path that assumes a non-null subject must handle null. Subject to Schema-And-Deploy-Safety (migration SQL + `## Rollback`).
- **M2 — Pre-persist draft buffer.** Hold the opening turns in a draft store that is **not** a `learning_session` until the subject crystallizes, then create the session and replay the buffered turns. No schema change, but adds a draft lifecycle (abandonment/loss semantics, idempotent replay, metering attribution) and a place for opening-turn bookmarks to live before they can be subject-backed.

## Consequences

- **Eliminates the turn-1 mis-commit class** ("analysis" → English): the mentor's first conversational reply resolves genuine ambiguity, instead of a client-side classifier committing blind.
- **Conversation-first cold start** — onboarding is the conversation; the first subject is a *product* of it, not a precondition.
- **Cost: it amends ADR-0021's "subject required" invariant** and touches the shared session pipeline (M1 migration + null-handling sweep, or M2 draft lifecycle). This is exactly why it is an ADR-class decision, not a bugfix detail.
- **Bookmarks in the opening turns** — ADR-0021 made freeform bookmarks subject-backed but topicless. Under deferral a bookmark created before crystallization has no subject yet; either defer bookmark persistence to crystallization or attach retroactively. Must be resolved in the chosen mechanism.
- **Safety + metering must not leak.** The conversational path still owes the safety tripwire and metering (`session/index.tsx`); a subjectless opening must not become an unmetered, un-tripwired chat loophole.
- **No regression to V0/V1 or to guided/homework paths** — those resolve the subject before the session (homework in `camera.tsx`; guided from the chosen topic) and are out of scope here.

## Alternatives considered

1. **Eager subject + kill the grid gate + always-visible override (the near-term S1 `T25`).** Adopted as the *immediate* fix and stays inside ADR-0021 (subject still resolved up front, topic still deferred). It removes the blocking library-grid gate and replaces a silent commit with mentor-voiced inline disambiguation on genuine ambiguity — but a *confident* classifier mis-pick still slips through, caught only by the override. Good enough for the visible bug; insufficient for the ambiguity class. This ADR is the path that fixes the class.
2. **Stronger classifier / higher confidence threshold before silent auto-pick.** Rejected — the mis-pick is irreducible for genuinely cross-subject terms ("analysis", "translation", "modelling"); raising the bar trades silent-wrong for more-gating without solving either. "Not a stronger guesser" was the explicit steer.
3. **Keep ADR-0021 as-is (subject required up front).** Status quo; the turn-1 mis-commit recurs for every ambiguous opener. Rejected as the target state, retained only as the near-term floor under alternative 1.

## What this ADR does not decide

- **M1 vs M2** — the nullable-column vs draft-buffer fork is ruled at acceptance, after a spike measuring the null-handling blast radius across reads/repos.
- **The deferral threshold** — whether subject-crystallization reuses/extends `FILING_CONFIG.minFreeformExchanges` or owns a separate count (operational tuning, L3).
- **Topic-filing behavior** — unchanged from ADR-0021.
- **The classifier's subject/topic selection strategy** once a session is eligible (ADR-0021 already leaves this open).

## Links

- **Amends:** `docs/adr/MMT-ADR-0021-freeform-library-filing-threshold.md` (Decision 3 — "subject is required up front").
- **Contextual rollout pointer, not authority:** S1 plan `docs/plans/v2-plan/2026-06-10-s1-mentor-home.md` → `T25` (eager subject, no grid gate, override).
- **Contextual product pointer, not authority:** `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` §3.1 (cold start — first subject through the conversation).
- **Canon (lockstep at acceptance, not now):** `architecture.md` → "Freeform Ask Anything — narrower persistence path"; `PRD.md` → "Ask Anything / Freeform Persistence Boundary".
- **Operational owner of any threshold:** `apps/api/src/config/filing.ts` (`FILING_CONFIG`).
