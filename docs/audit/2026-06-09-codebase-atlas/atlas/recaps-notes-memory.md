# Recaps, notes, memory & mentor-memory — Functional Atlas

> Branch `new-llm`. Read-only audit, citations are `file:line`. This domain is the
> "continuity/memory backbone" — review/recaps is described in project memory as the
> #2 product pillar after teaching. In practice the backbone is **fragmented across at
> least 6 screens in 3 different tabs/stacks**, with **two near-duplicate mentor-memory
> editors**, and the central hallucination-guard for note drafting is **built but
> unwired**.

---

## Screens (route -> purpose)

### Recaps (guardian-only, V1 tab)
| Route | File | Purpose / what the user sees |
|---|---|---|
| `/(app)/recaps` (tab root) | `apps/mobile/src/app/(app)/recaps/index.tsx:15` | Parent-facing list of each child's recent sessions. One card per recap: child name, topic/subject title, relative date, narrative/summary. Gated `canEnter('recaps')` → redirects to `/home` if not guardian. |
| `/(app)/recaps/[recapId]` | `apps/mobile/src/app/(app)/recaps/[recapId].tsx:24` | Recap detail: "What happened" narrative, "Try asking" conversation prompt, **AddToMyLearning** button (clone child's topic into parent's own learning), and "open child session" deep-link. |
| `recaps/_layout.tsx` | `apps/mobile/src/app/(app)/recaps/_layout.tsx:9` | Stack; seeds `initialRouteName='index'` so cross-tab deep push to a recap synthesizes a 2-deep back stack. |

### My Notes (learner hub — lives behind a home-header icon, NOT a tab)
| Route | File | Purpose |
|---|---|---|
| `/(app)/my-notes` (hub) | `apps/mobile/src/app/(app)/my-notes/index.tsx:60` | Hub with 3 rows: **Sessions / Notes / Bookmarks**. Only "Sessions" shows a count pill (`index.tsx:70`); Notes & Bookmarks counts are never loaded here. |
| `/(app)/my-notes/[kind]` | `apps/mobile/src/app/(app)/my-notes/[kind].tsx:300` | Unified archive list for one kind. Search box + group-by-Date/Subject toggle, infinite scroll. Each row deep-links to the session detail or the topic. |
| `my-notes/_layout.tsx` | `apps/mobile/src/app/(app)/my-notes/_layout.tsx:12` | Stack; `initialRouteName='index'` (BUG-137/BUG-233 dead-end fix). |

### Mentor-Memory (the "what the mentor remembers" editor — TWO copies)
| Route | File | Purpose |
|---|---|---|
| `/(app)/mentor-memory` (self) | `apps/mobile/src/app/(app)/mentor-memory.tsx:45` | Learner/owner self-view: consent toggle, memory-injection switch, "Tell the mentor" free-text input, editable sections (learning style, interests, strengths, struggles, communication notes, hidden/suppressed items), "Clear all memory" (destructive). |
| `/(app)/child/[profileId]/mentor-memory` (parent) | `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx:56` | Parent editing a child's memory: collection + injection switches, "Tell the mentor" (as parent), curated categories, export-to-text, clear-all, plus a "something else is wrong" correction box that injects `[parent_correction]` text. |

### Cue / entry components
| Component | File | Role |
|---|---|---|
| `MentorMemoryCue` | `apps/mobile/src/components/session-summary/MentorMemoryCue.tsx:12` | Card on the session-summary screen that links into mentor-memory. |
| `mentor-memory-sections.tsx` | `apps/mobile/src/components/mentor-memory-sections.tsx:22` | Shared `MemorySection`, `MemoryRow`, `CollapsibleMemorySection`, `InterestContextRow`, plus `getLearningStyleRows`/`getFocusAreaProgress` helpers used by **both** mentor-memory screens. |
| `MemoryConsentPrompt` | `apps/mobile/src/components/memory-consent-prompt.tsx` | Grant/decline consent card embedded in both mentor-memory screens. |

