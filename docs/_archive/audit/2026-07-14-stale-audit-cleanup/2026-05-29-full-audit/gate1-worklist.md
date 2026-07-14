# Gate-1 worklist — layered policy applied

> Generated 2026-06-09. Policy: **layered** — `in_scope=true` = the rewrite must satisfy the invariant *by construction* (an acceptance criterion on a rewrite work package), AND the live defect is routed to its `interim owner` to patch now; `Blk` = execution-blocking-if-deferred (feeds N.0). 85 scope-disputed rows.

## How to use this

- **Auto-IN** and **Auto-OUT** need no decision — apply as shown.
- **4 cluster sub-decisions** each swing a whole batch: rule the cluster once.
- **Atoms** need an individual eye (my lean shown).

## Resulting scope range

- **Floor (all 4 clusters ruled OUT):** ~17 in-IF model obligations (core invariants + IN-atoms).
- **Layered default (all clusters IN):** ~48 in-IF model obligations.
- Reminder: an in-IF count of ~50 is **acceptance criteria on the rewrite**, not 50 new tasks; each also has an interim patch routed to its workstream.

## Execution-blocking (N.0 pull-forward candidates) — 10

Live/urgent defects to patch now regardless of the rewrite:

| ID | Pri | Call | Interim owner | Blk | Finding — basis |
|---|---|---|---|---|---|
| F-118 | P1 | IN | security-pii-api | Y | Consent request can target arbitrary same-account profiles — consent-authority (ADR-0015) — live IDOR |
| F-117 | P1 | IN | security-pii-api | Y | Proxy-mode session write protection relies on a client-side redirect for non-m — proxy write authority (ADR-0008 operate/view) |
| F-122 | P0 | IN | security-pii-api | Y | Deletion cancellation/restoration checks are not atomic with final deletes — deletion atomicity (data-model §6.1, inv 21) |
| F-144 | P1 | IN | security-pii-api | Y | Parent proxy sessions can mutate child progress state — proxy mutates child progress (ADR-0008, inv 7/8) |
| F-145 | P1 | IN | security-pii-api | Y | Pronouns age gate fails open when profile birthYear is missing — age-gate fail-open (prd central-gate, C-1, inv 29/30) |
| F-020 | P1 | IN | security-pii-inngest | Y | recordChildCapNotificationForSubscription does not re-verify child belongs to  — cross-account minor-name leak (ontology inv 8/9) |
| F-092 | P2 | IN | security-pii-inngest | Y | monthlyReportGenerate trusts (parentId, childId) event pair without re-verifyi — child report to wrong parent (ADR-0008 call-site discipline) |
| F-019 | P2 | IN | security-pii-inngest | Y | freeform-filing retry transmits minor's transcript to external LLM without re- — freeform-filing skips GDPR consent check (missing guard = C-1 deliverable) |
| F-121 | P0 | IN | billing-subscriptions | Y | Trial-expiry cron can downgrade a just-converted paying subscriber (missing st — trial-expiry downgrades paid subscriber (ADR-0002 store-delegation) |
| F-133 | P2 | IN | security-pii-api | Y | Only 'SAFETY' block reason treated as safety filter; other Gemini block reason — policy-blocked Gemini fails over to other provider (ADR-0014 §4 fail-closed) |

## Auto-IN — core identity invariants (13, no decision)

| ID | Pri | Call | Interim owner | Blk | Finding — basis |
|---|---|---|---|---|---|
| F-118 | P1 | IN | security-pii-api | Y | Consent request can target arbitrary same-account profiles — consent-authority (ADR-0015) — live IDOR |
| F-093 | P2 | IN | security-pii-inngest | N | Consent-revocation delete branch lacks parent-chain account guard that archive — account-isolation on consent delete (ADR-0001, data-model §6.1) |
| F-117 | P1 | IN | security-pii-api | Y | Proxy-mode session write protection relies on a client-side redirect for non-m — proxy write authority (ADR-0008 operate/view) |
| F-122 | P0 | IN | security-pii-api | Y | Deletion cancellation/restoration checks are not atomic with final deletes — deletion atomicity (data-model §6.1, inv 21) |
| F-144 | P1 | IN | security-pii-api | Y | Parent proxy sessions can mutate child progress state — proxy mutates child progress (ADR-0008, inv 7/8) |
| F-145 | P1 | IN | security-pii-api | Y | Pronouns age gate fails open when profile birthYear is missing — age-gate fail-open (prd central-gate, C-1, inv 29/30) |
| F-020 | P1 | IN | security-pii-inngest | Y | recordChildCapNotificationForSubscription does not re-verify child belongs to  — cross-account minor-name leak (ontology inv 8/9) |
| F-092 | P2 | IN | security-pii-inngest | Y | monthlyReportGenerate trusts (parentId, childId) event pair without re-verifyi — child report to wrong parent (ADR-0008 call-site discipline) |
| F-125 | P2 | IN | security-pii-api | N | GET /account/deletion-status lacks the owner gate its three sibling routes enf — deletion-status missing owner gate (domain inv 8) |
| F-126 | P2 | IN | security-pii-api | N | Library-filing write endpoints missing proxy-mode guard — library-filing missing proxy guard (ADR-0007 proxy root-cause) |
| F-163 | P1 | IN | l10n-a11y-mobile | N | Child-mode learning preferences screen previews the parent's accommodation, no — child sees parent accommodation (ADR-0008 view self-fallback) |
| F-152 | P1 | IN | security-pii-api | N | Dead childProfileId field in tellMentorInputSchema is a latent cross-profile I — latent cross-profile IDOR field (ADR-0007 edge-derived write) |
| F-097 | P2 | IN | architecture | N | IDOR ownership check in orchestrate-round.ts has no regression test — untested IDOR ownership check (data-model §5.1 person-scope) |

## Auto-OUT — orthogonal to identity (21, no decision)

| ID | Pri | Call | Interim owner | Blk | Finding — basis |
|---|---|---|---|---|---|
| F-106 | unknown | OUT | architecture | - | Profile-context resolution — leaky seam repeated ~20 times — profile-context accessor refactor — refuter HIGH: word-collision, conv_language not in canon |
| F-176 | P1 | OUT | navigation/audience-matrix | - | Proxy mode not cleared when saved profile is removed server-side (sticky contr — client proxy-flag sticky UI — refuter HIGH: cited ADRs silent, not a write |
| F-036 | P1 | OUT | agent-infrastructure | - | autoMemoryDirectory points at a different filesystem tree than the live repo — autoMemoryDirectory path — agent tooling |
| F-037 | P1 | OUT | agent-instructions | - | CLAUDE.md and AGENTS.md diverge on skill paths and content beyond cosmetic dif — CLAUDE/AGENTS divergence — ADR-0000 repo-wide, not IF |
| F-041 | P2 | OUT | agent-instructions | - | Stale / imprecise source citations in CLAUDE.md profile-shape section — stale CLAUDE.md citations — doc rot |
| F-113 | unknown | OUT | agent-instructions | - | No repo-local skill enforcing @eduagent/schemas as the API-facing type source  — agent-instructions (cluster-defaulted, not read) |
| F-114 | unknown | OUT | agent-instructions | - | No repo-local skill covering Drizzle/Neon scoping rules, profileId safety, mig — agent-instructions (cluster-defaulted, not read) |
| F-006 | P1 | OUT | backend-performance | - | Fetch-all-then-filter-in-JS on hot read paths — Workers CPU + subrequest budge — fetch-all-filter perf — owning column ≠ owning query-shape |
| F-110 | unknown | OUT | errors-api | - | Error classification bypassed in 6 screens — violates UX-Resilience rule — errors-api (cluster-defaulted, not read) |
| F-026 | P1 | OUT | l10n-a11y-mobile | - | Mode-switch error row renders hardcoded English literals bypassing i18n — mode-switch row i18n — translation mechanism |
| F-055 | P2 | OUT | l10n-a11y-mobile | - | Form inputs lack `accessibilityLabel`; visible labels are detached siblings — form-input a11y labels — WCAG not an IF invariant |
| F-061 | P0 | OUT | l10n-a11y-mobile | - | Multiline <Text> children — 163 hardcoded English sentences/labels — 163 hardcoded strings — i18n mechanism (consent-copy subset is a separate concern) |
| F-175 | P1 | OUT | l10n-a11y-mobile | - | Impure side effect (sessionStorage write) executed unconditionally during rend — render-purity sessionStorage write — mobile eng |
| INV-1 | P1 | OUT | l10n-a11y-mobile | - | Hardcoded user-visible JSX strings bypass i18n (no automated guard) — 960 hardcoded JSX strings — i18n mechanism |
| F-015 | P1 | OUT | errors-api | - | system-prompt/events/flag handlers throw raw Error('Session not found') → 500  — raw Error 500-vs-404 — shared error pattern |
| F-048 | P2 | OUT | errors-api | - | Consent resend-counter rollback failure swallowed without logging — inconsiste — consent rollback swallowed — refuter LOW, catch-discipline |
| F-120 | P0 | OUT | security-pii-api | - | Same-day dictations in the same mode overwrite each other — same-day dictation overwrite — refuter concedes orthogonal upsert bug |
| F-157 | P1 | OUT | platform-infra | - | Required 'smoke' status check is a structural no-op on every pull_request (alw — smoke check no-op — CI config |
| F-166 | P1 | OUT | security-pii-api | - | Missing UUID validation on subjectId path param causes unhandled 500s on malfo — UUID validation on curriculum param — refuter agrees not IF |
| F-162 | P1 | OUT | security-pii-inngest | - | Self-reinvoke cursor advances past profiles that errored mid-run, silently ski — backfill cursor skips errored — ADR-0009 names a different sweep |
| INV-2 | P2 | OUT | architecture | - | Internal jest.mock() backlog (GC6 burn-down class) — jest.mock backlog — test hygiene |

## Sub-decision A — Minor-PII to third party (15 rows)

**Question:** Does the compliance register (C-1/C-3/C-4 — a canonical-set member) govern *server-side* data flows (Inngest payloads, Sentry, LLM prompts), or only the *guardian-visible schema*? Layered-default = IN (it is ratified canon).

| ID | Pri | Call | Interim owner | Blk | Finding — basis |
|---|---|---|---|---|---|
| F-073 | P1 | IN | security-pii-api | N | Raw learner session transcript placed into Inngest event payload (third-party  — raw transcript in Inngest payload |
| F-074 | P2 | IN | security-pii-api | N | Truncated LLM output (derived from minor's session) shipped to Sentry as extra — minor LLM output to Sentry |
| F-076 | P2 | IN | security-pii-api | N | Child's real first name sent to third-party LLM providers in every exchange — child name to LLM providers (DPA/notice) |
| F-140 | P2 | IN | security-pii-api | N | Raw learner subject input forwarded to Sentry in fallback catch block — raw learner input to Sentry |
| F-018 | P2 | IN | security-pii-inngest | N | session-completed-observe schema-drift path logs/captures the full raw event p — raw payload logged on schema-drift path |
| F-019 | P2 | IN | security-pii-inngest | Y | freeform-filing retry transmits minor's transcript to external LLM without re- — freeform-filing skips GDPR consent check (missing guard = C-1 deliverable) |
| F-075 | P2 | IN | security-pii-inngest | N | Child's real display name memoized into Inngest step state (third-party persis — child name in Inngest step state |
| F-083 | P1 | IN | security-pii-inngest | N | Minor's raw freeform 'ask' text placed in app/ask.classify_silently event payl — minor 'ask' text in event payload |
| F-084 | P1 | IN | security-pii-inngest | N | Minor's raw topic-probe answer in app/topic-probe.requested event payload — minor topic-probe answer in payload |
| F-085 | P2 | IN | security-pii-inngest | N | Child names, struggle topics, and parent email memoized in weekly-progress-pus — child names/topics/parent-email in step state |
| F-086 | P2 | IN | security-pii-inngest | N | Child display name and struggle topics memoized in monthly-report-cron generat — child name/topics in monthly-report step |
| F-087 | P2 | IN | security-pii-inngest | N | Child name and knowledge inventory memoized in progress-summary gather-context — child name/inventory in progress-summary step |
| F-088 | P2 | IN | security-pii-inngest | N | Minor's display name and birth year memoized in consent-revocation step state — minor name/birthYear in consent-revocation step |
| F-089 | P2 | IN | security-pii-inngest | N | Minor's struggle topics round-trip through session-completed step state — struggle topics in session-completed step |
| F-095 | P1 | IN | security-pii-inngest | N | Minor's transcript in event payload — routes/filing.ts (prior-run HIGH site ci — transcript in filing.ts event payload |

## Sub-decision B — Billing / payer / quota integrity (5 rows)

**Question:** Does IF own subscription/quota *data integrity* (ADR-0002 payer + data-model org=quota-anchor), or only *who the payer is*? Layered-default = IN.

| ID | Pri | Call | Interim owner | Blk | Finding — basis |
|---|---|---|---|---|---|
| F-096 | P0 | IN | billing-and-quotas | N | Untested billing / quota / idempotency logic — untested billing/quota/idempotency (payer model coherence) |
| F-121 | P0 | IN | billing-subscriptions | Y | Trial-expiry cron can downgrade a just-converted paying subscriber (missing st — trial-expiry downgrades paid subscriber (ADR-0002 store-delegation) |
| F-124 | P0 | IN | billing-subscriptions | N | Top-up credits permanently stranded after upgrading from a shared-pool tier to — top-up credits stranded on tier change (ADR-0002 no-silent-recovery) |
| F-134 | P2 | IN | security-pii-api | N | RevenueCat identity-sync race can cache another account's entitlement snapshot — RevenueCat race leaks entitlement cross-account (ADR-0001/0002) |
| F-135 | P2 | IN | security-pii-api | N | Owner's top-up credit balance leaked to a child profile in quota-exceeded resp — owner credit balance leaked to child (ADR-0015 data-access) |

## Sub-decision C — LLM envelope / router correctness (6 rows)

**Question:** Does IF own envelope/router *correctness* (ADR-0016 envelope-integrity-as-age-safety, ADR-0014 fail-closed), or only its *safety semantics*? Layered-default = IN.

| ID | Pri | Call | Interim owner | Blk | Finding — basis |
|---|---|---|---|---|---|
| F-025 | P1 | IN | errors-api | N | Out-of-range private_sources.factual_confidence (>1) rejects the ENTIRE LLM en — envelope hard-fails on out-of-range field (ADR-0016 integrity) |
| F-131 | P2 | IN | security-pii-api | N | Streaming extractor can show a different reply than the one parsed and persist — streamed reply diverges from persisted (ADR-0016 integrity) |
| F-133 | P2 | IN | security-pii-api | Y | Only 'SAFETY' block reason treated as safety filter; other Gemini block reason — policy-blocked Gemini fails over to other provider (ADR-0014 §4 fail-closed) |
| F-136 | P2 | IN | security-pii-api | N | Read projector leaks raw LLM envelope (private_sources/signals) when reply is  — projector leaks raw envelope on empty reply (ADR-0016) |
| F-137 | P2 | IN | security-pii-api | N | Envelope key-allowlist fails open: unrecognized top-level key renders raw (lea — envelope allowlist fails open (ADR-0016) |
| F-141 | P2 | IN | security-pii-api | N | Preformatted learner context blocks appended to system prompt without enforced — unescaped learner text into system prompt (ADR-0016 preamble safety) |

## Sub-decision D — Module structure of IF-owned services (14 rows)

**Question:** Does IF own *decomposition* of the services its rewrite touches (consent.ts, family-access.ts, router.ts, session-exchange.ts), or only *create the new seams* (leaving legacy hygiene to architecture)? Layered-default = mixed (IN where the rewrite carves it).

| ID | Pri | Call | Interim owner | Blk | Finding — basis |
|---|---|---|---|---|---|
| F-003 | P1 | IN | architecture | N | session-exchange.ts — structural epicenter on the LLM trust boundary (oversize — session-exchange.ts — rewrite carves router/spine/judge slices (ADR-0013/14/16) |
| F-004 | P1 | IN | architecture | N | Runtime circular dependency: {settings, family-access, consent, notifications} — consent/settings/family SCC — fuses inv 22 three-layer authority |
| F-005 | P1 | IN | architecture | N | Inngest function registration array is a silent manual sync point (dispatch-bu — Inngest registration silent-sync (ADR-0009 wired-but-untriggered) |
| F-029 | P2 | IN | architecture | N | Runtime cycle A: consent.ts ⇄ notifications.ts — consent⇄notifications cycle (binding symbol = GDPR gate) |
| F-030 | P2 | OUT | architecture | - | Type-only cycles (compile-erased) — exchanges ⇄ exchange-prompts — exchanges⇄prompts type-only cycle — compile-erased hygiene |
| F-031 | P2 | OUT | architecture | - | Other oversized files — navigation and conflict hotspots across API and mobile — router.ts oversized — ADR-0014 seam is vetting/routing not provider/stream |
| F-032 | P2 | IN | architecture | N | Manual sync points — route mount list, scoped-repo blocks, doc route count, la — scoped-repo per-table profile_id (data-model §5.1) — split from bundle |
| F-034 | P2 | OUT | architecture | - | Type-only layer inversions — services/lib reaching upward into middleware/comp — ProfileMeta layer inversion — LOW, compile-time only |
| F-103 | unknown | OUT | architecture | - | Challenge Round mastery decision smeared across four modules — architecture-deepening (cluster-defaulted, not individually read) |
| F-107 | unknown | OUT | architecture | - | loadTopicTitle defined twice with divergent ownership joins — cross-profile da — architecture-deepening (cluster-defaulted, not individually read) |
| F-108 | unknown | OUT | architecture | - | V0/V1 entry-gating copy-pasted across 8 screen layouts + progress — architecture-deepening (cluster-defaulted, not individually read) |
| F-109 | unknown | OUT | architecture | - | Home surface chosen in two places, kept correct only by a magic prop — architecture-deepening (cluster-defaulted, not individually read) |
| F-111 | unknown | OUT | architecture | - | SSE stream route owns the quota-refund policy in five places — architecture-deepening (cluster-defaulted, not individually read) |
| F-112 | unknown | OUT | architecture | - | createScopedRepository vs parent-chain joins — two adapters for one concern (r — architecture-deepening (cluster-defaulted, not individually read) |

## Atoms — individual hand-ruling (11)

| ID | Pri | Call | Interim owner | Blk | Finding — basis |
|---|---|---|---|---|---|
| F-153 | P1 | IN | architecture | N | Two different useRestoreConsent hooks with incompatible signatures — lean IN: consent-restore contract divergence (consentActionResultSchema) |
| F-017 | P1 | OUT | errors-api | - | jwt.ts JWKS response shape unvalidated — malformed upstream 200 misclassified  — lean OUT: ADR-0001 names the seam but JWKS parsing-quality is impl |
| F-181 | P1 | OUT | security-pii-api | - | Unauthenticated forced JWKS re-fetch with no negative cache or cooldown (DoS a — lean OUT: same JWKS seam as F-017; DoS-cache is impl |
| F-022 | P1 | OUT | errors-api | - | Silent-failure catch blocks across billing/session/family — bare catch or empt — BUNDLE: split — family-downgrade sub-item IN, catch-discipline OUT |
| F-021 | P1 | IN | security-pii-api | N | Untrusted-data casts at trust boundaries — JWT, LLM providers, curriculum gene — BUNDLE: split — JWT-claims slice IN (ADR-0001 age/consent transport), LLM/curriculum casts OUT |
| F-023 | P2 | IN | security-pii-api | N | Unmetered LLM endpoint POST /sessions/:id/quick-check bypasses quota — evaluat — lean IN: unmetered route also skips proxy-guard (guardian act-for, prd:311) |
| F-027 | P1 | OUT | security-pii-api | - | ThemedMarkdown renders LLM markdown with no onLinkPress / allowedImageHandlers — lean OUT: disclosure-class is compliance but fix is mobile render-hardening |
| F-078 | P2 | IN | security-pii-api | N | RLS helper withProfileScope defined but never wired — scoped-repo is the only  — lean IN: falsifies IF RLS two-layer contract (architecture.md:135, ADR-0011 T3 Phase-F) |
| F-082 | P2 | OUT | security-pii-api | - | Test routes reachable without secret in development environment (by-design, in — lean OUT: dev config posture; flag compliance cross-ref (enumerates child PII) |
| F-138 | P2 | OUT | security-pii-api | - | Clerk session/JWT tokens persisted to web localStorage via secure-storage fall — lean OUT: ADR-0001 seam but client token-storage hygiene |
| F-164 | P1 | OUT | security-pii-api | - | updateInterestsContext bumps the optimistic-concurrency version but never chec — UNVERIFIABLE: finding not findable in repo/corpus — confirm it exists first |
