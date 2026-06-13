---
name: Freeform chat library filing decision
description: Product decision for Ask Anything/freeform chats, bookmarks, Library filing, Challenge Round, and notes.
type: project
---

Ask Anything/freeform chat should stay low-friction: let the learner ask first, then classify quietly as needed. Do not mint a hidden topic during the chat just to unlock topic-bound features.

**Decision source:** [`MMT-ADR-0021`](../../docs/adr/MMT-ADR-0021-freeform-library-filing-threshold.md), with the living product rule in [`docs/PRD.md`](../../docs/PRD.md). Use those docs as the source of truth.

**Why this memory remains:** It is only a recall pointer so future sessions do not reopen the hidden-topic / freeform-note / freeform-Challenge debate without first reading the ADR.

**How to apply:** If a future change wants to file shorter freeform sessions, add freeform notes, or enable Challenge Round in freeform, treat it as superseding/amending `MMT-ADR-0021`.