> Note: the brief listed `components/memory/**` and `mentor-memory-sections.tsx` (in
> a sections file) — neither exists as a directory. The real shared file is
> `components/mentor-memory-sections.tsx`; there is no `components/memory/` folder.
> The brief's `services/{recaps,notes,memory,curated-memory,session-recap,session-highlights,bookmarks}/**`
> are mostly **flat files** (`recaps.ts`, `notes.ts`, etc.), with only `services/memory/`
> being a real directory (the facts pipeline).

---

## Capabilities (user task -> backend process file:line)

### Recaps
| User task | Frontend | Backend route → service | Data |
|---|---|---|---|
| List a child's recaps | `useRecaps()` → `recaps/index.tsx:20` | `GET /recaps` `apps/api/src/routes/recaps.ts:31` → `listRecapsForParent` `apps/api/src/services/recaps.ts:110` | Reads `getChildrenForParent` + `getChildSessions` (dashboard.ts); enriches "Up next" via `loadNextTopicMap` reading `session_summaries.next_topic_id/next_topic_reason` `recaps.ts:74`. IDOR-guarded `recaps.ts:129`. |
| Open one recap | `useRecap(recapId)` → `[recapId].tsx:30` | `GET /recaps/:recapId` `recaps.ts:44` → `getRecapForParent` `services/recaps.ts:182` | Per-child parallel `getChildSessionDetail`; first owned match wins. |
| "Add to my learning" (clone child topic) | `AddToMyLearningButton` `[recapId].tsx:175` | clone-from-child bridge (separate family domain) | Writes a topic into the parent's own learning. |
| Jump to the child's actual session | `handleOpenChildSession` `[recapId].tsx:41` | navigates to `child/[profileId]/session/[sessionId]` | read-only proxy session view. |

Recap **content is generated at session end**, not on read: `generateLearnerRecap`
(`apps/api/src/services/session-recap.ts:313`) and `generateSessionInsights`
(`apps/api/src/services/session-highlights.ts:243`) run inside the
`session-completed` Inngest function (`session-completed.ts:1182`, `:1030`) and write
`session_summaries.closingLine/learnerRecap/narrative/highlight/conversationPrompt/engagementSignal`.

### My Notes
| User task | Frontend | Backend |
|---|---|---|
| List sessions | `useProfileSessionsArchive` `[kind].tsx:318` | progress/session archive endpoints |
| List all notes | `useAllNotes` `[kind].tsx:321` | `GET /notes` `routes/notes.ts:145` → `listAllNotes` `services/notes.ts:433` (keyset on UUIDv7 `topic_notes.id`) |
| List bookmarks | `useBookmarks` `[kind].tsx:322` | `GET /bookmarks` `routes/bookmarks.ts:70` → `listBookmarks` `services/bookmarks.ts:144` |
| Search / group | client-only `matchesQuery`/`groupItems` `[kind].tsx:158,178` | none — purely local filtering |

### Notes CRUD (reached from topic/library, surfaced read-only in My Notes)
| Task | Route | Service |
|---|---|---|
| Get topic note(s) | `GET /subjects/:s/topics/:t/note(s)` `notes.ts:124,185` | `getNote`/`getNotesForTopic` `services/notes.ts:311,581` |
| Create note | `POST .../topics/:t/notes` `notes.ts:204` (proxy-blocked `:211`) | `createNote` `services/notes.ts:511` — `verifyTopicOwnership` IDOR guard + `insertNoteWithCap` (50/topic, advisory-lock atomic) `notes.ts:150` |
| Edit / delete note | `PATCH/DELETE /notes/:id` `notes.ts:234,284` (proxy-blocked) | `updateNote`/`deleteNoteById` `services/notes.ts:545,568` |
| Auto-note from a session summary | (server-side) | `createNoteForSession` `services/notes.ts:230` — dedupes exact session+topic+content |

