# WI-2520 red → green → production-revert red → exact-restore green

Date: 2026-07-31

All four valid phases used the same focused ratchet command:

```sh
DATABASE_URL=postgresql://localhost/wi2520_unit pnpm exec jest router.age-bracket-coverage
```

The explicit local URL only prevents the Jest bootstrap from selecting the
shared staging metadata in `.env.development.local`; this source-scanning
suite performs no database operations.

## 1. Red before candidate

The 11 newly threaded `ageBracket` properties were temporarily absent.

- Exit: `1`
- Suites: 1 failed / 1 total
- Tests: 1 failed, 1 passed / 2 total
- Snapshots: 0
- Ratchet violations: exactly 11

```text
apps/api/src/services/book-suggestion-generation.ts:116 — book.suggestion
apps/api/src/services/curriculum.ts:141 — curriculum.generate
apps/api/src/services/curriculum.ts:219 — curriculum.generate
apps/api/src/services/curriculum.ts:2996 — curriculum.generate
apps/api/src/services/dictation/generate.ts:216 — dictation.generate
apps/api/src/services/dictation/prepare-homework.ts:86 — dictation.prepare-homework
apps/api/src/services/dictation/review.ts:221 — dictation.review
apps/api/src/services/homework-summary.ts:314 — homework.summary
apps/api/src/services/session-llm-summary.ts:319 — session-llm-summary
apps/api/src/services/summaries.ts:162 — summaries.generate
apps/api/src/inngest/functions/post-session-suggestions.ts:185 — post.session.suggestions
```

## 2. Candidate green

The 11 properties were restored to the candidate implementation.

- Exit: `0`
- Suites: 1 passed / 1 total
- Tests: 2 passed / 2 total
- Snapshots: 0
- Ratchet violations: 0
- Time: 0.425 s

## 3. Production-revert red

After the implementation commits existed, the 11 routed properties were again
removed from the production files with a surgical patch. No ratchet or denylist
code changed.

- Exit: `1`
- Suites: 1 failed / 1 total
- Tests: 1 failed, 1 passed / 2 total
- Snapshots: 0
- Ratchet violations: exactly 11
- Time: 0.426 s

```text
apps/api/src/services/book-suggestion-generation.ts:116 — routeAndCall flow='book.suggestion' without ageBracket
apps/api/src/services/curriculum.ts:141 — routeAndCall flow='curriculum.generate' without ageBracket
apps/api/src/services/curriculum.ts:219 — routeAndCall flow='curriculum.generate' without ageBracket
apps/api/src/services/curriculum.ts:2999 — routeAndCall flow='curriculum.generate' without ageBracket
apps/api/src/services/dictation/generate.ts:216 — routeAndCall flow='dictation.generate' without ageBracket
apps/api/src/services/dictation/prepare-homework.ts:86 — routeAndCall flow='dictation.prepare-homework' without ageBracket
apps/api/src/services/dictation/review.ts:221 — routeAndCall flow='dictation.review' without ageBracket
apps/api/src/services/homework-summary.ts:314 — routeAndCall flow='homework.summary' without ageBracket
apps/api/src/services/session-llm-summary.ts:319 — routeAndCall flow='session-llm-summary' without ageBracket
apps/api/src/services/summaries.ts:162 — routeAndCall flow='summaries.generate' without ageBracket
apps/api/src/inngest/functions/post-session-suggestions.ts:185 — routeAndCall flow='post.session.suggestions' without ageBracket
```

## 4. Exact restore green

The inverse patch restored the properties. The nine affected production files
had identical Git blob hashes before the production revert and after restore:

| File | Before and after blob |
| --- | --- |
| `book-suggestion-generation.ts` | `4166b5743cb1eab83d77212d38cc728868d12db6` |
| `curriculum.ts` | `0597157996df1ba22fffe9cbf4bb1eba77d9c9f1` |
| `dictation/generate.ts` | `4389aef845c7320e179e3d04a4eba0ae47c3a05b` |
| `dictation/prepare-homework.ts` | `2ddabc9fccd5bd598b2bfac7d03225e3a1fab093` |
| `dictation/review.ts` | `f3a996c08e383e37c2d92a8d4989dd617d3ae5b8` |
| `homework-summary.ts` | `6ffdfdc613edeafed8ef91fe67147d560203c799` |
| `session-llm-summary.ts` | `c7b66907ae2e2536d31ff5db1183825ac6fe6964` |
| `summaries.ts` | `319165ce92b148d4a3cca0ad15be8f4fe58e79c9` |
| `post-session-suggestions.ts` | `4b2907e1f7068acc0dbff8c614f72570fe266889` |

- Exit: `0`
- Suites: 1 passed / 1 total
- Tests: 2 passed / 2 total
- Snapshots: 0
- Ratchet violations: 0
- Time: 0.410 s

## Excluded harness precondition failure

An earlier invocation without `DATABASE_URL` exited before collecting tests
because the repository's Jest bootstrap rejected a shared staging fallback.
It is not counted as red evidence.
