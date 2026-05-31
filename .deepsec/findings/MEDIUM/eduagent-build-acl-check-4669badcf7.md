# [MEDIUM] Library-filing write endpoints missing proxy-mode guard (parent-in-proxy can mutate/delete child's session data)

**File:** [`apps/api/src/routes/sessions.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/routes/sessions.ts#L360-L407) (lines 360, 379, 407)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

The three Library-filing write endpoints — POST /sessions/:sessionId/library-filing/keep-out (L360), /add (L379), and /restore (L407) — do NOT call assertNotProxyMode(c), unlike every other write endpoint in this file (messages L441, stream L625, close L1189, system-prompt L1261, events L1278, input-mode L1293, homework-state L1312, flag L1333, summary/skip L1363, summary L1401, and crucially the sibling retry-filing endpoint at L291 which DOES have the guard). assertNotProxyMode is the documented server-derived write guard (SEC-2/BUG-718, WI-171/DS-082): when the resolved X-Profile-Id is a non-owner profile (a parent acting on a linked child's profile), the request is a proxy session and writes must be blocked. Because these three endpoints omit it, a parent operating in proxy mode (X-Profile-Id = their child's non-owner profile, which profileScopeMiddleware verifies belongs to the parent's account) can mutate the child's session filing state. This is not merely metadata: markSessionKeptOutOfLibrary (session-crud.ts L1558) sets topicId=null and then calls deleteTopicIfSafe(db, profileId, sessionId, existing.topicId) (L1583), which deletes the auto-filed curriculum topic when no other session references it — a destructive write on the child's data. requestSessionLibraryFiling and restoreSessionForAutoFiling additionally dispatch background Inngest auto-file work. The underlying service functions ARE profile-scoped (no cross-account IDOR), so blast radius is bounded to a parent acting on their own linked child within the same account — hence MEDIUM rather than HIGH — but it still violates the proxy-mode write invariant the rest of the codebase enforces, and the keep-out path can silently delete a child's curriculum topic while the parent is in read-only 'view as child' mode.

## Recommendation

Add assertNotProxyMode(c) as the first statement in each of the three handlers (keep-out, add, restore), matching the sibling retry-filing handler and all other write endpoints in this file. Add a proxy-mode regression test for these endpoints to the existing session proxy-guard suite so the gap cannot reopen.

## Revalidation

**Verdict:** true-positive

Confirmed by direct read AND grep. assertNotProxyMode appears at L206,239,277,291,441,551,625,1189,1261,1278,1293,1312,1333,1363,1401,1449,1471 — but NOT in the three library-filing handlers: keep-out (L360-376), add (L379-404), restore (L407-432). Each goes straight from requireProfileId to the service call with no proxy check, while the sibling retry-filing handler (L291) and every other write in the file do call it. The destructive-write claim is verified in the service layer: markSessionKeptOutOfLibrary (session-crud.ts L1558) sets topicId=null then calls deleteTopicIfSafe(db, profileId, sessionId, existing.topicId); deleteTopicIfSafe (curriculum.ts L2014) DELETEs the curriculum_topics row after confirming it is auto-filed and unreferenced. requestSessionLibraryFiling/restoreSessionForAutoFiling return a dispatchId that the route uses to fire Inngest auto-file jobs. Concrete attack: an account owner sets X-Profile-Id to their linked child's (non-owner) profile — profileScopeMiddleware accepts it (same account) and sets isOwner=false. The owner, nominally in read-only 'view as child' mode, POSTs library-filing/keep-out and silently deletes the child's auto-filed curriculum topic and mutates filing state — a write the proxy invariant forbids everywhere else. All three services scope by profileId in the WHERE clause, so there is no cross-account IDOR; blast radius is one account's parent acting on its own child. MEDIUM is correct: bounded scope but a genuine proxy-write-invariant violation including a destructive delete.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-27)
