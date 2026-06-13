# MMT-ADR-0021 — Freeform Ask Anything files to Library only after five exchanges, with no freeform Challenge or notes flow

> **Note on numbering:** originally minted as `MMT-ADR-0018` on a feature branch; renumbered to `0019` on 2026-06-09 when merging main (where `MMT-ADR-0018` had been taken by the LLM-orchestrator promotion, ex-`ARCH-8`); renumbered again to `0021` on 2026-06-12 when merging the new-llm branch into main — `MMT-ADR-0019` was already taken by the OS-agnostic dev platforms ADR and `MMT-ADR-0020` was yielded to the identity-foundation cutover-plan consent-request ADR (analysis C6, WI-678).

**Status:** Accepted · 2026-06-08 · **Scope:** Ask Anything / freeform session persistence and learning affordances · **Deciders:** PM (owner) + Codex · **Builds on:** MMT-ADR-0000 (decisions layer)

## Context

Ask Anything is the learner's lowest-friction entry point: the learner can ask first without choosing a subject, book, or topic. In code, this usually creates a `learning` session with `metadata.effectiveMode = 'freeform'` and no `topicId`. The app still saves the chat history. Persisted session events and bookmarks are subject-backed (`subjectId` is required by `session_events` and `bookmarks`), but they do not require a topic (`topicId` is nullable), so a freeform bookmark can exist before Library filing creates or links a topic.

The open question was how much of the topic-bound learning system should leak into that freeform path. We considered several directions: minting a provisional/freeform-derived topic mid-session, disconnecting Challenge Round from `topicId`, offering a freeform learner-note flow that first asks the learner to accept Library filing, and keeping the earlier three-exchange filing threshold.

The product judgement is that if a learner gets what they need in three quick rounds, they do not need the weight of a Library topic or a note workflow. A short Ask Anything chat should remain a lightweight saved conversation. Only a more sustained exchange should become eligible for durable Library filing, and even then the system should avoid creating hidden curriculum state or presenting topic-bound affordances as if freeform were a normal guided lesson.

## Decision

### 1. Freeform Ask Anything does not create hidden topic anchors

Do not mint provisional topics or hidden `topicId` anchors mid-session just to unlock topic-bound features. A Library topic is created or linked only through the normal filing path when the session is eligible.

### 2. Library filing for freeform starts at five exchanges

Freeform Library filing is unavailable for 1-4 exchange sessions. At 5+ exchanges, the close-path and user-triggered add/restore/retry filing paths may request filing if the session is otherwise eligible. The implementation threshold is `FILING_CONFIG.minFreeformExchanges = 5`.

### 3. Freeform feature availability is intentionally narrower than guided learning

| Feature | Freeform Ask Anything rule |
|---|---|
| Chat history | Available; the session transcript remains saved. |
| Subject classification | Available; the system may resolve or ask for the subject so events have a `subjectId`. |
| Bookmarks | Available only for persisted AI-response events with a `subjectId`; no `topicId` is required, so bookmarks can be topicless. |
| Library filing | Available only after 5 exchanges and normal filing eligibility. |
| LLM learner recap / structured session summary | Available through the normal post-session pipeline; this is the review artifact for a filed freeform session. |
| Challenge Round | Not available in freeform. |
| Learner-authored notes | Not available as a freeform flow. |

### 4. Challenge Round stays out of freeform

Challenge Round remains a topic-bound learning-session feature. Freeform Ask Anything does not offer, accept, or run Challenge Round unless a future ADR deliberately re-keys that feature away from topics.

### 5. Freeform has no separate learner-note flow

Learner-authored notes remain topic-bound. Ask Anything does not add a freeform "write a note" CTA, and it does not ask the learner to accept Library filing merely to create a note. Bookmarks are the instant-save mechanism during chat.

### 6. Filed freeform sessions use the LLM recap/session summary as the review artifact

If a 5+ exchange freeform session is filed to Library, the durable review artifact is the LLM-generated learner recap / structured session summary attached to the resolved session. It is not a learner-authored topic note. If the learner keeps the session out of Library, the chat history and bookmarks remain, but no Library topic or topic-bound artifact is created.

## Consequences

- **Ask Anything stays psychologically lightweight.** The learner can ask a quick question without feeling the app has silently enrolled them in curriculum management.
- **The Library gets fewer low-signal topics.** Three- or four-exchange chats may contain value, but they are intentionally treated as chat history/bookmark material unless the learner continues the conversation.
- **The filing classifier has more context.** Five exchanges gives the system more evidence to choose or create a subject/topic placement without inventing a hidden anchor early.
- **Challenge Round and notes keep their topic-bound contract.** Work that changes this must supersede this ADR rather than adding a one-off exception in UI or prompt code.
- **Bookmarks are not promoted to topic artifacts.** A freeform bookmark can be subject-backed and topicless; topic-page bookmark surfaces see it only after a topic relationship exists.
- **There is a small friction trade-off.** A learner who wants a very short freeform chat filed to Library cannot do that immediately under this rule. The accepted recovery is to continue the conversation until it has enough substance, or use bookmarks for the useful mentor reply.

## Alternatives considered

1. **Provisional/freeform-derived topic anchors during chat.** Rejected — this creates hidden curriculum state, creates privacy/visibility confusion, and makes Ask Anything feel like silent Library construction.
2. **Disconnect Challenge Round from `topicId`.** Rejected for now — Challenge Round writes mastery/review evidence into a topic-bound learning system. Moving it off topics is a larger architectural change, not a freeform affordance tweak.
3. **Freeform learner-note CTA after accepted Library filing.** Rejected — it adds consent state, pending/failed filing recovery, and note-surface complexity for a small benefit. The simpler rule is bookmarks during chat, then LLM recap/session summary when a meaningful session is filed.
4. **Keep the old three-exchange threshold.** Rejected — three rounds can be enough to answer a quick question, but not enough to justify a durable Library filing offer by default.
5. **Always ask the learner whether to file on session end.** Rejected — it adds friction to the exact path meant to stay low-friction and asks learners to manage filing before the app has enough evidence.

## What this ADR does not decide

- The Challenge Round behavior for guided/practice/relearn topic-bound sessions.
- The schema or prompt details of learner recap and structured LLM session summary.
- The classifier's internal subject/topic selection strategy after the five-exchange gate is met.
- Whether a future product surface lets learners manually promote short saved chats; that would need a superseding or amending ADR because it changes this filing boundary.