### Bookmarks (save a mentor reply)
| Task | Route | Service |
|---|---|---|
| Save a reply | `POST /bookmarks` (proxy-blocked `bookmarks.ts:48`) | `createBookmark` `services/bookmarks.ts:51` — verifies the `session_events` row is the caller's `ai_response`, projects raw envelope JSON → plain text (BUG-934) `bookmarks.ts:85`, unique-violation → ConflictError |
| List for a session (to show "saved" state) | `GET /bookmarks/session` `bookmarks.ts:57` | `listSessionBookmarks` `services/bookmarks.ts:205` |
| Delete | `DELETE /bookmarks/:id` (proxy-blocked) `bookmarks.ts:84` | `deleteBookmark` `services/bookmarks.ts:127` |

### Mentor-Memory (self)
| Task | Hook | Backend |
|---|---|---|
| Grant/decline consent | `useGrantMemoryConsent` | memory-consent grant on learner-profile |
| Toggle "use what mentor knows" | `useToggleMemoryInjection` `mentor-memory.tsx:57` | patches `memoryInjectionEnabled` |
| Tell the mentor (free text) | `useTellMentor` `mentor-memory.tsx:56` | `POST /learner-profile/tell` `routes/learner-profile.ts:346` (proxy-blocked `:355`) → `parseLearnerInput(...,'learner')` `services/learner-input.ts` |
| Remove a remembered item (suppress) | `useDeleteMemoryItem` `mentor-memory.tsx:54` | delete + suppress on learner-profile |
| Restore a hidden item | `useUnsuppressInference` `mentor-memory.tsx:58` | `POST /learner-profile/unsuppress` `learner-profile.ts:382` |
| Edit interest context | `useUpdateInterestsContext` `mentor-memory.tsx:60` | onboarding-dimensions patch |
| Clear all memory | `useDeleteAllMemory` `mentor-memory.tsx:55` | delete-all on learner-profile |

### Mentor-Memory (parent → child)
Same set plus: `useToggleMemoryCollection` (`child/.../mentor-memory.tsx:79`),
`useChildMemory` curated categories (`:75`, → `buildCuratedMemoryView`
`services/curated-memory.ts:129`), **export-to-text** via
`learner-profile/:profileId/export-text` `child/.../mentor-memory.tsx:249`, and a
`[parent_correction]`-prefixed Tell route `POST /learner-profile/:profileId/tell`
`learner-profile.ts:362` (owner+IDOR+child-consent gated `:368-371`).

### Memory persistence across sessions (the actual "remembering")
- **Write:** `applyAnalysis` (`services/learner-profile.ts:1271`) runs in
  `session-completed` Inngest (`session-completed.ts:1478`) and persists to
  `memory_facts` via `writeMemoryFactsForAnalysis` (`services/memory/memory-facts.ts:291`,
  stamps `memoryFactsAnalysedAt`).
- **Read into a live session:** `retrieveRelevantMemory` (`services/memory.ts:46`)
  embeds the learner's current message (Voyage AI), pgvector `findSimilarTopics`, and
  injects a "Relevant prior learning" block into the system prompt
  (`formatMemoryContext` `memory.ts:103`). Fails open/silent — memory must never break
  a session (`memory.ts:44`).
- **Curated read:** `buildCuratedMemoryViewForProfile` (`curated-memory.ts:205`) reads
  the `memory_facts` snapshot when a marker is present.

---

## Navigation depth map (taps from a tab root)

