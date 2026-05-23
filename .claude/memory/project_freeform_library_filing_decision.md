---
name: Freeform chat library filing decision
description: Product decision for Ask Anything/freeform chats, session history, and Library filing.
type: project
---

Ask Anything/freeform chat should be low-friction: let the learner ask first, then classify quietly after a few meaningful exchanges.

**Decision:** Sessions are saved as conversation history by default. Library filing is separate: when a chat becomes meaningful learning, the app should auto-file it into the best subject/book/topic when confident, ask only when ambiguous, and always allow correction. The user may choose to keep the session out of Library; that keeps the session history/summary/transcript but does not create or attach a curriculum topic, does not show as a Library topic, and should not drive topic progress/retention.

**Why:** Users should not be forced through subject setup before getting value, but meaningful learning should not disappear from the self-building Library. "Don't save" copy is misleading because the session remains saved; use language like "Keep out of Library" instead.

**How to apply:** When implementing this, reconcile scattered docs in one pass: `LEARN-01` freeform chat, `SUBJECT-03` chat-created subject, `SUBJECT-05` subject resolution, `LEARN-07` session summary/filing, `LEARN-08` Library, `HOME-01` Ask Anything entry, and any supporting specs/tests. Library topics must still belong to subjects.
