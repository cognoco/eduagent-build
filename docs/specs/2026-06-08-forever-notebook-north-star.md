# The Forever Notebook — North Star & Roadmap

**Status:** Vision · 2026-06-08 · **Branch:** `conceptgrain` · **First slice:** [concept-capture layer](./2026-06-08-concept-capture-layer-design.md) · **Grain decision:** [MMT-ADR-0017](../adr/MMT-ADR-0017-concept-capture-additive-layer.md)

> This is the durable home for the design dialogue behind the concept-grain work. The concept-capture spec is **slice 1** of this vision; everything below it is roadmap. Nothing here is committed scope except where a linked spec exists.

## The vision

A single, lifelong, personal record of everything a learner has ever understood — across every subject, from childhood to adulthood — that doesn't just *store* but *works on the learner's behalf*. The difference between a drawer and a mentor: a drawer holds what you put in it; this remembers you, notices what's slipping, connects today to something you said years ago, and answers as someone who knows your whole history.

Four verbs, one substrate (a living map of one mind over time):

- **Learn** — capture happens passively, as a by-product of tutoring — concretely, of **Challenge Rounds and the learner's own-words notes**, not every exchange. The learner never sits down to "take notes" as a chore; knowledge settles into the record as they restate and are assessed. The notebook you'd keep forever is the one you never sit down to maintain. *(Honest scope: coverage is as wide as Challenge Rounds and notes reach — a topic studied but never Challenge-Round'd has no concept record yet. Widening capture beyond that ritual is roadmap, not slice 1.)*
- **Retain** — the notebook fights forgetting *for* you. It knows your per-concept forgetting curve and re-surfaces a thing just before it decays. Forgetting becomes the hard thing, not remembering.
- **Ask** — you can talk to your own past, in your own knowledge and history. The mentor who has read every page of your life and hands you the right one.
- **Find** — by meaning and connection, never by folders. The graph shows you that what you learned over here is the exact tool you needed over there.

"Forever" is the whole game: the same notebook that held a 13-year-old's first algebra holds the adult's compound-interest understanding — and can show the line between them. **Not storage — a second memory that teaches you back.**

## Invariants (the principles, refined)

These constrain every slice. They came out of pressure-testing five proposed principles down to a smaller, non-contradictory set.

1. **Capture wide, keep narrow — and a single forgetting verb: demote, never delete.** Most of what comes in stays cheap, findable archive; a fraction earns "kept warm" status. Forgetting is *demotion* (sinks in attention, still findable), not deletion. "Remembering everything isn't realistic" becomes a rule, not a regret.
2. **Promotion isn't a decision — return is the promotion.** Don't make the learner mark things as important; that reintroduces the chore that kills notebooks. The act of returning to a thing — restating it, following a link out of it — *is* the signal it earned warmth. Promotion is the fossil record of attention, not curation. (This collapses "capture-wide/promote-narrow" and "return-as-heartbeat" into one mechanism.)
3. **The kept artifact is the learner's restatement, not the source.** The highest-value thing isn't the article or lecture — it's what the learner said it meant, captured close to when it clicked. That's what they return to and the only thing the system can answer *with*.
4. **Restatements aren't monotonic — layer, never overwrite.** A past restatement may be wrong, and the tutor's job is to correct. Never resolve the tension: store the learner's words faithfully as theirs; a correction is a separate, attributed entry in the same trajectory. The line you return to includes the wrong turns — they're how you recognize the shape of your own past understanding. **UI rule:** a wrong turn is never surfaced *without its later correction in view* — the trajectory is rendered as a growth arc, never a standalone error log. This is what keeps Invariant 4 compatible with the no-struggle copy rule; "March-you got it, now-you got it" motivates, a bare list of past mistakes does not.
5. **Return is the clock; relevance is the only allowed push.** Pull is the main event — returning re-teaches (restate, see what drifted, surface a connection). Pure pull goes blind to one thing: it can't tell "internalized so I never ask" from "quietly lost so I never ask." The *only* sanctioned push closes that gap **on present relevance, never on a calendar**: "what you're reading now connects to something you understood in March and may have drifted on — want to look?" Calendar-nagging stays dead.
6. **Trust is legible: confidence is two readable signals, not one bar.** Every answer from the past arrives with provenance and a sense of how sure. "How sure" decomposes into **staleness/drift** (how long since you touched this, how far it moved) and **source agreement** (do your restatements agree with each other and with the tutor). Confident-but-wrong is the one fatal failure; legibility is the defense.
7. **The graph grows by consent.** Connections are *offered*, not asserted — "this might link to that," yes or no. The learner's answers train the graph; they stay the author, not the edited. A cross-subject connection is a consented *edge* between namespaced nodes, never a forced shared identity.

## Grounding — what exists today

The vision is an *improvement* on a shipped system, not a rebuild:

- **Spaced review is live** at **topic grain** — SM-2 in `packages/retention/src/sm2.ts`, one `retention_cards` row per topic, with review-due crons. (The "timer" is real and stays.)
- **Notes are stored** learner-content-only, per topic (`topic_notes`), never graded or mutated — "layer, never overwrite" is already the de-facto behavior by omission.
- **Weak concepts are captured** per concept with `misconception` + `correction` (`needs_deepening_topics`) — the "tutor's note" already exists, surfaced nowhere useful yet.
- **Challenge Rounds grade per concept** (`solid`/`partial`/`missing`/`misconception`) but discard the *solid* verdicts — the signal loss slice 1 fixes.

## Roadmap

| Slice | What | Status |
|---|---|---|
| **1 — Concept capture** | Additive `concepts` + `concept_mastery`; capture all verdicts; presence-only star; correction-on-recall; concept-targeted review; note-correctness nudge | [Spec drafted](./2026-06-08-concept-capture-layer-design.md) |
| 2 — Relevance nudge | The "pure-pull-goes-blind" fix: connection-triggered push, never calendar. **Must define its "present relevance" signal source + a precision floor / suppression rule** — a weak signal reintroduces nagging by another name, the exact thing invariant 5 bans | Roadmap — invariant 5 |
| 3 — Two-axis confidence | Display staleness × source-agreement as two legible signals, not one bar | Roadmap — invariant 6 |
| 4 — Restatement trajectory | Append-only per-concept evaluation log + "March-you vs now-you" view (wrong turns shown only with their correction in view — invariant 4 UI rule) | Roadmap — invariants 3, 4 (slice-1 table split leaves the seam) |
| 5 — Consented connection graph | Offered cross-subject edges; learner answers train the graph. Substrate for **Find** and **Ask** | Roadmap — invariant 7 |
| — Ask your own past | Conversational query over the captured record — the **Ask** verb; the mentor that has "read every page of your life." Depends on the substrate (slice 1) and the graph (slice 5) | Parked — sequencing TBD; **named here because it is the headline verb and must not fall off the roadmap** |
| — Return-as-promotion / archive tier | The two-tier demote-not-delete memory; requires an archive tier that doesn't exist yet | Parked — invariants 1, 2. **Un-park trigger:** slice-1 capture shows enough real volume that a single warm tier needs an archive (same cardinality evidence MMT-ADR-0017 gathers) |
| — Unified note + saved-from-mentor surface | One learner-content place, two **origins** made visually obvious — *My notes* (the learner's own words, editable) vs *Saved from my mentor* (the mentor's words: definition/example, authoritative, read-only) — across two **views** (in-context on the topic + a global list). Consolidates today's split `topic_notes` / `bookmarks` UI. | Parked — folded here 2026-06-09 from the Library-restructure exploration (`project_library_home_subject_hub_direction`). Deferred *because* the shipped [chat-notes-bookmarks](./2026-05-12-chat-notes-bookmarks.md) spec deliberately chose "no new global saved-item abstraction" and kept the two co-discoverable-but-separate; a unified store is a north-star call, not a standalone Library tweak. Honors invariants 3 (the restatement is the kept artifact) + 4 (layer/attribute, never overwrite — *My notes* and *Saved from my mentor* are distinct attributed origins, never merged into one undifferentiated blob). |

## Deliberately not yet decided

- Whether the topic-grained spine is ever **re-keyed** to concept grain — gated on captured cardinality evidence (MMT-ADR-0017).
- Whether the star ever **grades the note text itself** vs. reusing the Challenge-Round verdict (slice 1 reuses the verdict).
- The granularity the learner *returns to* in the UI (subject vs. idea vs. note) — the data is concept-grain; the return surface is a later UX call.
- **Learner-readable export of the notebook** — a record sold as "forever" the learner can't extract is forever lock-in, not forever ownership. GDPR export exists for account data; whether it renders the restatement trajectory + connection graph in a human-meaningful form is an open, and load-bearing, "forever" question.
- **Retention of learner-authored content in a unified note surface** — if *My notes* + *Saved from my mentor* are consolidated (roadmap row above), does that content purge on the 37-day transcript clock or persist as "forever"? Mirrors the `retrieval_events` retention decision (memory-task spec, EU-3) and the export/portability question below; decide when the surface is scheduled, not before.
- **Notebook continuity across the child→adult account transition** — the literal forever test. The identity-foundation reset (`MMT-ADR-0012`) dissolves owner and edge-scopes the learner, so a child on a parent's account who later opens their own adult account is a real design case: does the notebook follow the *learner*, and how does consent/portability work at that handoff? Unresolved; this is what makes "forever" true or false for a real user.
