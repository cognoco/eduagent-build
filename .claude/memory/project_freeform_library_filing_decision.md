---
name: Freeform chat library filing decision
description: Product decision for Ask Anything/freeform chats, bookmarks, Library filing, Challenge Round, and notes.
type: project
---

Ask Anything/freeform chat should stay low-friction: let the learner ask first, then classify quietly as needed. Do not mint a hidden topic during the chat just to unlock topic-bound features.

**Decision:** Sessions are saved as conversation history by default. Bookmarks are the instant-save path in freeform because they save mentor replies by session event and do not need a topic. Library filing is unavailable for 1-4 exchange freeform sessions and becomes available only after 5 exchanges. Challenge Round stays out of freeform. Freeform learner-notes stay out of scope; if the learner saves a meaningful freeform session to Library, the LLM learner recap / structured session summary is the durable review artifact.

**Why:** Users should not be forced through subject setup before getting value, and quick questions do not need Library weight. Hidden provisional topics created trust and privacy confusion. The later freeform-note idea added too much UI/state for a small gain. The clean boundary is bookmarks during chat, then Library filing only when there is enough conversation for the LLM to file and summarize confidently.

**How to apply:** For Ask Anything, do not add freeform Challenge Round, hidden topic anchors, provisional topics, freeform learner-note CTAs, or off-topic notes. Keep bookmarks available during chat. Keep Library filing behind the 5-exchange threshold for close-path filing and user-triggered add/restore/retry. If filing succeeds, use the normal Library topic plus the LLM-generated recap/session-summary surfaces; Library topics must still belong to subjects.
