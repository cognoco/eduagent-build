# WI-2532 verification

## Acceptance behavior

- Adult family intent creates only the adult owner profile and pending UI state.
- Me clears the pending state, queues the ordinary first-profile mentor-born
  ceremony, and enters the learner shell without family or child state.
- Someone else durably advances to the own-login question.
- Yes persists an opening-invitation destination, replays that destination
  after remount if needed, and clears the marker only after the destination
  route mounts: the invitation form under V2 or the explicit unavailable gate
  under older shells.
- No durably shows the explicit managed-profile unavailable state and can return
  to the login question.
- Sign-out clears both SecureStore and the in-memory pending-state cache.
- SecureStore write, clear, rejection, and timeout paths fail closed with
  translated retry UI; retry after adult creation does not repeat the POST.
- Successful initial and retry persistence use the landed shell-aware
  completion path: V2 Mentor, older-shell Home. Cancel, pending-consent, and
  ordinary add-child paths retain their existing close semantics.

## Focused mobile verification

- Merge-forward union covering family-intent state, component, profile
  creation, app-layout, invitation route, sign-out, session routing, consent
  routing, link resubmit-generation guards, first-Mentor language
  confirmation, and the landed E2E test-seed helper: 14 suites, 472 tests
  passed.
- Focused RED proved the two family-intent persistence paths made zero
  shell-aware replace calls under the old `handleClose`; both pass after using
  the landed completion helper.
- The two focused route-preservation cases passed: a pending restore keeps the
  requested Tabs navigator mounted but hidden, and a failed restore retry
  preserves the requested route.
- A blocked navigator is `display: none`, pointer-inert, and hidden from native
  accessibility while remaining React-mounted; ordinary queries cannot expose
  blocked content.

## Repository validation

- Full incremental TypeScript build: passed.
- Full mobile unit suite through change-class validation: passed.
- Full API unit suite under the sanctioned development database boundary:
  passed. A staging-context attempt was rejected before test execution by the
  local-database safety guard; the corrected Doppler `dev` run exited 0.
- i18n staleness, orphan-key, hardcoded-JSX-literal, and clinical-copy checks:
  passed.
- Teen-consent claims and GC1 mock-governance ratchets: passed.
- Test-only export ratchet: passed.
- Touched-file ESLint with `--max-warnings=0`: passed.
- Exact candidate Prettier check: passed.
- Git whitespace check: passed.

## Preview journey

A pre-WI-1556 preview Playwright run passed in 1.7 minutes and historically
caught the first Tabs-before-route navigation race. It began with the
pre-profile seed, persisted family intent, created the adult, selected Someone
else, answered that the learner has their own login, and reached the invitation
form without first writing a visibility/supportership link. Because it predates
the WI-1556 and latest-main merge-forwards, it is retained only as historical
diagnostic evidence. Final attributable E2E evidence must come from the
published exact head.

## Collision and flag audit

- Publication merge-forward uses authoritative `origin/main`
  `704112725285639810726a2aa0cb91a482c5b466`, which includes landed WI-2231
  PR #2704, WI-2399 PR #2722, WI-1556 PR #2727, WI-2639 PR #2730, WI-2820
  PR #2713, and WI-2790 PR #2733.
- The known create-profile overlap was reconciled without rebase or history
  rewrite. WI-2532 retains the durable non-authorizing fork and adopts WI-2231's
  current `handleCompleted` / `getPostAuthDefaultPath` completion behavior
  after successful initial or retry persistence.
- The app-layout/test tree was reconciled; a duplicate `mockPush` declaration
  surfaced by the textual merge was removed before the 143-test layout suite
  and 410-test union passed.
- The later WI-1556 merge was textually clean but exposed a semantic gate-order
  collision. A focused RED showed first-Mentor language confirmation rendering
  while the durable family-intent probe was still unresolved. The language
  gate now requires the probe to resolve absent; the focused case and the
  144-test layout suite pass.
- Independent exact-head review found a second WI-1556 ordering boundary after
  a restored `opening-invitation` marker moved into layout state. Focused RED
  observed invitation navigation while Tabs were absent. A strengthened
  post-push RED then received the language gate on `/link/initiate`. The
  handoff now stays pending until that route is observed, and the terminal
  route itself suppresses language gating through destination mount and marker
  consumption. The 145-test layout suite and 14-suite / 472-test semantic
  union pass.
- WI-2399's generation-bound create mutation, Back invalidation, retry, and
  stale-success rejection remain present and pass in the invitation-route
  suite.
- The zero-direct-overlap WI-2820/WI-2790 merge passed the mobile E2E test-seed
  helper plus its WI-2532 union (14 suites / 471 tests), API test-seed and filing
  unit coverage under the direct Orion Doppler `dev` boundary (3 suites / 204
  tests), and cleanup workflow/script coverage (2 suites / 25 tests).
- `scripts/run-api-integration.test.ts` remains 6/12 red on Orion because its
  fake Corepack executables are extensionless shebang files that Windows
  `spawnSync` does not resolve. The batch orchestrator dispositioned this as an
  occurrence of existing WI-2894 (Cosmo comment
  `3ae8bce9-1f7c-81c8-981f-001d933b970d`). The drive-letter no-op in
  `scripts/doppler-run.mjs` is an occurrence of canonical WI-2522, owned by
  BID-31 and excluded from BID-49 (Cosmo comment
  `3ae8bce9-1f7c-81be-9a00-001d596fb7ee`). Neither is changed on this branch;
  the intended API gate was rerun through
  `C:\Tools\doppler\doppler.exe run --project mentomate --config dev -- …` and
  passed 204 tests.
- Existing flags-off, V0, and V1 shell contracts are unchanged. Direct
  existing-account entry preserves the prior explicit unavailable state when
  V2 is off.
- Current Prettier collapses main's canonical four-line teen-consent checker
  chain during pre-commit. The final tree is restored transparently with a
  tracked temporary `.prettierignore` entry committed and then removed through
  normal hooks; zero-diff checks against `origin/main` cover both files.

## Review disposition

Every actionable publication-review comment was dispositioned in
`review-dispositions.md`. Accepted findings have focused RED-to-green evidence;
the two rejected suggestions are documented against the actual synchronous
handoff contract and the ruled scope boundary.
