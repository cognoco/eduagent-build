# [BUG] Missing UUID validation on subjectId path param causes unhandled 500s on malformed input (incomplete BUG-392 application)

**File:** [`apps/api/src/routes/language-progress.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/routes/language-progress.ts#L18-L26) (lines 18, 19, 20, 26)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-missing-input-validation`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

The GET '/subjects/:subjectId/cefr-progress' handler reads the path param raw via c.req.param('subjectId') (line 26) and passes it straight into getCurrentLanguageProgress, which runs db.query.subjects.findFirst({ where: and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)) }) (services/language-curriculum.ts:428-430). subjects.id is a Postgres `uuid` column (packages/database/src/schema/subjects.ts:49). Passing a non-UUID string (e.g. /subjects/foo/cefr-progress) makes Postgres raise error 22P02 'invalid input syntax for type uuid'. This is not classified as a transient DB error by isTransientDatabaseError, so the global onError handler (index.ts:460-498) treats it as an unhandled fault: HTTP 500 plus a captureException() Sentry event. An authenticated user can spam malformed subjectIds to inflate the error rate and burn Sentry quota. This is the exact failure mode the sibling routes guard against: topic-suggestions.ts (lines 19-23) and book-suggestions.ts (lines 32-35) both add `zValidator('param', z.object({ subjectId: z.string().uuid(), ... }))` citing '[BUG-392] Guard path params against non-UUID input reaching the DB layer.' That fix was not applied to language-progress.ts, so BUG-392 is incompletely swept (violates the repo's 'Sweep when you fix' rule for 3+ sibling locations). This is NOT a security vulnerability: the query is parameterized (no SQL injection), profileId scoping is intact (no cross-tenant read), and a valid-but-unowned UUID correctly returns notFound. The impact is bounded robustness/observability noise.

## Recommendation

Mirror the sibling routes: import zValidator and z, define `const cefrProgressParamSchema = z.object({ subjectId: z.string().uuid() });`, add `zValidator('param', cefrProgressParamSchema)` to the .get() chain, and read `const { subjectId } = c.req.valid('param');`. This rejects malformed input with a clean 400 before it reaches the uuid column, matching topic-suggestions.ts and book-suggestions.ts and completing the BUG-392 sweep.

## Revalidation

**Verdict:** true-positive

Every link in the described chain is confirmed in the current code. The GET '/subjects/:subjectId/cefr-progress' handler reads c.req.param('subjectId') raw at line 26 with no zValidator on the 'param' target, and passes it directly into getCurrentLanguageProgress, which at services/language-curriculum.ts:428-430 runs db.query.subjects.findFirst({ where: and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)) }). subjects.id is declared uuid('id') in packages/database/src/schema/subjects.ts, so Drizzle/Neon passes the raw string to Postgres, which raises 22P02 'invalid input syntax for type uuid' for a value like 'foo'. I read isTransientDatabaseError (transient-db-retry.ts:10-31) in full: it only matches ECONNRESET/ECONNREFUSED/ETIMEDOUT codes and connection-related message regexes — a 22P02 error (code '22P02', message 'invalid input syntax for type uuid') matches none, so in index.ts the error skips the LLM-503 branch (437-457) and the transient-503 branch (460) and falls through to the generic handler that fires captureException() and returns HTTP 500 (481-498). The route is genuinely reachable: authMiddleware is applied at index.ts:218 and languageProgressRoutes is mounted at 269, and the full path /v1/subjects/:subjectId/cefr-progress is not in PUBLIC_PATHS, so any authenticated user with a valid X-Profile-Id can repeatedly send malformed subjectIds to generate unhandled 500s and burn Sentry quota. The 'incomplete sweep' claim is also accurate: topic-suggestions.ts:18-22 and book-suggestions.ts:31-34 both carry the '[BUG-392] Guard path params against non-UUID input' zValidator with z.string().uuid(), and this file does not. The finding correctly scopes this as a robustness/observability BUG, not a security vuln — the query is parameterized (no SQLi), profileId scoping is intact (no cross-tenant read), and a valid-but-unowned UUID returns notFound — so the BUG severity is appropriate and needs no adjustment.

## Recent committers (`git log`)

- crowka <zuzana.kopecna@zwizzly.com> (2026-05-05)
