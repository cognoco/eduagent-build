# Voice-floor coverage audit

Date: 2026-07-21  
Work item: WI-1763 — Voice-floor coverage audit across V2 surfaces  
Revision inspected: `bafb03071c642d871213fd8791e030d26c28a78e`

## Ruling and method

The V2 shell specification requires a mic on every product input because typing
is a barrier for the target learner, with transcription only and no tone or
emotion analysis
(`docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md:117`). The MVP
ruling keeps that transcription-input floor in scope
(`docs/plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md:89`).

The audit began with every production mobile TSX render of `TextInput`:

```sh
rg -n '<TextInput' apps/mobile/src --glob '*.tsx' \
  --glob '!*.test.tsx' --glob '!*.spec.tsx'
```

That census found 52 JSX render sites in 40 owner files (the 53rd textual match
is a `useRef<TextInput>` type reference in
`apps/mobile/src/app/profiles.tsx:81`). The audit then:

1. expanded shared components at their V2-reachable call sites;
2. followed wrapper and route reachability instead of treating a component
   definition as proof that a learner can reach it;
3. inspected actual speech handlers, not mic icons or optional callback types;
4. collapsed repeatable dynamic rows, such as homework problem editors, into one
   surface family; and
5. separated structured/security controls and unreachable or non-learner inputs
   into the disposition ledger below.

The result is 40 V2-reachable learner free-text surface contexts: **12
voice-present, 28 voice-absent, and 0 documented exceptions**. A visible but
unwired mic is absent. A plausible exception is not documented until the
appropriate human owner rules it.

## Reachable learner surface inventory

