# LEARN-07 - Session Summary

> **Status:** Draft
> **Access label:** Shared different scope
> **Last mapped:** 2026-05-25
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `docs/specs/2026-05-23-freeform-library-filing.md`, `docs/plans/2026-05-23-freeform-library-filing-plan.md`, `apps/mobile/src/app/session-summary/[sessionId].tsx`, `apps/mobile/src/app/session-transcript/[sessionId].tsx`, `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx`, `apps/mobile/src/hooks/use-sessions.ts`, `apps/mobile/src/hooks/use-dashboard.ts`

## Purpose

Help the learner close a completed tutoring session by seeing what happened, optionally writing or skipping their own reflection, receiving feedback/XP, and choosing a next step. The flow is the learner-owned end cap for freeform, guided learning, homework, practice, relearn, and recitation sessions. It also exposes the "View full transcript" handoff to LEARN-23 when the learner needs the actual conversation again.

For Ask Anything/freeform sessions, close behavior in the filing PR series is intentionally scoped: ending a freeform session should navigate to Summary without a blocking "Add to Library?" decision. The session is saved as history either way. Meaningful freeform chats may auto-file into Library after close; the learner can prevent, remove, retry, or re-add Library filing from Summary depending on state. Homework may still show the older prompt during this transitional period, so this page must not teach "all sessions close without a prompt" as final product doctrine.

For mentors, the equivalent outcome is not entering this screen as the child. Mentor review is parent-native child session recap under `/(app)/child/[profileId]/session/[sessionId]`, with narrative, highlight, engagement signal, conversation prompt, optional homework summary, and child-topic CTAs.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Can enter for sessions owned by the active profile after a session ends or from historical session surfaces. They can submit a reflection, skip it, continue, inspect bookmarks/recap content, and open the transcript link when available. |
| Mentor / Family | Should review child sessions through parent-native child session detail, not by impersonating the child into `/session-summary/[sessionId]`. Normal Family surfaces should route to child detail or future Recaps. |
| Owner/account | Adult owners in Study see their own summaries exactly like any learner. Adult owners in Family reviewing a child should see child-scope recap data only, never mutate the child's learner reflection. |
| Wrong-audience deep link | Unauthenticated users redirect to `/sign-in`. Invalid/missing/expired session IDs show recovery to home/library. A parent proxy session may display this screen for legacy/internal paths, but current product direction treats that as compatibility, not normal mentor access. |

## Shared Scope Decision

`Shared different scope`

The learning session belongs to exactly one learner profile. Study users see their own learner reflection and transcript. Family users see mentor recap fields for linked children through child dashboard APIs. Session ownership and mentor read access must stay separate: mentor read access does not imply the mentor can submit or edit the learner's summary.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| End of live session | `/session-summary/[sessionId]` | Yes | No normal Family surface | `/(app)/session/index.tsx` routes here after completion with session params and `returnTo`. For freeform, target behavior removes the blocking post-close Library prompt. |
| Freeform Library status | Summary Library status/actions | Yes | No normal Family surface | Shows pending, filed destination, failed retry, kept-out, or Add to Library states without implying the session would be lost. |
| Historical learner session | `/session-summary/[sessionId]` | Yes | No | Library/shelf/progress historical session taps can re-open persisted learner summary states. |
| Submit reflection | `useSubmitSummary(sessionId)` on summary screen | Yes | No | Requires at least 10 trimmed characters before enabling `submit-summary-button`; local draft is autosaved by profile/session until submitted. |
| Skip reflection | `useSkipSummary(sessionId)` on summary screen | Yes | No | Skip is recorded as a persisted state; later re-entry renders skipped-state or draft recovery if a draft exists. |
| View full transcript | `/session-transcript/[sessionId]` | Yes | Compatibility only | LEARN-23 filters system-prompt rows and strips LLM envelope JSON; parent-proxy link is gated per inventory. |
| Continue learning | `/(app)/session` with `nextTopicId` when available | Yes | Bridge only | `session-next-topic-card` should start the learner's next session, with reason fed to prompt context. Mentor "Add to my learning" should write to the adult's Study context, not the child. |
| Mentor child recap | `/(app)/child/[profileId]/session/[sessionId]` | No | Yes | Uses `useChildSessionDetail`; parent sees narrative/highlight/prompt/engagement and optional homework summary. |
| Family Recaps | `/(app)/recaps` with detail handoff to `/(app)/child/[profileId]/session/[sessionId]` | No | Yes in V1 | Minimal navigation-contract branch surface lists child session recap fields and opens parent-native child session detail for full context. |

## Data Ownership And Privacy

