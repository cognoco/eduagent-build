---
name: Freeform chat notes and library filing decision
description: Product decision for Ask Anything/freeform chats, bookmarks, learner-notes, and Library filing.
type: project
---

Ask Anything/freeform chat should stay low-friction: let the learner ask first, then classify quietly as needed. Do not mint a hidden topic during the chat just to unlock topic-bound features.

**Decision:** Sessions are saved as conversation history by default. Bookmarks are the instant-save path in freeform because they save mentor replies by session event and do not need a topic. Learner-notes remain Library/topic artifacts: if a learner wants to record a note from an unfiled freeform session, the app asks at the end/session summary whether to add the session to Library first. Accepting Library filing gives the note a real topic; declining means no topic-bound note is saved. Challenge Round stays out of freeform.

**Why:** Users should not be forced through subject setup before getting value, and a saved note must appear where notes normally live. Hidden provisional topics created trust and privacy confusion: the learner could write something that looked like a note, but it would not appear in normal Library/notes surfaces until filing. The clean boundary is bookmarks during chat, notes after accepted Library filing.

**How to apply:** For Ask Anything, do not add freeform Challenge Round, hidden topic anchors, provisional topics, or off-topic learner-notes. Keep bookmarks available during chat. At end/session summary, a "write a note" action may ask the learner to accept Library filing; after filing resolves to a real topic, save through the normal `topic_notes` path. Library topics must still belong to subjects.