| # | Surface and reachability | Evidence | Voice disposition |
|---:|---|---|---|
| 1 | Mentor cold-start ask | `apps/mobile/src/components/mentor/ColdStartCard.tsx:92`; mounted from `apps/mobile/src/app/(app)/mentor.tsx:372` | **Absent → WI-2549.** No mic or speech handler. |
| 2 | Persistent Mentor ask | `apps/mobile/src/components/mentor/MentorInputBar.tsx:48`; mic at `apps/mobile/src/components/mentor/MentorInputBar.tsx:92-95` is explicitly disabled; mounted at `apps/mobile/src/app/(app)/mentor.tsx:492` | **Absent → existing WI-2216.** WI-955 removed the prior fake transcript; WI-2216 owns real STT for this component. |
| 3 | Main learning-session composer | `apps/mobile/src/components/session/ChatShell.tsx:384,1200,1224`; mounted at `apps/mobile/src/app/(app)/session/index.tsx:1768` | **Present.** Production speech hook and mic feed the typed submit path. |
| 4 | Recall-check composer | `apps/mobile/src/components/session/ChatShell.tsx:1200,1224`; mounted at `apps/mobile/src/app/(app)/topic/recall-test.tsx:486` | **Present.** Same production STT path. |
| 5 | Practice-assessment composer | `apps/mobile/src/components/session/ChatShell.tsx:1200,1224`; mounted at `apps/mobile/src/app/(app)/practice/assessment/index.tsx:565` | **Present.** Same production STT path. |
| 6 | Main-session editable voice transcript | `apps/mobile/src/components/session/VoiceRecordButton.tsx:132`; mounted by `apps/mobile/src/components/session/ChatShell.tsx:1063` | **Present.** Transcript is produced by the adjacent mic and can be re-recorded. |
| 7 | Recall-check editable voice transcript | `apps/mobile/src/components/session/VoiceRecordButton.tsx:132`; mounted through `apps/mobile/src/components/session/ChatShell.tsx:1063` at `apps/mobile/src/app/(app)/topic/recall-test.tsx:486` | **Present.** |
| 8 | Practice-assessment editable voice transcript | `apps/mobile/src/components/session/VoiceRecordButton.tsx:132`; mounted through `apps/mobile/src/components/session/ChatShell.tsx:1063` at `apps/mobile/src/app/(app)/practice/assessment/index.tsx:565` | **Present.** |
| 9 | Inline first-session “Your Words” reflection | `apps/mobile/src/app/(app)/session/index.tsx:193`; wrap-up mount near `:1682` | **Absent → WI-2549.** |
| 10 | Durable session-summary “Your Words” reflection | `apps/mobile/src/app/session-summary/[sessionId].tsx:1636`; reached after V2 session close through `apps/mobile/src/components/session/use-session-actions.ts:256-261` | **Absent → WI-2549.** |
| 11 | In-session custom subject resolution | `apps/mobile/src/components/session/SessionAccessories.tsx:298`; session mounts at `apps/mobile/src/app/(app)/session/index.tsx:1715,1828` | **Absent → WI-2550.** |
| 12 | Session Parking Lot question | `apps/mobile/src/components/session/SessionModals.tsx:71`; mounted at `apps/mobile/src/app/(app)/session/index.tsx:1884` | **Absent → WI-2551.** |
| 13 | Drafted challenge-note editor | `apps/mobile/src/components/session/DraftedNoteReview.tsx:38`; mounted at `apps/mobile/src/app/(app)/session/index.tsx:1644` | **Absent → WI-2551.** |
| 14 | Session note authoring | `apps/mobile/src/components/library/NoteInput.tsx:37,67,103`; called by `apps/mobile/src/components/session/SessionFooter.tsx:130` in the V2 session context from row 3 | **Present.** Shared note input has real STT. |
| 15 | V2 Subjects global search | `apps/mobile/src/components/subjects/SubjectsBrowse.tsx:182`; mounted from `apps/mobile/src/app/(app)/subjects.tsx:122` | **Absent → WI-2550.** |
| 16 | Create Subject topic/name | `apps/mobile/src/app/create-subject.tsx:794`; entered from V2 Subjects at `apps/mobile/src/app/(app)/subjects.tsx:131` | **Absent → WI-2550.** |
| 17 | Create Subject clarification | `apps/mobile/src/app/create-subject.tsx:997`; entered through the same V2 Subjects route as row 16 | **Absent → WI-2550.** |
| 18 | Language-subject custom native language | `apps/mobile/src/app/(app)/onboarding/language-setup.tsx:325`; reached from `apps/mobile/src/app/create-subject.tsx:390` | **Absent → WI-2553.** The human ruling must decide whether this structured preference needs voice or a documented exception. |
| 19 | Pick-book custom direction | `apps/mobile/src/app/(app)/pick-book/[subjectId].tsx:599`; reached from broad subject creation at `apps/mobile/src/app/create-subject.tsx:377-386` | **Absent → WI-2550.** |
| 20 | Subject Hub chapter/topic search | `apps/mobile/src/components/subject-hub/SubjectHubSearchFilter.tsx:30,38-47`; `apps/mobile/src/components/subject-hub/SubjectHub.tsx:206` receives no handler from `apps/mobile/src/app/(app)/subject-hub/[subjectId]/index.tsx:335` | **Absent → WI-2550.** The rendered mic only calls an undefined optional callback. |
| 21 | Subject Hub topic-note authoring | `apps/mobile/src/components/subject-hub/SubjectHubNotesSection.tsx:116,131`; the V2 route wires note creation at `apps/mobile/src/app/(app)/subject-hub/[subjectId]/index.tsx:353` through `apps/mobile/src/components/subject-hub/SubjectHub.tsx:233-240`, but `apps/mobile/src/components/subject-hub/TopicDetailSheet.tsx:114` passes no `onNoteVoice` | **Absent → WI-2550.** This is regression provenance from closed WI-1118, not an open owner. |
| 22 | Existing book-note edit | `apps/mobile/src/components/library/NoteInput.tsx:37,67,103`; mounted at `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx:1731`; V2 Subjects opens the book route at `apps/mobile/src/app/(app)/subjects.tsx:35-45` | **Present.** |
| 23 | New book-note add | `apps/mobile/src/components/library/NoteInput.tsx:37,67,103`; mounted at `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx:1779`; same V2 Subjects route as row 22 | **Present.** |
| 24 | Topic note add/edit | `apps/mobile/src/components/library/NoteInput.tsx:37,67,103`; mounted at `apps/mobile/src/app/(app)/topic/[topicId].tsx:951`; V2 Subjects opens the topic route at `apps/mobile/src/app/(app)/subjects.tsx:50-55` | **Present.** |
| 25 | Shell-independent Library search | `apps/mobile/src/components/library/LibrarySearchBar.tsx:26`; `apps/mobile/src/app/(app)/library.tsx:1021`; reachable after V2 recall via `apps/mobile/src/app/(app)/topic/recall-test.tsx:497` | **Absent → WI-2552.** |
| 26 | Journal Notes archive search | `apps/mobile/src/components/journal/JournalNotesArchive.tsx:43,200,213`; mounted by `apps/mobile/src/components/journal/JournalTabView.tsx:274` on the V2 Journal route at `apps/mobile/src/app/(app)/journal/index.tsx:27` | **Present.** Real STT updates the filter. |
| 27 | My Notes drill-down search | `apps/mobile/src/app/(app)/my-notes/[kind].tsx:499`; linked from `apps/mobile/src/components/journal/JournalNotesArchive.tsx:242` | **Absent → WI-2552.** |
| 28 | Learner “Tell Mentor” memory entry | `apps/mobile/src/components/tell-mentor-input.tsx:101`; learner call at `apps/mobile/src/app/(app)/mentor-memory.tsx:477` | **Absent → WI-2549.** |
| 29 | Global authenticated feedback message | `apps/mobile/src/components/feedback/FeedbackSheet.tsx:196`; global mount `apps/mobile/src/components/feedback/FeedbackProvider.tsx:34`, under V2 layout at `apps/mobile/src/app/(app)/_layout.tsx:812` | **Absent → WI-2552.** |
| 30 | Generic quiz free-text answer | `apps/mobile/src/app/(app)/quiz/play.tsx:917`; V2 light-practice entry from `apps/mobile/src/app/(app)/mentor.tsx:332` | **Absent → WI-2551.** |
| 31 | Guess Who answer | `apps/mobile/src/components/quiz/GuessWhoQuestion.tsx:226`; quiz call at `apps/mobile/src/app/(app)/quiz/play.tsx:984` | **Absent → WI-2551.** |
| 32 | Dictation supplied-source text | `apps/mobile/src/app/(app)/dictation/text-preview.tsx:124`; dictation entry at `apps/mobile/src/app/(app)/dictation/index.tsx:216`; V2 Mentor launch at `apps/mobile/src/app/(app)/mentor.tsx:332-334` | **Ruling pending → WI-2553.** No current exception permits typing-only. |
| 33 | Dictation correction/retype | `apps/mobile/src/app/(app)/dictation/review.tsx:278`; reached from `apps/mobile/src/app/(app)/dictation/complete.tsx:260`; V2 Mentor launch at `apps/mobile/src/app/(app)/mentor.tsx:332-334` | **Ruling pending → WI-2553.** Speech could defeat a deliberate writing-correction exercise, but that is a proposed rationale, not a documented exception. |
| 34 | Homework OCR problem editor family | `apps/mobile/src/app/(app)/homework/camera.tsx:75,812,1220,1244`; V2 Mentor entry at `apps/mobile/src/app/(app)/mentor.tsx:148` | **Present.** Each repeatable problem row has real STT. |
| 35 | Homework manual subject name | `apps/mobile/src/app/(app)/homework/camera.tsx:1506`; same V2 Mentor homework launch as row 34 | **Absent → WI-2550.** |
| 36 | Homework OCR-error manual problem fallback | `apps/mobile/src/app/(app)/homework/camera.tsx:1665`; same V2 Mentor homework launch as row 34 | **Absent → WI-2551.** The surrounding flow offers typing only. |
| 37 | Save Wizard self display name | `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx:264`; pre-shell gate at `apps/mobile/src/app/(app)/_components/save-wizard/SaveWizardGate.tsx:208` | **Ruling pending → WI-2553.** |
| 38 | Save Wizard child display name | `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx:298`; same gate at `apps/mobile/src/app/(app)/_components/save-wizard/SaveWizardGate.tsx:208` | **Ruling pending → WI-2553.** |
| 39 | Create Profile display name | `apps/mobile/src/app/create-profile.tsx:666`; first-profile gate at `apps/mobile/src/app/(app)/_components/CreateProfileGate.tsx:48`; V2 Account add-child route at `apps/mobile/src/components/account/AccountAdminSheet.tsx:199-209` | **Ruling pending → WI-2553.** |
| 40 | Profile rename display name | `apps/mobile/src/app/profiles.tsx:440`; linked from the V2 Account admin sheet at `apps/mobile/src/components/account/AccountAdminSheet.tsx:163-170` | **Ruling pending → WI-2553.** |

