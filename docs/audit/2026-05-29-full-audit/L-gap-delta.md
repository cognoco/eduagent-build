# L-gap-delta — Phase L gap analysis, GATE-1 FINALIZED (M/N/O input)

> Gate 1 closed 2026-06-09. Policy: **layered** (accepted defaults; atoms at coordinator leans). Every row now carries final `in_scope`, `interim_owner`, and `execution_blocking_if_deferred` (the N.0 input). 0 contested remaining. 183 findings.

## Final scope tally

| Disposition | Count |
|---|---|
| in-IF-scope (model obligation) | 49 |
| in-other-workstream | 125 |
| deferred | 9 |
| execution-blocking (N.0 pull-forward) | 10 |
| contested | 0 |

## Full delta table

| ID | Pri | in_scope | Owner (interim/target) | Blk | Verify | WS-cluster | Finding |
|---|---|---|---|---|---|---|---|
| F-096 | P0 | **yes** | billing-and-quotas | n | confirmed | architecture | Untested billing / quota / idempotency logic |
| F-121 | P0 | **yes** | billing-subscriptions | **Y** | confirmed | security-pii-api | Trial-expiry cron can downgrade a just-converted paying subscriber (missing status=… |
| F-122 | P0 | **yes** | security-pii-api | **Y** | confirmed | security-pii-api | Deletion cancellation/restoration checks are not atomic with final deletes |
| F-124 | P0 | **yes** | billing-subscriptions | n | confirmed | security-pii-api | Top-up credits permanently stranded after upgrading from a shared-pool tier to a pe… |
| F-003 | P1 | **yes** | architecture | n | confirmed | architecture | session-exchange.ts — structural epicenter on the LLM trust boundary (oversized, no… |
| F-004 | P1 | **yes** | architecture | n | confirmed | architecture | Runtime circular dependency: {settings, family-access, consent, notifications} 4-no… |
| F-005 | P1 | **yes** | architecture | n | confirmed | architecture | Inngest function registration array is a silent manual sync point (dispatch-but-nev… |
| F-020 | P1 | **yes** | security-pii-inngest | **Y** | confirmed | security-pii-inngest | recordChildCapNotificationForSubscription does not re-verify child belongs to subsc… |
| F-021 | P1 | **yes** | security-pii-api | n | confirmed | security-pii-api | Untrusted-data casts at trust boundaries — JWT, LLM providers, curriculum generatio… |
| F-025 | P1 | **yes** | errors-api | n | confirmed | errors-api | Out-of-range private_sources.factual_confidence (>1) rejects the ENTIRE LLM envelop… |
| F-073 | P1 | **yes** | security-pii-api | n | confirmed | security-pii-api | Raw learner session transcript placed into Inngest event payload (third-party persi… |
| F-083 | P1 | **yes** | security-pii-inngest | n | confirmed | security-pii-inngest | Minor's raw freeform 'ask' text placed in app/ask.classify_silently event payload |
| F-084 | P1 | **yes** | security-pii-inngest | n | confirmed | security-pii-inngest | Minor's raw topic-probe answer in app/topic-probe.requested event payload |
| F-095 | P1 | **yes** | security-pii-inngest | n | confirmed | security-pii-inngest | Minor's transcript in event payload — routes/filing.ts (prior-run HIGH site cited i… |
| F-117 | P1 | **yes** | security-pii-api | **Y** | confirmed | security-pii-api | Proxy-mode session write protection relies on a client-side redirect for non-metere… |
| F-118 | P1 | **yes** | security-pii-api | **Y** | confirmed | security-pii-api | Consent request can target arbitrary same-account profiles |
| F-144 | P1 | **yes** | security-pii-api | **Y** | confirmed | security-pii-api | Parent proxy sessions can mutate child progress state |
| F-145 | P1 | **yes** | security-pii-api | **Y** | confirmed | security-pii-api | Pronouns age gate fails open when profile birthYear is missing |
| F-152 | P1 | **yes** | security-pii-api | n | confirmed | security-pii-api | Dead childProfileId field in tellMentorInputSchema is a latent cross-profile IDOR f… |
| F-153 | P1 | **yes** | architecture | n | confirmed | architecture | Two different useRestoreConsent hooks with incompatible signatures |
| F-163 | P1 | **yes** | l10n-a11y-mobile | n | confirmed | l10n-a11y-mobile | Child-mode learning preferences screen previews the parent's accommodation, not the… |
| F-018 | P2 | **yes** | security-pii-inngest | n | confirmed | security-pii-inngest | session-completed-observe schema-drift path logs/captures the full raw event payloa… |
| F-019 | P2 | **yes** | security-pii-inngest | **Y** | confirmed | security-pii-inngest | freeform-filing retry transmits minor's transcript to external LLM without re-check… |
| F-023 | P2 | **yes** | security-pii-api | n | confirmed | security-pii-api | Unmetered LLM endpoint POST /sessions/:id/quick-check bypasses quota — evaluateQuic… |
| F-029 | P2 | **yes** | architecture | n | confirmed | architecture | Runtime cycle A: consent.ts ⇄ notifications.ts |
| F-032 | P2 | **yes** | architecture | n | confirmed | architecture | Manual sync points — route mount list, scoped-repo blocks, doc route count, languag… |
| F-074 | P2 | **yes** | security-pii-api | n | confirmed | security-pii-api | Truncated LLM output (derived from minor's session) shipped to Sentry as extra.rawS… |
| F-075 | P2 | **yes** | security-pii-inngest | n | confirmed | security-pii-inngest | Child's real display name memoized into Inngest step state (third-party persistence) |
| F-076 | P2 | **yes** | security-pii-api | n | confirmed | security-pii-api | Child's real first name sent to third-party LLM providers in every exchange |
| F-078 | P2 | **yes** | security-pii-api | n | confirmed | security-pii-api | RLS helper withProfileScope defined but never wired — scoped-repo is the only tenan… |
| F-085 | P2 | **yes** | security-pii-inngest | n | confirmed | security-pii-inngest | Child names, struggle topics, and parent email memoized in weekly-progress-push pre… |
| F-086 | P2 | **yes** | security-pii-inngest | n | confirmed | security-pii-inngest | Child display name and struggle topics memoized in monthly-report-cron generate step |
| F-087 | P2 | **yes** | security-pii-inngest | n | confirmed | security-pii-inngest | Child name and knowledge inventory memoized in progress-summary gather-context step… |
| F-088 | P2 | **yes** | security-pii-inngest | n | confirmed | security-pii-inngest | Minor's display name and birth year memoized in consent-revocation step state |
| F-089 | P2 | **yes** | security-pii-inngest | n | confirmed | security-pii-inngest | Minor's struggle topics round-trip through session-completed step state |
| F-092 | P2 | **yes** | security-pii-inngest | **Y** | confirmed | security-pii-inngest | monthlyReportGenerate trusts (parentId, childId) event pair without re-verifying fa… |
| F-093 | P2 | **yes** | security-pii-inngest | n | confirmed | security-pii-inngest | Consent-revocation delete branch lacks parent-chain account guard that archive bran… |
| F-097 | P2 | **yes** | architecture | n | confirmed | architecture | IDOR ownership check in orchestrate-round.ts has no regression test |
| F-125 | P2 | **yes** | security-pii-api | n | confirmed | security-pii-api | GET /account/deletion-status lacks the owner gate its three sibling routes enforce |
| F-126 | P2 | **yes** | security-pii-api | n | confirmed | security-pii-api | Library-filing write endpoints missing proxy-mode guard |
| F-130 | P2 | **yes** |  | - | confirmed | security-pii-api | Minimum-age enforcement uses birth year instead of full birth date |
| F-131 | P2 | **yes** | security-pii-api | n | confirmed | security-pii-api | Streaming extractor can show a different reply than the one parsed and persisted |
| F-133 | P2 | **yes** | security-pii-api | **Y** | confirmed | security-pii-api | Only 'SAFETY' block reason treated as safety filter; other Gemini block reasons tri… |
| F-134 | P2 | **yes** | security-pii-api | n | confirmed | security-pii-api | RevenueCat identity-sync race can cache another account's entitlement snapshot unde… |
| F-135 | P2 | **yes** | security-pii-api | n | confirmed | security-pii-api | Owner's top-up credit balance leaked to a child profile in quota-exceeded responses |
| F-136 | P2 | **yes** | security-pii-api | n | confirmed | security-pii-api | Read projector leaks raw LLM envelope (private_sources/signals) when reply is empty… |
| F-137 | P2 | **yes** | security-pii-api | n | confirmed | security-pii-api | Envelope key-allowlist fails open: unrecognized top-level key renders raw (leaks si… |
| F-140 | P2 | **yes** | security-pii-api | n | confirmed | security-pii-api | Raw learner subject input forwarded to Sentry in fallback catch block |
| F-141 | P2 | **yes** | security-pii-api | n | confirmed | security-pii-api | Preformatted learner context blocks appended to system prompt without enforced esca… |
| F-035 | P0 | no | secrets-hygiene | - | confirmed | agent-instructions | Plaintext Logfire secret-key pair embedded in .claude/settings.local.json |
| F-050 | P0 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Streamed tutor messages are never announced to screen-reader users (the core flow) |
| F-061 | P0 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Multiline <Text> children — 163 hardcoded English sentences/labels |
| F-062 | P0 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Auth screens render entirely in English |
| F-068 | P0 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Screen-reader users get silence in the most-used flow (streamed tutor replies) — co… |
| F-069 | P0 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | ~358 hardcoded English strings render English to every non-English locale — coordin… |
| F-120 | P0 | no | security-pii-api | - | confirmed | security-pii-api | Same-day dictations in the same mode overwrite each other |
| F-123 | P0 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Dormant web ChatShell still exposes voice controls bound to stale session handlers |
| F-001 | P1 | no | architecture | - | confirmed | architecture | Unbounded lifetime materialization of assessments/retention/vocabulary on hot read … |
| F-002 | P1 | no | infrastructure / database-performance | - | confirmed | architecture | Per-request Neon pool churn — cache path exists but disabled (latency + connection … |
| F-006 | P1 | no | backend-performance | - | confirmed | architecture | Fetch-all-then-filter-in-JS on hot read paths — Workers CPU + subrequest budget pre… |
| F-007 | P1 | no | architecture | - | confirmed | architecture | God components/files cluster — mobile session/shelf god screens + oversized session… |
| F-015 | P1 | no | errors-api | - | confirmed | errors-api | system-prompt/events/flag handlers throw raw Error('Session not found') → 500 + spu… |
| F-016 | P1 | no | errors-api | - | confirmed | errors-api | vocabulary review route catch-all misclassifies transient DB errors as 422 and echo… |
| F-017 | P1 | no | errors-api | - | confirmed | errors-api | jwt.ts JWKS response shape unvalidated — malformed upstream 200 misclassified as to… |
| F-022 | P1 | no | errors-api | - | confirmed | errors-api | Silent-failure catch blocks across billing/session/family — bare catch or empty ret… |
| F-026 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Mode-switch error row renders hardcoded English literals bypassing i18n |
| F-027 | P1 | no | security-pii-api | - | confirmed | security-pii-api | ThemedMarkdown renders LLM markdown with no onLinkPress / allowedImageHandlers — ar… |
| F-028 | P1 | no | security-pii-inngest | - | confirmed | security-pii-inngest | Minor's full session transcript memoized in step return state (auto-file-session, f… |
| F-036 | P1 | no | agent-infrastructure | - | confirmed | agent-instructions | autoMemoryDirectory points at a different filesystem tree than the live repo |
| F-037 | P1 | no | agent-instructions | - | confirmed | agent-instructions | CLAUDE.md and AGENTS.md diverge on skill paths and content beyond cosmetic differen… |
| F-051 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Quiz answer result (correct / wrong + revealed answer) is not announced |
| F-052 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Modals do not trap VoiceOver focus (`accessibilityViewIsModal` missing everywhere) |
| F-053 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Loading / busy states are not announced (systemic — 31 of 50 ActivityIndicator file… |
| F-054 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Confirmation toast is invisible to screen readers |
| F-063 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | `accessibilityLabel="…"` — 110 hardcoded English screen-reader strings |
| F-064 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | `platformAlert(...)` native dialogs — 25 hardcoded English title+body pairs |
| F-065 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Manual pluralization with hardcoded English words — 29 sites |
| F-066 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | `label=` / `title=` / `placeholder=` / `message=` literals outside auth — 60 sites |
| F-070 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | 0 of 13 modals use `accessibilityViewIsModal` — coordinator verified |
| F-119 | P1 | no | security-pii-api | - | confirmed | security-pii-api | Any @claude issue or comment can invoke a secret-backed agent |
| F-146 | P1 | no | security-pii-api | - | confirmed | security-pii-api | App-help early-return on /assessments/:id/answer consumes quota without an LLM call |
| F-147 | P1 | no | architecture | - | confirmed | architecture | HALF_OPEN probeInFlight can leak on the lazy streaming path and wedge a provider ci… |
| F-148 | P1 | no | security-pii-api | - | confirmed | security-pii-api | Outbox-spillover rate-limit rows silently consume the daily push-notification cap |
| F-149 | P1 | no | content / curriculum data quality | - | confirmed | architecture | Duplicate accepted-aliases where diacritic variants were flattened to ASCII |
| F-150 | P1 | no | architecture | - | confirmed | architecture | Redundant if/else in fallbackAnalysis — both branches identical (harmless dead code) |
| F-151 | P1 | no | ci-cd-hardening | - | confirmed | security-pii-api | Unreachable analyze-step branch contains a latent script-injection sink (base.ref i… |
| F-154 | P1 | no | security-pii-api | - | confirmed | security-pii-api | mobile-maestro (secret-bearing, executes checked-out code) gates only on a job outp… |
| F-155 | P1 | no | mobile-testing-infra | - | confirmed | security-pii-api | IS_E2E_BUILD gate omits the __DEV__ guard its sibling screen uses |
| F-156 | P1 | no | architecture | - | confirmed | architecture | GC1 mock guard misses multiline jest.mock calls |
| F-157 | P1 | no | platform-infra | - | confirmed | security-pii-api | Required 'smoke' status check is a structural no-op on every pull_request (always g… |
| F-158 | P1 | no | security-pii-api | - | confirmed | security-pii-api | Untrusted deep-link homeworkProblems JSON parsed without schema validation |
| F-159 | P1 | no | test-infrastructure | - | confirmed | security-pii-api | staleMs parsed without a finite-number guard, unlike its sibling screen |
| F-160 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Sample-lesson buttons can stay permanently disabled after returning to the screen (… |
| F-161 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Non-answer substring matching misclassifies substantive answers as non-answers (loc… |
| F-162 | P1 | no | security-pii-inngest | - | confirmed | security-pii-inngest | Self-reinvoke cursor advances past profiles that errored mid-run, silently skipping… |
| F-164 | P1 | no | security-pii-api | - | confirmed | security-pii-api | updateInterestsContext bumps the optimistic-concurrency version but never checks it… |
| F-165 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | masteryScore query param not guarded against NaN (incomplete sweep of BUG-813 fix) |
| F-166 | P1 | no | security-pii-api | - | confirmed | security-pii-api | Missing UUID validation on subjectId path param causes unhandled 500s on malformed … |
| F-167 | P1 | no | security-pii-api | - | confirmed | security-pii-api | Non-transactional regenerate: ownership-check -> delete-all -> insert can race a co… |
| F-168 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | subjectId route param not normalized for array case (inconsistent with sibling scre… |
| F-169 | P1 | no | learning-engine | - | confirmed | security-pii-api | Lost-update race in reviewVocabulary SM-2 read-compute-write (transaction does not … |
| F-170 | P1 | no | mobile-cache-data-fetching | - | confirmed | security-pii-api | Pending celebration writes can still lose concurrent updates |
| F-171 | P1 | no | reliability-and-correctness | - | confirmed | security-pii-api | Lost-update race in celebration writes: read happens outside the SELECT FOR UPDATE … |
| F-172 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Recall-test submit and 'don't remember' use independent in-flight guards, allowing … |
| F-173 | P1 | no | billing-subscriptions | - | confirmed | security-pii-api | downgradeQuotaPool can reset an upgraded account's quota pool to free limits (day-2… |
| F-174 | P1 | no | security-pii-inngest | - | confirmed | security-pii-inngest | LLM recall-quality grade computed before cooldown claim, allowing wasted paid LLM c… |
| F-175 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Impure side effect (sessionStorage write) executed unconditionally during render |
| F-176 | P1 | no | navigation/audience-matrix | - | confirmed | security-pii-api | Proxy mode not cleared when saved profile is removed server-side (sticky contradict… |
| F-177 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | localDate computed in UTC (toISOString) despite name/intent of device-local date |
| F-178 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Quiz-history date grouping/labeling mixes UTC and local time bases (off-by-one labe… |
| F-179 | P1 | no | security-pii-api | - | confirmed | security-pii-api | Server-side grading input answerGiven has no maximum length before O(m*n) Levenshte… |
| F-180 | P1 | no | security-pii-api | - | confirmed | security-pii-api | Uncapped chunks/chunksWithPunctuation arrays in dictation review input DTO |
| F-181 | P1 | no | security-pii-api | - | confirmed | security-pii-api | Unauthenticated forced JWKS re-fetch with no negative cache or cooldown (DoS amplif… |
| INV-1 | P1 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Hardcoded user-visible JSX strings bypass i18n (no automated guard) |
| F-009 | P2 | no | architecture | - | confirmed | architecture | metering.ts filename collision between services/metering.ts (quota math) and servic… |
| F-010 | P2 | no | architecture | - | confirmed | architecture | Half-migrated billing domain — four flat files never moved into billing/ or made fa… |
| F-011 | P2 | no | architecture | - | confirmed | architecture | Runtime cycle: curriculum.ts ⇄ language-curriculum.ts (back-dispatch smell) |
| F-012 | P2 | no | architecture | - | confirmed | architecture | architecture.md warns of a non-existent database→schemas circular dependency (all e… |
| F-014 | P2 | no | architecture | - | confirmed | architecture | test-seed.ts size (5,668 LOC) and production-bundle inclusion risk |
| F-024 | P2 | no | security-pii-api | - | confirmed | security-pii-api | id-token:write granted to Claude review/agent jobs with no OIDC exchange step (unne… |
| F-030 | P2 | no | architecture | - | confirmed | architecture | Type-only cycles (compile-erased) — exchanges ⇄ exchange-prompts |
| F-031 | P2 | no | architecture | - | confirmed | architecture | Other oversized files — navigation and conflict hotspots across API and mobile |
| F-034 | P2 | no | architecture | - | confirmed | architecture | Type-only layer inversions — services/lib reaching upward into middleware/components |
| F-038 | P2 | no | agent-instructions | - | confirmed | agent-instructions | Skill description: fields for code-review and thermo-nuclear-code-quality-review vi… |
| F-039 | P2 | no | agent-instructions | - | confirmed | agent-instructions | Generated commit skill description is a workflow summary violating trigger-only rul… |
| F-040 | P2 | no | agent-instructions | - | confirmed | agent-instructions | worktree-setup skill description embeds workflow narration after valid trigger open… |
| F-041 | P2 | no | agent-instructions | - | confirmed | agent-instructions | Stale / imprecise source citations in CLAUDE.md profile-shape section |
| F-042 | P2 | no | agent-instructions | - | confirmed | agent-instructions | scope-keyword-check.sh hook references a non-existent skill and is trivially bypass… |
| F-045 | P2 | no | agent-instructions | - | confirmed | agent-instructions | CLAUDE.md is 333 lines and mixes constitution-level rules with command cookbooks, d… |
| F-046 | P2 | no | agent-instructions | - | confirmed | agent-instructions | sync-skills.mjs is additive-only; removed master leaves orphaned generated copy tha… |
| F-047 | P2 | no | errors-api | - | confirmed | errors-api | Silent swallow of DB failure when fetching dictation struggles — bare catch {} with… |
| F-048 | P2 | no | errors-api | - | confirmed | errors-api | Consent resend-counter rollback failure swallowed without logging — inconsistent wi… |
| F-049 | P2 | no | errors-api | - | confirmed | errors-api | Signature-verification catch discards underlying error detail — Stripe and Resend w… |
| F-055 | P2 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Form inputs lack `accessibilityLabel`; visible labels are detached siblings |
| F-056 | P2 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Decorative animations not hidden from screen readers (noise) |
| F-057 | P2 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Tappables with text children but no `accessibilityRole="button"` |
| F-058 | P2 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Escalation / verification badges convey state with color + tiny text but no role |
| F-059 | P2 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Decorative leading icons inside labeled banners not hidden |
| F-060 | P2 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | Tiny 10px text in a few badges/labels |
| F-067 | P2 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | `toLocaleDateString('en-US', …)` — date hardcoded to US locale (4 sites) |
| F-071 | P2 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | 29 manual-pluralization sites — doubly broken: hardcoded English and binary plural … |
| F-072 | P2 | no | l10n-a11y-mobile | - | confirmed | l10n-a11y-mobile | 4 `toLocaleDateString('en-US', …)` hardcodes — coordinator summary |
| F-077 | P2 | no | security-pii-api | - | confirmed | security-pii-api | Raw console.debug in service bypasses structured logger |
| F-079 | P2 | no | security-pii-api | - | confirmed | security-pii-api | SET LOCAL GUC built via sql.raw with string interpolation — mitigated but fragile |
| F-080 | P2 | no | security-pii-api | - | confirmed | security-pii-api | CORS reflects any localhost/127.0.0.1 origin with credentials:true in all environme… |
| F-081 | P2 | no | security-pii-api | - | confirmed | security-pii-api | X-Maintenance-Secret and X-Test-Secret must not land in query strings (informationa… |
| F-082 | P2 | no | security-pii-api | - | confirmed | security-pii-api | Test routes reachable without secret in development environment (by-design, informa… |
| F-090 | P2 | no | security-pii-inngest | - | confirmed | security-pii-inngest | User feedback free-text and support email in app/feedback.delivery_failed event pay… |
| F-091 | P2 | no | security-pii-inngest | - | confirmed | security-pii-inngest | Inferred learner signals memoized in topic-probe-extract extract-signals step |
| F-094 | P2 | no | security-pii-inngest | - | confirmed | security-pii-inngest | Env bindings stored in module-level singletons may bleed across concurrent function… |
| F-098 | P2 | no | architecture | - | confirmed | architecture | isClosePathAutoFileEligible guard in session-filing-dispatch.ts has no regression t… |
| F-099 | P2 | no | architecture | - | confirmed | architecture | Retention cutoff math in webhook-idempotency-purge.ts (BUG-672) has no regression t… |
| F-127 | P2 | no | security-pii-api | - | confirmed | security-pii-api | issues:write granted at workflow scope leaks to every deploy job that does not need… |
| F-128 | P2 | no | security-pii-api | - | confirmed | security-pii-api | Homework summary LLM call can run without quota |
| F-129 | P2 | no | security-pii-api | - | confirmed | security-pii-api | PR title/author/base interpolated into inline prompt without untrusted-data framing |
| F-132 | P2 | no | security-pii-api | - | confirmed | security-pii-api | Review gate parses an unauthenticated PR comment as the source of truth — verdict i… |
| F-138 | P2 | no | security-pii-api | - | confirmed | security-pii-api | Clerk session/JWT tokens persisted to web localStorage via secure-storage fallback |
| F-139 | P2 | no | security-pii-api | - | confirmed | security-pii-api | Learner-controlled library context interpolated into LLM system prompt without data… |
| F-142 | P2 | no | security-pii-api | - | confirmed | security-pii-api | Unbounded attempt accumulation and unbounded answerGiven on /quiz/rounds/:id/check … |
| F-143 | P2 | no | security-pii-api | - | confirmed | security-pii-api | Hardcoded default password used as fallback for seed-created Clerk users |
| INV-2 | P2 | no | architecture | - | confirmed | architecture | Internal jest.mock() backlog (GC6 burn-down class) |
| F-103 | unknown | no | architecture | - | confirmed | architecture | Challenge Round mastery decision smeared across four modules |
| F-104 | unknown | no | architecture | - | confirmed | architecture | session.completed dispatch stranded in the route, gated three ways (confirmed by tw… |
| F-105 | unknown | no | architecture | - | confirmed | architecture | Retry-filing duplicated across two handlers — cap already drifted (live bug, confir… |
| F-106 | unknown | no | architecture | - | confirmed | architecture | Profile-context resolution — leaky seam repeated ~20 times |
| F-107 | unknown | no | architecture | - | confirmed | architecture | loadTopicTitle defined twice with divergent ownership joins — cross-profile data le… |
| F-108 | unknown | no | architecture | - | confirmed | architecture | V0/V1 entry-gating copy-pasted across 8 screen layouts + progress |
| F-109 | unknown | no | architecture | - | confirmed | architecture | Home surface chosen in two places, kept correct only by a magic prop |
| F-110 | unknown | no | errors-api | - | confirmed | errors-api | Error classification bypassed in 6 screens — violates UX-Resilience rule |
| F-111 | unknown | no | architecture | - | confirmed | architecture | SSE stream route owns the quota-refund policy in five places |
| F-112 | unknown | no | architecture | - | confirmed | architecture | createScopedRepository vs parent-chain joins — two adapters for one concern (revisi… |
| F-113 | unknown | no | agent-instructions | - | confirmed | agent-instructions | No repo-local skill enforcing @eduagent/schemas as the API-facing type source and t… |
| F-114 | unknown | no | agent-instructions | - | confirmed | agent-instructions | No repo-local skill covering Drizzle/Neon scoping rules, profileId safety, migratio… |
| F-116 | unknown | no | platform-security / ci-cd-hardening | - | confirmed | agent-instructions | No repo-local skill covering GitHub Actions security checklist (SHA pinning, pull_r… |
| F-008 | P2 | no | architecture | - | confirmed | architecture | @eduagent/schemas flat-barrel extreme fan-in (~378–497 consumers, no sub-package bl… |
| F-013 | P2 | no |  | - | confirmed | architecture | Permissive @nx/enforce-module-boundaries — package direction is review-enforced, no… |
| F-033 | P2 | no |  | - | confirmed | architecture | Ad-hoc error envelopes and missing service-folder graduation rule |
| F-043 | P2 | no |  | - | confirmed | agent-instructions | .deepsec/AGENTS.md instructs agents to follow arbitrary per-project SETUP.md — indi… |
| F-044 | P2 | no |  | - | confirmed | agent-instructions | CLAUDE.md forbids /my:commit-old and /zdx:commit but both remain installed and invo… |
| F-100 | P2 | no | architecture | - | confirmed | architecture | BUG-731 SQL cast in session-analytics.ts has no test for future event-type triggeri… |
| F-101 | P2 | no |  | - | confirmed | architecture | Mobile giant screens enumerated but not responsibility-analyzed (shelf, camera, sig… |
| F-102 | P2 | no |  | - | confirmed | architecture | Documentation / LLM-friendliness gap: JSDoc coverage ~46% on service exports |
| F-115 | unknown | no |  | - | confirmed | agent-instructions | No repo-local skill encoding i18n key hygiene rules, JSX literal ratchet policy, an… |