- `learning_sessions`, transcript exchanges, bookmarks, learner recap, and reflection state are scoped to the session owner profile.
- Session history and Library filing are distinct. A freeform session remains saved as history even when `topicId` is null, filing fails, or the learner keeps it out of Library.
- Freeform Library filing can create or link a Library topic only under a subject owned by the learner. Library topics belong to subjects; unfiled sessions do not.
- Kept-out freeform sessions should be described as not in Library, not as unsaved or deleted. They remain available through summary/transcript history where the product exposes that history.
- `/session-summary/[sessionId]` must rely on session APIs that enforce active-profile ownership. A mentor should not gain write access to the child's learner recap by knowing a session ID.
- Parent-native child session detail is read-only mentor access, scoped by family-link/consent through dashboard child APIs. It can show generated recap fields and homework summary, but not the child's private learner reflection authoring controls.
- The transcript screen hides system-prompt rows and strips envelope JSON before render. This is privacy and quality hardening, especially for old or malformed assistant messages.
- Diagnostics or analytics around this flow should contain profile/session IDs and enums only; no display names, birth years, or raw transcript bodies.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | Auth-loading spinner first; transcript load shows skeleton/loading with a 15 second timeout escape. Learner recap polls every 2 seconds until present, timed out, or too short. |
| Empty | Too-short or missing recap still lets the learner finish. Transcript empty state says no saved messages and offers Back to library. Mentor child recap missing state explains that a recap may still be processing, short, or pre-feature, with a back action. |
| Success | Learner sees stats, recap header tailored to session type, reflection prompt chips, draft recovery, submit/skip/continue controls, optional XP/feedback, transcript CTA, bookmarks, mentor-memory cue, and next-topic card when available. Freeform summaries may also show Library filing state. |
| Freeform Library pending | Meaningful freeform chats can show `Adding this to your Library...` or equivalent compact copy plus a state-specific action such as `Don't add to Library`. This state is about Library filing only; the session is already saved. |
| Freeform Library filed | Summary shows the resolved Library destination, including topic title and parent subject/book when available, plus tap-through/change/rename affordance as implemented. |
| Freeform kept out or unfiled | Summary offers `Add to Library` when appropriate. Kept-out or below-threshold sessions remain saved but are not Library topics. |
| Freeform Library failed | Summary shows retry only after the server reports terminal failure; local polling timeout should read as still in progress, not fake failure. |
| Error/recovery | Missing session ID, expired session, not-found, transcript load failure, submit failure, and skip failure all surface retry/go-home or back actions. Submit failure preserves draft text. |
| No access | Unauthenticated deep link redirects to sign-in. Non-owner mentor access should use child detail, not learner summary. Tampered child session IDs should return protected/not-found through dashboard child APIs. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Existing unit/component tests cover auth gate, timeout/error paths, summary states, and transcript render guards; no manual web preview was run during this mapping pass. |
| Native/emulator | `e2e/flows/learning/session-summary.yaml`, `e2e/flows/learning/session-transcript.yaml`, and parent recap flows are listed in inventory; re-run needed after navigation-contract migration. |
| API/unit tests | Relevant mobile tests: `session-summary/[sessionId].test.tsx`, `session-transcript/[sessionId].test.tsx`, child session detail tests, and `use-sessions` tests. API ownership tests should be confirmed before treating mentor read access as final. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Fixed bug reference | BUG-889 | Added read-only transcript route because summary did not expose the actual conversation. Notion link could not be fetched in this session. |
| Fixed bug reference | BUG-941 | Envelope JSON stripped at transcript/chat-bubble render boundary. |
| Fixed bug reference | BUG-134 | Root-level summary/transcript routes need their own auth gate because `(app)` layout auth guard does not apply. |
| Fixed bug reference | BUG-449 | Historical summary re-entry must render persisted summary rather than empty "Your Words". |
| Fixed bug reference | BUG-801 | Numeric URL params preserve explicit zero values instead of falling back silently. |
| Product drift | Navigation contract | V1 Family target is parent-native Recaps; V0 Family shell still has `home, progress, more` and no tab-level Recaps. |
| Transitional UX | Freeform vs homework close | Freeform no-prompt close is the target for this filing PR series. Homework prompt behavior is intentionally unchanged for now and needs a follow-up product decision. |
| Product drift | Ask First / Unsorted | This page documents post-close freeform filing only. It does not claim the upstream no-upfront-subject Ask First / Unsorted work is shipped. |
| Product drift | LEARN-07 inventory note | `topicOrder` ordered-list rendering and second-session-open home teaser are listed as missing from audit Section E/Slice 2. |
| Access drift | Parent proxy compatibility | Current code still recognizes parent proxy, while target contract says normal parent review should not enter proxy. |
| Tooling gap | Notion MCP unavailable | Prior Notion bug URLs for LEARN-07 could not be retrieved; only code/inventory bug IDs are recorded here. |

## Open Questions

- Should a mentor ever see a child's learner-authored reflection, or only generated recap fields and transcript excerpts when consent allows?
- When Recaps ships, should LEARN-07 mentor entries deep-link directly to `recaps/[recapId]` or continue using child session detail for full context?
- Should the learner summary transcript CTA be suppressed for homework sessions containing photos if image privacy policy differs from text transcript policy?
- Should homework keep its post-close Library prompt long-term, or should it adopt the freeform no-prompt close pattern in a later PR?