## Structured, sensitive, and excluded input ledger

These fields were inspected during the 52-site census but are not silently
declared exceptions. Security, exact-confirmation, identity, or learning-purpose
constraints require the explicit ruling captured in WI-2553.

| Input class | Evidence | Disposition |
|---|---|---|
| Authentication emails, passwords, and verification/reset codes | `apps/mobile/src/app/(auth)/sign-in.tsx:1159,1419,1442`; `apps/mobile/src/app/(auth)/sign-up.tsx:466,675,695`; `apps/mobile/src/app/(auth)/forgot-password.tsx:352,370,478`; shared `apps/mobile/src/components/common/PasswordInput.tsx:41` | **WI-2553.** Decide voice-required versus documented security/privacy exception. |
| Password creation/change fields reached from Account | `apps/mobile/src/components/add-password.tsx:120,130`; `apps/mobile/src/components/change-password.tsx:140,159,168` | **WI-2553.** No exception is presently documented. |
| Consent, guardian, link, and account-email fields/codes | `apps/mobile/src/app/consent.tsx:307,393`; `apps/mobile/src/components/change-email.tsx:222,255`; `apps/mobile/src/app/(app)/link/initiate.tsx:428`; `apps/mobile/src/app/(app)/_components/ConsentPendingGate.tsx:411` | **WI-2553.** Human privacy/accessibility ruling required. |
| Birth date/year and other structured identity entry | `apps/mobile/src/app/create-profile.tsx:695`; `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx:276,306` | **WI-2553.** Human ruling required; display-name fields are separately inventoried above. |
| Exact destructive confirmation | `apps/mobile/src/app/delete-account.tsx:336` | **WI-2553.** Exact `DELETE` control may warrant an exception, but none is documented. |
| Custom pronouns route | `apps/mobile/src/app/(app)/onboarding/pronouns.tsx:360` | **Currently unreachable**, so excluded from the reachable count; WI-2553 owns the disposition if reachability returns. |
| Guardian-only child-memory Tell Mentor and correction inputs | Shared `apps/mobile/src/components/tell-mentor-input.tsx:101` mounted at `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx:474`; direct correction at `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx:617` | **Not learner-editable**, so excluded from the learner surface count. WI-2549's captured AC explicitly owns both the shared `TellMentorInput` and the V2-reachable editable correction while preserving the distinct supporter context. |

