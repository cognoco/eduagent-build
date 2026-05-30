# [HIGH] Proxy-mode session write protection relies on a client-side redirect for non-metered writes

**File:** [`apps/mobile/src/app/(app)/session/_layout.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/(app)/session/_layout.tsx#L9) (lines 9)
**Project:** eduagent-build
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

SessionLayout redirects parent-proxy users away from the session UI, but that is only a client-side navigation guard. Tracing the server routes used by the session flow shows assertNotProxyMode is applied to session creation, clear-continuation-depth, interleaved sessions, and metered LLM routes, but non-metered session writes such as close, system-prompt, events, input-mode, homework-state, flag, summary submit/skip, and parking-lot writes do not consistently call the server-side proxy guard. profileScope verifies that the child profile belongs to the authenticated account, but it does not reject non-owner writes unless assertNotProxyMode is invoked. A parent can bypass this Redirect by calling those API endpoints directly with the child X-Profile-Id and mutate child session state.

## Recommendation

Enforce proxy-mode authorization on the API boundary for every session and session-adjacent write route, preferably with route-group middleware or explicit assertNotProxyMode(c) calls. Add negative tests with profileMeta.isOwner=false and with X-Proxy-Mode omitted/false for close, input-mode, homework-state, summary, flag, system-prompt/events, and parking-lot writes.

## Revalidation

**Verdict:** true-positive

The core thesis is correct and a live exploit exists, though the finding's specific example routes are stale. I independently confirmed the mechanism: `profileScopeMiddleware` (profile-scope.ts:200) sets `isOwner` from the DB row and only throws 400/401/503 — it never rejects a non-owner (parent-proxy) write on its own; the read-only intent is enforced solely by per-handler `assertNotProxyMode(c)` calls. `rg` over sessions.ts shows that guard at 17 sites (206, 239, 277, 291, then 441, 551, 625, 1189, 1261, 1278, 1293, 1312, 1333, 1363, 1401, 1449, 1471) — meaning every route the finding actually named (close@1189, system-prompt@1261, events@1278, input-mode@1293, homework-state@1312, flag@1333, summary/skip@1363, summary@1401, parking-lot@parking-lot.ts:78) IS now guarded; those were remediated under WI-371. BUT the same per-handler pattern left a gap: the three library-filing write routes — `keep-out` (sessions.ts:361-376), `add` (379-404), `restore` (407-432) — go straight from `requireProfileId` to a mutating service (`markSessionKeptOutOfLibrary`, `requestSessionLibraryFiling`+`dispatchSessionAutoFileRequested`, `restoreSessionForAutoFiling`+dispatch) with no `assertNotProxyMode`. These were added after the WI-371 sweep (commit a9e125bf9) and never guarded. Concrete attack: a parent owner sends `POST /v1/sessions/<child-session-id>/library-filing/keep-out` with their own JWT and `X-Profile-Id: <child-uuid>`; profileScope resolves the child (isOwner=false), the missing guard lets it proceed, mutating the child's session filing state (nulling topicId, possibly deleteTopicIfSafe) and, for add/restore, firing the core `app/session.auto_file_requested` Inngest pipeline — all while proxy mode is supposed to be read-only. No header forgery needed; it works with X-Proxy-Mode false or absent because the guard is never reached. The finding's recommendation (route-group middleware + negative tests for isOwner=false) is validated by this exact gap. I retain HIGH per the project threat model's elevation of proxy-write bypass, noting blast radius is capped to same-account parent→own-child state.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-26)
- Lord Vetinari <vetinari@zaf.fleet> (2026-05-25)