| Capability | Path | Depth | Flag/notes |
|---|---|---|---|
| Recaps list | `recaps` tab → list | **1** (tab itself) | V1 guardian only (`FAMILY_TABS`); under V0 there is no recaps tab |
| Recap detail | tab → card | **2** | |
| Open child's real session from recap | tab → card → detail → "open session" | **4** | crosses into child proxy stack |
| Add-to-my-learning | tab → card → detail → button + confirm | **3–4** | cross-domain (family clone) |
| My Notes hub | Home header icon → hub | **1** (but via an **icon**, not a tab — easy to miss) `LearnerScreen.tsx:511` | learner shape only (`showLearningActions`) |
| A note / bookmark / session in My Notes | Home icon → hub → kind list → item | **3** | then deep-links out to topic/session = **4+** |
| Mentor-memory (self) from More | More tab → "Mentor memory" row → screen | **2** `more/index.tsx:136` |
| Mentor-memory (self) from session summary | finish session → summary → cue → screen | **2–3** (post-session only, gated `totalSessionCount>=2`) |
| Mentor-memory child editor | More/Family → child → "mentor-memory-link" → screen | **3** `child/[profileId]/index.tsx:1080` |
| Remove/suppress a remembered item | …mentor-memory → scroll to section → per-row × | **3–4** |
| Restore a hidden item | …mentor-memory → "Hidden items" collapsible → expand → restore | **4–5** (collapsed by default `mentor-memory.tsx:764`) |
| Export child memory | child mentor-memory → Privacy → Export | **4** |

**Anything >2 deep (redesign flags):** opening a child's real session from a recap (4),
every My Notes leaf (3, and the hub itself is hidden behind a home-header icon rather
than a tab), restoring suppressed memory items (4–5, twice-buried — collapsed section
inside a long scroll), child-memory export (4).

---

## Backend processes & data model

**Tables touched:**
- `session_summaries` — recap/highlight content (`closingLine`, `learnerRecap`,
  `narrative`, `highlight`, `conversationPrompt`, `engagementSignal`, `nextTopicId`,
  `nextTopicReason`). Written by `session-completed` Inngest.
- `topic_notes` — per-topic notes; 50/topic cap; UUIDv7 id for keyset paging.
- `bookmarks` — saved `ai_response` events; UUIDv7 id; unique constraint.
- `session_events` — source for bookmarks + recap transcript.
- `memory_facts` — persisted memory snapshot (interests/strengths/struggles/
  communicationNotes/suppressed); `learning_profiles` flags
  (`memoryConsentStatus`, `memoryCollectionEnabled`, `memoryInjectionEnabled`,
  `memoryFactsAnalysedAt/BackfilledAt`, `accommodationMode`, `learningStyle`).

**LLM generators (content, not state-machine — no envelope):**
- `generateLearnerRecap` (`session-recap.ts:313`): min 3 exchanges / 4 turns; transcript
  XML-escaped against prompt injection (`session-recap.ts:68`); validates against
  `learnerRecapLlmOutputSchema`; emits `llm.recap.parse_failed` on failure (not the
  envelope tag). Resolves "next topic" via curriculum walk + freeform keyword match.
- `generateSessionInsights` (`session-highlights.ts:243`): parent recap; strict
  validators — allowed prefixes, length bounds, `confidence==='high'`, and a
  `INJECTION_PATTERNS` block-list (`session-highlights.ts:49`).

**Inngest functions:** `session-completed.ts` (writes recap+highlights+memory),
`memory-facts-backfill.ts`, `memory-facts-embed-backfill.ts`,
`summary-regenerate.ts`, `summary-reconciliation-cron/observe.ts`.

**Security/scoping:** notes use `createScopedRepository` + `verifyTopicOwnership`
parent-chain join (`notes.ts:270`); bookmarks/notes writes are proxy-blocked
(`assertNotProxyMode`); recaps IDOR-guarded per child; child mentor-memory has a
client-side IDOR guard (`child/.../mentor-memory.tsx:303`) and hard-denies reads until
consent resolves (`:72`).

---

## Complexity signals & redesign notes

1. **The backbone is scattered across 3 surfaces with no single home.** Recaps live in
   their own guardian tab; My Notes is hidden behind a **home-header icon** (not a tab,
   `LearnerScreen.tsx:511`); mentor-memory sits inside the **More** tab. A user wanting
   "what did I/my kid learn and what does the mentor remember" must visit three
   unrelated places.

