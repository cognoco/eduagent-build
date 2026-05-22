# Agent 3 Learning / Progress Checkpoint

Date: 2026-05-22  
Branch: i18n-translations  
Local SHA observed: fcaffa610 (coordinator prompt shared ae5cacc8a)  
API target: https://api-stg.mentomate.com  
Preview target: http://127.0.0.1:19006

## Scope Covered

- Covered Batch 4 LEARN-01..LEARN-26 by plan/inventory/source/YAML review.
- Focused active-student ownership, Library/Progress visibility, session summary/transcript, retention/relearn, saved/bookmarks, and vocabulary.
- Reviewed source for Library, Progress, Saved, Vocabulary, Topic detail, Recall test, Relearn, Session, Session summary, Session transcript, bookmarks API, sessions API, and retention API.
- Reviewed relevant web/native E2E YAML for progress analytics, saved bookmarks, vocabulary browser, session summary, session transcript, and parent-proxy transcript.

## Bugs Filed

1. [LEARN-07] See your Library link opens Topic detail  
   Notion: https://www.notion.so/3688bce91f7c8109a3c2c1ba11a6c2e1  
   Priority: P2  
   Platform: Mobile-Web, Mobile-Android, Mobile-iOS  
   Summary: session summary renders "See your Library" but routes to topic detail whenever topicId and subjectId are present.

2. [LEARN-24] Empty Saved Go to Library can return to Progress  
   Notion: https://www.notion.so/3688bce91f7c81618164f95ad03277ce  
   Priority: P3  
   Platform: Mobile-Web, Mobile-Android, Mobile-iOS  
   Summary: empty Saved bookmarks CTA says "Go to Library" but uses goBackOrReplace, so from Progress it can go back to Progress instead of Library.

3. [LEARN-13] Recall test API accepts unowned topicId  
   Notion: https://www.notion.so/3688bce91f7c81958f6fc6d7df40973f  
   Priority: P1  
   Platform: API, Mobile-Web, Mobile-Android, Mobile-iOS  
   Summary: processRecallTest can auto-create a retention card for input.topicId without proving the topic belongs to the active profile.

4. [LEARN-14] Relearn CTA no-ops when recall deep link lacks subjectId  
   Notion: https://www.notion.so/3688bce91f7c8127aa1fecb44969717c  
   Priority: P2  
   Platform: Mobile-Web, Mobile-Android, Mobile-iOS  
   Summary: recall-test only requires topicId, but the remediation Relearn action silently returns when subjectId is absent.

## Rows / Result Notes

- LEARN-01..LEARN-06: session source reviewed. Ownership is via active profile API client and activeProfile query keys. Voice controls are native/web-limited; did not run emulator/native voice.
- LEARN-07: bug filed for post-session "See your Library" routing to topic detail.
- LEARN-08..LEARN-12: Library, shelf, book, and topic detail reviewed. Study Library appears active-profile scoped. Topic detail resolves topic-only deep links and has a timeout escape.
- LEARN-13..LEARN-16: recall/relearn reviewed. Bugs filed for recall-test API ownership gap and recall remediation no-op when subjectId is missing. Relearn API itself verifies topic ownership before writing.
- LEARN-17..LEARN-20: Progress tab reviewed. Study mode pins selectedProfileId to activeProfile and hides linked-child picker; child APIs are only enabled for family/null mode owner views.
- LEARN-21..LEARN-22: vocabulary browser and per-subject vocabulary reviewed. Query keys include activeProfile; no cross-student leak found from source review.
- LEARN-23: transcript route reviewed. Transcript is profile-scoped through getSession/getSessionTranscript; parent proxy transcript CTA is intentionally hidden in summary.
- LEARN-24: bug filed for empty Saved CTA using back semantics instead of guaranteed Library navigation. Bookmark list/delete APIs are active-profile scoped; proxy delete is hidden and API-blocked.
- LEARN-25: Library search reviewed. Search result handlers route subject/book/topic/note/session from active-profile-scoped hooks; session result includes proxy child profile only in impersonated-child mode.
- LEARN-26: first-curriculum session route/API reviewed at source level. API uses assertNotProxyMode and active profile scoping.

## Blockers / Partial Coverage

- Did not run full authenticated Playwright setup or full E2E suites because shared setup had already returned to sign-in with a session-expired banner and coordinator asked agents not to run full setup in parallel.
- Did not run emulator/native branches. Voice-specific LEARN-06 remains partial/native-limited.
- No live staging API mutation was made for the recall ownership issue; evidence is source-level to avoid mutating shared staging data with unowned topic IDs.