## Follow-up ownership

An exhaustive live Cosmo search across 2,520 items found only one open direct
implementation owner before this audit: WI-2216 for `MentorInputBar`. Parked
WI-1459 is a post-MVP voice-first umbrella, not the ratified transcription floor.
Closed WI-1447 and WI-1486 remain the landed locale and intentional-permission
point fixes; this audit cross-references rather than duplicates them.
WI-2129 — Consolidate duplicate Mentor home prompt cards — is not a voice
implementation owner, but it may move the composer surfaces. Refinement must
cross-link and sequence WI-2216 and WI-2549 with WI-2129 to avoid churn.

| Work item | Outcome owned | Capture result |
|---|---|---|
| WI-2216 — Enable voice capture on the V2 Mentor input | Persistent `MentorInputBar` only | Existing Ready item in BID-36 |
| WI-2549 — Add transcription to V2 Mentor cold-start, reflections, and memory inputs | Rows 1, 9, 10, and 28, plus the guardian memory inputs explicitly dispositioned in the excluded ledger | Created; linked to WI-1763 and WI-2216 |
| WI-2550 — Add transcription to V2 Subjects search, notes, and creation inputs | Rows 11, 15-17, 19-21, and 35 | Created; linked to WI-1763 |
| WI-2551 — Add transcription to V2-reachable quiz, homework fallback, and session utility inputs | Rows 12, 13, 30, 31, and 36 | Created; linked to WI-1763 |
| WI-2552 — Close transcription gaps in V2-reachable search and feedback utilities | Rows 25, 27, and 29 | Created; linked to WI-1763 |
| WI-2553 — Ratify voice-floor exceptions for security, identity, and deliberate-typing inputs | Rows 18, 32, 33, 37-40, plus the structured-input ledger | Created Design item; human product/security/legal ruling required |

Capture's two-stage dedup judge created all five items and classified every
candidate as a sibling, not a duplicate. The only capture diagnostics were
unset Sprint advisories, left for triage/refine as intended. No new item was
assigned to a Delivery Batch by this audit.

## Durable checks for future audits

- Re-run the production `TextInput` census above and reconcile both newly added
  and removed sites against this table.
- Inspect call-site wiring: a mic icon, `VoiceRecordButton` decoration, or an
  optional `onVoice*` type is not proof of transcription.
- Keep voice input transcription-only. Raw audio persistence and tone/emotion
  inference remain prohibited regardless of surface.
- Do not convert a plausible security, pedagogy, or structured-input rationale
  into an exception without the WI-2553 ruling and a cited durable document.