2. **Two near-duplicate mentor-memory editors** (`mentor-memory.tsx` 821 lines vs
   `child/[profileId]/mentor-memory.tsx` 695 lines). They share `mentor-memory-sections.tsx`
   but re-implement consent prompts, Tell-Mentor, delete handlers, suppress/restore, and
   privacy actions separately — including subtle gating divergences (self uses
   `sessionIsOwner`; child uses `memoryConsentStatus` + a withdrawn-consent screen). A
   one-screen redesign would need to unify these into one role-parameterized view.

3. **Hallucination guard is built but UNWIRED.** `validateNoteDraft`
   (`services/challenge-round/note-draft.ts:117`) is the lexical-overlap guard that the
   project memory cites as the safety floor for Challenge-Round note drafts — but
   `createNoteForSession` (`services/notes.ts:230`) documents at `:237` that *"no
   production code path calls validateNoteDraft today, and no guard test exists."* The
   end-to-end pipeline is stranded. This is wired-but-untriggered debt directly in the
   #2 pillar.

4. **Three overlapping "what happened" report types.** A single completed session
   produces: a **learner recap** (`learnerRecap`/`closingLine`), a **parent highlight+
   narrative** (`generateSessionInsights`), and an **engagement signal** — surfaced
   variously on the session-summary screen, the recaps tab, and My Notes' session rows.
   Same underlying transcript, three generators, three render sites.

5. **My Notes hub mislabels its own contents.** The hub shows a count pill only for
   Sessions (`index.tsx:70`); Notes and Bookmarks always show no count, so the user
   can't tell if they're empty without tapping in. The leaf list also conflates three
   conceptually different kinds (transcripts, written notes, saved replies) into one
   `ArchiveItem` shape (`[kind].tsx:31`).

6. **Suppressed-memory restore is double-buried** — a collapsed `CollapsibleMemorySection`
   (`mentor-memory.tsx:764`, `defaultExpanded={false}`) at the bottom of an already-long
   scroll. A user who removed something by mistake is unlikely to find the undo.

7. **"Tell the mentor" exists in 3 forms** — self, parent-on-child, and the
   `[parent_correction]` correction box (`child/.../mentor-memory.tsx:649`) — all hitting
   `parseLearnerInput` with a different `source` tag. Consolidatable.

8. **Recap cards have ~5 fallback fields for one line of text** (`recap.narrative ??
   displaySummary ?? highlight ?? t('summaryPending')` at `index.tsx:133`), implying the
   generation pipeline frequently leaves fields null and the UI papers over it.

---

## Overlaps with other domains

- **Sessions / session-summary:** the recap/highlight content is generated by the
  *sessions* domain (`session-completed.ts`) and first shown on the
  `session-summary/[sessionId].tsx` screen (with `MentorMemoryCue`). Recaps tab and My
  Notes both re-render the same `session_summaries` rows. Strong overlap.
- **Progress:** My Notes' "Sessions" tab uses `useProfileSessions`/`...Archive` from the
  **progress** hooks (`my-notes/[kind].tsx:9,16`) and deep-links to session detail and to
  `topic/[topicId]`. Session history thus appears in both Progress and My Notes.
- **Library / Notes:** note **creation/edit** lives in the *library/topic* flow
  (`POST /subjects/:s/topics/:t/notes`); My Notes only **reads** them. Notes are reachable
  from at least two entry points (topic screen + My Notes list).
- **Family / parent-proxy:** recaps and the child mentor-memory editor are entirely
  guardian/parent surfaces; AddToMyLearning (`[recapId].tsx:175`) bridges into the
  family clone-from-child domain.
- **Onboarding:** interest context edits route through `use-onboarding-dimensions`
  (`mentor-memory.tsx:43`), so the same interests data model is shared with onboarding.
- **LLM routing / envelope:** recap & highlight generators deliberately bypass the
  structured envelope (content-only flows) and validate against bespoke schemas with
  their own parse-failure metrics (`session-recap.ts:396`).
