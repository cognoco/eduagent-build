# Category-Specific Retention & Deletion Schedule — DRAFT

> **DRAFT — codebase-grounded inventory 2026-07-26; periods marked `PROPOSED` are
> suggestions requiring management decision; `TODO` = unknown.**

**Feeds:** DPO Action 6 (category-specific retention schedule) —
[`DPO exchanges/2026-07-26-action-register-tracker.md`](../DPO%20exchanges/2026-07-26-action-register-tracker.md)
row 6: *"Full category schedule (raw/derived/embeddings/consent evidence/logs/
backups/provider copies); deletion-propagation test evidence."* Existing
artifacts this draft consolidates and extends:
[`2026-07-17-consent-withdrawal-bearer-token-threat-posture.md`](../2026-07-17-consent-withdrawal-bearer-token-threat-posture.md),
[`docs/runbooks/deletion-irreversible-boundary.md`](../../runbooks/deletion-irreversible-boundary.md),
[`docs/runbooks/neon-pitr-identity-recovery.md`](../../runbooks/neon-pitr-identity-recovery.md),
[`docs/runbooks/retention-slo-alerts.md`](../../runbooks/retention-slo-alerts.md),
[`ropa.md`](../ropa.md), and the superseded
[`history/2026-06-07-data-retention-and-erasure-audit.md`](../history/2026-06-07-data-retention-and-erasure-audit.md)
(pre-identity-cutover; table names there are legacy `accounts`/`profiles`,
now dropped — do not cite it as current schema).

**Method:** direct read of `packages/database/src/schema/*.ts` (Drizzle
schema, the identity-v2 model — `person`/`organization`/`login` replaced the
legacy `accounts`/`profiles`/`family_links`, dropped on staging/production
2026-06-28 per `ropa.md`), the Inngest functions in
`apps/api/src/inngest/functions/`, the account/retention routes, and one live
Doppler production-config check (`RETENTION_PURGE_ENABLED`, verified
2026-07-26 — see §3). Every claim below carries a `file:line` citation or is
explicitly marked `TODO`/`PROPOSED`. Nothing here was inferred from
docstrings, commit messages, or memory without a direct code read.

**Controller:** ZWIZZLY AS (org.nr 811696072) per `ropa.md`.

---

## 0. How to read this document

- **Category rows** (§2) answer the DPO's six required columns: purpose,
  period, starting event, deletion/abstraction method, system owner,
  exceptions.
- **§3** documents every deletion/purge *mechanism* found in code, because
  several categories share the same mechanism (e.g. the whole-person hard
  delete cascades ~55 tables across 6 of the DPO's categories at once).
- **§4** is the derived-store / provider-copy propagation map — what a
  deletion does and does NOT reach outside the primary Postgres row.
- **§5** is the gap register — everything the codebase does *not* yet do,
  each with a severity read and (where one exists) a tracking ID.
- **§6** is the proposed deletion-propagation test plan.

---

## 1. Data-category → table inventory (with retention-relevant columns)

Schema location: `packages/database/src/schema/`. Barrel: `index.ts`. All
tables below FK-cascade to `person.id ON DELETE CASCADE` unless noted
otherwise (see §3.1 cascade map).

| Category | Tables (file:line of `pgTable(`) | Retention-relevant columns |
|---|---|---|
| **1. Raw conversation content** | `sessionEvents` (`sessions.ts:182`), `learningSessions` (`sessions.ts:126`), `onboardingDrafts` (`sessions.ts:88`), `parkingLotItems` (`sessions.ts:316`) | `learningSessions.expiresAt` (110), `.lastActivityAt` (151) |
| **2. Media** | No dedicated audio/image table found in schema. Per `docs/architecture.md` (Data privacy & compliance row, and the Consumer Family Compliance Boundary section): *"raw audio is transient by default: capture only to transcribe/respond, do not retain raw child voice recordings, do not train models on them, and delete audio immediately after the request is handled."* `speakingPracticeAttempts` (`speaking-practice.ts:23`) stores speaking-practice *attempt* records — TODO: confirm whether this table stores raw audio bytes/URLs or only derived scores/transcripts (not read at column level by any fork this pass). | TODO — confirm no persisted audio blob/URL column |
| **3. Quotations / extracted evidence** | Verbatim `learnerQuote` lives inside `learningSessions.metadata` JSONB (`challengeRound.evaluations[].learnerQuote`; schema `packages/schemas/src/sessions.ts:173`, write site `apps/api/src/services/session-exchange.ts:586-597`, overwritten with exact `session_events.content` per `apps/api/src/services/challenge-round/evaluation.ts:112-124` — carried over from the 2026-06-07 audit, re-verify line numbers before citing to DPO). Also `evidenceLinks` (`evidence-links.ts:19`), `retentionCards` (`assessments.ts:112`), `quizMissedItems` (`quiz.ts:72`) | No age-out column found on any of these — see gap G-1 |
| **4. Summaries / derived notes** | `sessionSummaries` (`sessions.ts:238`), `topicNotes` (`notes.ts:8`), `progressSnapshots`/`progressSummaries`/`weeklyReports`/`monthlyReports`/`milestones` (`snapshots.ts:18,48,78,118,150`) | `sessionSummaries.purgedAt` (`sessions.ts:287`) — stamped, row never deleted |
| **5. Learning state** | `assessments`, `needsDeepeningTopics`, `teachingPreferences` (`assessments.ts:54,171,226`); `concepts`/`conceptMastery` (`concept-mastery.ts:23,58`); `quizRounds`/`quizMasteryItems` (`quiz.ts:28`, `quiz-mastery.ts:15`); `dictationResults` (`dictation.ts:21`); `vocabulary`/`vocabularyRetentionCards` (`language.ts:21,62`); `learningProfiles` (`learning-profiles.ts:15`); `subjects`,`curricula`,`curriculumBooks`,`curriculumTopics`,`topicConnections`,`curriculumAdaptations`,`bookSuggestions`,`topicSuggestions` (`subjects.ts:48,104,132,213,275,343,384,413`); `streaks`,`xpLedger`,`learningModes`,`coachingCardCache` (`progress.ts:29,49,185,214`); `challengeRoundCooldowns` (`challenge-round-cooldowns.ts:33`); `practiceActivityEvents`,`celebrationEvents` (`practice-activity.ts:27,86`); `bookmarks` (`bookmarks.ts:13`) | `subjects.status = 'archived'` (soft, set by `archiveInactiveSubjects`, `apps/api/src/services/subject.ts:918`, 30-day inactivity — `apps/api/src/inngest/functions/subject-auto-archive.ts:11,40-44`); `learningProfiles.consentPromptDismissedAt` (`learning-profiles.ts:41`) |
| **6. Embeddings / vectors** | `sessionEmbeddings` (`embeddings.ts:15-51`, `content: text` + `embedding vector(1024)`, FKs `sessionId`/`profileId`/`topicId` all `onDelete:'cascade'` at lines 23,26,28); `memoryFacts.embedding` (`memory-facts.ts:40`, nullable vector column on the memory-facts row, not a separate table) | Rebuilt (not deleted) at transcript-purge time — see §3.2 |
| **7. Identity and consent evidence** | **Live:** `person` (`identity.ts:78`), `login` (`identity.ts:169`), `organization` (`identity.ts:207`), `membership` (`identity.ts:233`), `guardianship` (`identity.ts:376`), `supportership` (`identity.ts:433`), `consentGrant` (`identity.ts:480`), `consentRequest` (`identity.ts:935`), `knowledgeAssertions` (`identity.ts:809`), `familyJoinInvite` (`identity.ts:1048`), `memoryFacts`/`memoryDedupDecisions` (`memory-facts.ts:16`, `memory-dedup-decisions.ts:13`). **Retained past person-delete (the "`person_retain` set", `identity.ts:539-545` comment):** `consentReceipt` (`identity.ts:547-572`), `deletionAudit` (`identity.ts:574-591`), `financialRecord` (`identity.ts:593-613`) — none of the three carry an FK to `person`/`organization` by design | `person.lastActivityAt` (106), `.archivedAt` (118); `guardianship`/`supportership.grantedAt`/`.revokedAt` (389/392, 445/448); `consentGrant.grantedAt`/`.withdrawnAt` (497/500); `knowledgeAssertions.revokedAt` (828); **all three retain-set tables carry `retentionPeriod: text('retention_period')` (566, 588, 607) — currently NULL/unset, counsel-owned seam** — see gap G-2 |
| **8. Security records** | `webhookIdempotencyKeys` (`webhook-idempotency.ts:24`); `blockedSafetyDigestReceipts`/`blockedSafetyDailyBuckets` (`safety-digest.ts:22,45` — aggregate tripwire counters, not PII by design); `allowedModels` (`identity.ts:849`, vendor-vetting cache, not personal data); Sentry scrubbing config (`apps/api/src/services/sentry.ts`, see §4.4) | `allowedModels.expiresAt` (864, policy-cache TTL, not user data) |
| **9. Support records** | `supportMessages` (`support.ts:43`, raw `content: text`, `profileId` cascade); `feedbackRetryQueue` (`support.ts:29`, deliberately **no FK** — see §4 note); `supportVisibilityContracts`/`supportVisibilityAuditEvents`/`supportVisibilityNotices` (`visibility-contract.ts:18,82,122`); `supporterFeedSurfaceState`/`supporterEncouragementChips` (`supporter-feed.ts:17,70`) | `supportMessages.resolvedAt` (64) |
| **10. Billing data** | `subscription` (`identity.ts:292`), `subscriptionPayers` (`identity.ts:889`); `financialRecord` (overlaps §7 retain-set); `quotaPools`,`profileQuotaUsage`,`usageEvents`,`topUpCredits`,`byokWaitlist`,`billingAlerts` (`billing.ts:15,45,104,134,179,196`) | `topUpCredits.expiresAt` (151) |
| **11. Dormant accounts** | **No dedicated table or sweep found.** Only raw material: `person.lastActivityAt` (`identity.ts:106`), `.archivedAt` (118), `learningSessions.lastActivityAt` (`sessions.ts:151`). No Inngest function grepped as `dormant`/`dormancy` in `apps/api/src/inngest/` — confirmed 2026-07-26. See gap G-3. |  |
| **Notifications / telemetry (not one of the 13 named categories but adjacent — flagged for completeness)** | `mentorNotices` (`mentor-notices.ts:45`), `childCapNotifications` (`notifications.ts:13`), `nudges` (`nudges.ts:12`), `notificationPreferences`/`notificationLog` (`progress.ts:96,156`), `activationEvents` (`activation-events.ts:30`), `mentorActivityLedger` (`activity-ledger.ts:19`), `retrievalEvents` (`retrieval-events.ts:50`), `emailSuppressions` (`email-suppressions.ts:24`) | `mentorNotices.resolvedAt` (102); TTL crons on `activationEvents`/`retrievalEvents` — see §3.3; **`emailSuppressions` has no age-out and no delete path anywhere in `apps/api/src/services/email-suppression.ts` — see gap G-4** |
| Config/policy tables (not personal data) | `regimes`,`policyCells`,`policyRules`,`countryPolicyRegistry` (`identity.ts:627,638,671,720`) — compliance-matrix content, out of scope for a personal-data schedule |  |

---

## 2. Draft retention & deletion schedule

Columns per the DPO's brief: purpose · period · starting event · deletion/
abstraction method · system owner · exceptions. Every period not sourced
directly from a code constant is marked `PROPOSED` (convention-based
suggestion) or `TODO` (no basis found — needs a management/counsel decision).

| # | Category | Purpose | Period | Starting event | Deletion / abstraction method | System owner | Exceptions |
|---|---|---|---|---|---|---|---|
| 1 | Raw conversation content (`session_events`, per-turn chat log) | Deliver the live tutoring exchange | **30 days**, code-verified (`ARCHIVE`-independent cron; see §3.2) | `session_summaries` row for that session has a completed `llmSummary` + `learnerRecap` (`transcript-purge-cron.ts:39-60`) | Hard `DELETE FROM session_events`; `session_embeddings` for that session replaced with a summary-derived embedding, never deleted-and-left-empty (`transcript-purge.ts:157-193`) | Engineering (API/Inngest) | Sessions stuck ≥37 days without a complete summary are **not** purged — flagged to Sentry + `app/session.purge.delayed` instead of silent skip (`transcript-purge-cron.ts:63-163`) |
| 2 | Media (voice/audio) | Speech-to-text tutoring input | **PROPOSED: immediate, request-scoped** — matches the stated design intent in `docs/architecture.md` ("delete audio immediately after the request is handled"), but no code path was directly traced this pass to confirm no audio bytes/URL are persisted in `speakingPracticeAttempts` | Per-request (design intent) | TODO — confirm actual code path; not verified this pass | Engineering | TODO |
| 3 | Quotations / extracted evidence (`learnerQuote` in `learning_sessions.metadata`, `evidence_links`, `retention_cards`, `quiz_missed_items`) | Evidence backing Challenge-Round mastery verdicts and spaced-repetition review | **Life of person** — survives the 30-day raw-transcript purge by design (confirmed 2026-06-07 audit, re-verify before DPO submission); no age-out mechanism found | Written at Challenge-Round evaluation / quiz completion | Deleted only via the whole-person cascade (§3.1) | Engineering; policy call = product/DPO (this is A24-b in the prior audit — "age-out on the 30-day clock" was scoped as **post-launch tightening**, still open per `ropa.md` line 80) | **PROPOSED**: this is the highest-likelihood "misleading retention notice" exposure per the 2026-06-07 audit — recommend explicit DPO/product decision on whether the current notice language is accurate as-is or needs the A24-b age-out before this schedule is finalized |
| 4 | Summaries / derived notes (`session_summaries`, `topic_notes`, progress/weekly/monthly reports, milestones) | Teaching continuity ("the mentor remembers"); learner-facing recap | **Life of person** | Session/topic completion | Whole-person cascade only; `session_summaries.purgedAt` is a marker stamped by the transcript-purge cron, **not** a delete of the row itself | Engineering | None found |
| 5 | Learning state (mastery, curriculum, quiz, dictation, vocabulary, progress, streaks, XP, bookmarks) | Track and adapt learning | **Life of person**, except `subjects` soft-archived after **30 days inactivity** (`apps/api/src/inngest/functions/subject-auto-archive.ts:11,40-44` → `apps/api/src/services/subject.ts:893-` `archiveInactiveSubjects`) | Person creation / subject inactivity | Whole-person cascade for hard delete; `subjects.status='archived'` is a **soft** flag, content survives (`subject.ts:918`) | Engineering | Direct `deleteSubject` (`subject.ts:862-880`) is a **hard** `DELETE` at the DB layer today, not archive-first — see gap G-5 |
| 6 | Embeddings / vectors (`session_embeddings`, `memory_facts.embedding`) | Semantic memory recall | Tied to parent content's lifecycle | Session completion / memory-fact write | FK `onDelete:'cascade'` off both `learningSessions.id` and `person.id` (`embeddings.ts:23,26`); also **rewritten** (old row hard-deleted, new one derived from summary text only) at 30-day transcript-purge time (`transcript-purge.ts:157-183`) | Engineering | Provider-side (Voyage AI) copy of the vector — **TODO**, pending Action 8/9 DPA evidence (action-register-tracker.md rows 8-9) |
| 7a | Identity and consent evidence — **live** (`person`, `login`, `membership`, `guardianship`, `supportership`, `consent_grant`, `consent_request`, `knowledge_assertions`) | Authenticate; scope data; prove valid consent; age/jurisdiction gating | **Life of person** | Account/profile creation | Whole-person hard delete (§3.1); Clerk login separately erased (§3.1, §4.1) | Engineering | `knowledge_assertions` is an **append-only audit history** (`ropa.md` row 3) — never deleted while the person exists, even if superseded |
| 7b | Identity and consent evidence — **retained past deletion** (`consent_receipt`, `deletion_audit`, `financial_record` — the "`person_retain` set") | Prove lawful erasure occurred; retain the consent history and tax/chargeback record after the person is gone | **TODO — `retention_period` column exists on all three tables (`identity.ts:566,588,607`) but is currently NULL/unset.** Not a code gap — an explicit counsel-owned seam (`deletion-v2.ts:43-46,1046-1049` per `docs/runbooks/deletion-irreversible-boundary.md` §3) | Person/org deletion transaction commit | Re-homed from `consent_grant` (receipt), computed from subscription snapshot (financial record), and authored directly (audit) — all three **inside the same transaction** that deletes the person (`deletion-v2.ts:484-531`) | Engineering (mechanism); **counsel owns the retention_period value** | These three tables have **no FK to person/organization by design** — they are meant to survive, but that also means a Neon PITR restore to a point before deletion resurrects the deleted person **and** these very deletion records unless the mandatory replay procedure in `docs/runbooks/neon-pitr-identity-recovery.md` §5 is followed |
| 8 | Security records (webhook idempotency keys, safety-digest tripwire counters, Sentry events) | Prevent webhook replay; child-safety tripwire; error monitoring | `webhook_idempotency_keys`: **30 days**, code-verified (`apps/api/src/inngest/functions/webhook-idempotency-purge.ts:32,44-61`). Safety-digest counters: aggregate, no PII, no age-out found (not personal data — N/A). Sentry: **PROPOSED 90 days**, convention; actual value is a Sentry-project setting, not code — TODO confirm in Sentry dashboard | Key creation / event ingestion | Hard `DELETE`, cron-driven | Engineering (webhook keys); Sentry project retention is a **platform setting** | TODO — confirm Sentry project retention window directly in the Sentry dashboard, not assumed |
| 9 | Support records (`support_messages`, `feedback_retry_queue`, visibility-contract/audit tables) | Handle in-app support and feedback delivery | `support_messages`: **life of person** (cascade-only, no independent age-out found). `feedback_retry_queue`: **PROPOSED — `FEEDBACK_RETRY_RETENTION_DAYS`**, a named config constant whose *value* was not read this pass (`apps/api/src/services/feedback-retry.ts`, purge wired in `webhook-idempotency-purge.ts:63-78`) — TODO: read the constant's actual value before finalizing | Ticket creation / feedback submission | `support_messages` via whole-person cascade; `feedback_retry_queue` via delete-on-success + its own TTL cron (deliberately **no FK** to person — comment at `support.ts:21-24` explains why) | Engineering | None found beyond the TODO above |
| 10 | Billing data (`subscription`, `subscription_payers`, quota/usage/top-up tables, `byok_waitlist`, `billing_alerts`) | Paid-plan administration, quota enforcement, tax record | `subscription`/`subscription_payers`: deleted as part of account deletion (**not** cascade — explicit hard-delete step required first to satisfy `ON DELETE RESTRICT` before the person/org drop, `deletion-v2.ts:470-483`). `financial_record` snapshot: see row 7b. `byok_waitlist`: **email-only, no FK** — explicitly erased by email-match **only on whole-org deletion** (`deletion-v2.ts:542-548`) | Subscription creation / account deletion | Explicit `DELETE` (subscription) then whole-person cascade for the rest; `byok_waitlist` deleted by owner-email match | Engineering | **`byok_waitlist` erasure was only confirmed wired into the whole-org path — TODO verify whether a person-scoped delete (consent-withdrawal, archive-cleanup) also erases a matching row, or whether that path is a gap** (see G-6) |
| 11 | Dormant accounts | N/A — no first-class handling found | **TODO — no code-defined period.** `person.lastActivityAt`/`.archivedAt` exist as raw signal but no Inngest sweep reads them for a dormancy purpose (confirmed by grep of `apps/api/src/inngest/functions/` for `dormant`/`dormancy`, 2026-07-26 — zero matches) | N/A | N/A | Product + engineering (needs to be built) | **This is the largest structural gap against the DPO's requested category list — see G-3** |
| 12 | Backups (Neon PITR / snapshots) | Disaster recovery | **TODO — platform-level Neon project/plan setting, not hardcoded in this repo.** `docs/runbooks/neon-pitr-identity-recovery.md:29-49` explicitly states the retention window and snapshot schedule must be read from the Neon console per-branch, not assumed | N/A | N/A | Infra/ops (Neon console owner) | **Structural exception, not a bug:** a PITR restore can resurrect a deleted person **and** the very `deletion_audit`/`consent_receipt`/`financial_record` rows proving the erasure, unless the mandatory capture→restore→replay procedure (`neon-pitr-identity-recovery.md` §3, §5) is followed every time. `WI-2056`/`WI-2057` are the named forward-repair follow-ups; `WI-2390` is deletion-recovery hardening |
| 13 | Queues (Inngest event payloads) | Durable async execution — deletion orchestration, purges, notifications | **TODO — no in-repo statement of Inngest's own event-payload retention found** (checked `docs/architecture.md`, no match). One piece of indirect evidence the team already treats Inngest's store as untrusted: `feedback_retry_queue` exists specifically so `app/feedback.delivery_failed` events never carry the user's free-text feedback through Inngest's event store — only an opaque id does (`support.ts:13-24` comment) | N/A | N/A | Infra/ops (Inngest plan owner) | No Cloudflare Queue found in `apps/api/wrangler.toml` — Inngest is the only durable queue layer |
| 14 | Caches (Cloudflare KV, in-memory rate limiters) | Subscription-status cache; consent-page rate limiting | `SUBSCRIPTION_KV` (`services/kv.ts`): **24-hour TTL** via `expirationTtl` (line 62), code-verified — metadata (tier/quota) only, not conversation content. Consent-page rate limiter: **per-IP, in-memory**, not persisted across Worker isolate restarts (`2026-07-17-consent-withdrawal-bearer-token-threat-posture.md:30`) | Cache write | TTL expiry (KV); isolate restart (in-memory) | Engineering | An explicit `deleteSubscriptionStatus` function exists (`kv.ts:74-79`) but is invalidation-on-mismatch only — **not confirmed wired to account deletion** (TODO, see G-7) |
| 15 | Provider copies (LLM providers, Voyage AI, Clerk, RevenueCat/Stripe, Resend, Sentry, Inngest) | Processing by named sub-processors | **TODO for every provider** — per-provider retention is explicitly out of this document's scope per the task brief ("handled separately"); DPO Actions 7-9 are actively gathering DPA/evidence packs from OpenAI, Mistral, Anthropic, Cerebras, Voyage AI (`DPO exchanges/2026-07-26-action-register-tracker.md` rows 7-9, in flight as of 2026-07-26) | N/A | Explicit deletion calls exist for **Clerk** (`deleteClerkUser`, `apps/api/src/services/clerk-user.ts:251-321`, called from `account-deletion.ts:200-207`) and a **RevenueCat/Stripe teardown event** (`app/billing.subscription_store_teardown_requested`, dispatched `account-deletion.ts:178-192`, consumed by `billing-subscription-store-teardown.ts`) — both are **best-effort and retried**; after retries exhaust, WI-2346 (PR #2792) added PII-minimized attempts to dispatch `app/account.deletion_teardown.failed` (`apps/api/src/inngest/functions/account-deletion.ts:85-102`) and `app/billing.subscription_store_teardown.failed` (`apps/api/src/inngest/functions/billing-subscription-store-teardown.ts:64-81`). Those attempts use `safeSend`, which logs and reports a rejected or two-second-timed-out dispatch but returns without a persisted retry (`apps/api/src/services/safe-non-core.ts:7-19,37-104`). Manual external-erasure remediation remains necessary, and real chat/pager delivery plus production-console routing are not proved here | Legal/DPO (provider DPAs) + Engineering (the two wired erasure calls) | See G-8: event construction and dispatch attempts are wired, but dispatch durability and external delivery/routing remain open under WI-1916 |

---

## 3. Existing deletion / cleanup mechanisms (detail)

### 3.1 Whole-account deletion (owner-initiated)

- **Route:** `POST /account/delete` → `apps/api/src/routes/account.ts:157-259`
  (owner-only). Stamps `organization.deletionScheduledAt`
  (`scheduleDeletionV2`) and dispatches `app/account.deletion-scheduled`.
- **Cancel:** `POST /account/cancel-deletion` (`account.ts:260-290`) →
  `cancelDeletionV2`, reversible any time before the DB transaction commits.
- **Durable job:** `apps/api/src/inngest/functions/account-deletion.ts:18-211`.
  7-day grace (`step.sleep`, `GRACE_PERIOD_DAYS = 7` in `deletion-v2.ts:104`)
  → cancellation re-check → `executeDeletionV2`
  (`apps/api/src/services/identity-v2/deletion-v2.ts:358-552`, one Postgres
  transaction) → dispatches subscription-store teardown → erases Clerk login.
- **What the transaction does** (`deletion-v2.ts:358-552`): tears down
  guardianship/supportership edges (426-463) → hard-deletes `subscription`
  rows (470-483) → per person: re-homes live `consent_grant` → `consent_receipt`
  (484-513), writes `financial_record` (515-522), writes `deletion_audit`
  (524-530), hard-deletes the `person` row (532-536, cascades ~55 tables) →
  hard-deletes the now-childless `organization` row (540) → erases the
  matching `byok_waitlist` row by owner email (542-548).
- **Irreversibility boundary:** the DB transaction commit is the single hard
  line — everything before it is reversible via cancel-deletion; everything
  the transaction does, and both external-erasure legs after it, are not.
  Full boundary table in `docs/runbooks/deletion-irreversible-boundary.md` §§1-2.

### 3.2 Raw-transcript purge (30-day cron) — code-verified LIVE in production

- **Finder:** `apps/api/src/inngest/functions/transcript-purge-cron.ts:22-171`,
  daily 05:00 UTC. Finds `session_summaries` ≥30 days old with a completed
  `llmSummary`+`learnerRecap` (39-60); rows stuck ≥37 days without one are
  flagged to Sentry + `app/session.purge.delayed`, never silently dropped
  (63-163).
- **Executor:** `apps/api/src/services/transcript-purge.ts:40-234`. In one
  transaction: stamps `sessionSummaries.purgedAt` (134-147); hard-deletes all
  `sessionEmbeddings` for the session and replaces with one embedding derived
  from the summary+recap text only (157-183); hard-deletes all `sessionEvents`
  for the session (185-193) — the actual raw-turn destruction point.
- **Production gate — verified live 2026-07-26:** `RETENTION_PURGE_ENABLED`
  defaults `false` (`.env.example:138`, `apps/api/src/config.ts:112`) but is
  confirmed `true` in the production Doppler config (`doppler secrets get
  RETENTION_PURGE_ENABLED --project mentomate --config prd`, run 2026-07-26 —
  the cron is live, not dormant code).
- **What survives:** `sessionSummaries.llmSummary`/`.learnerRecap`/`.narrative`
  etc. (the abstracted output), and the verbatim `learnerQuote` embedded in
  `learningSessions.metadata` JSONB — see schedule row 3 and gap G-1.

### 3.3 Consent-withdrawal → grace → delete pipelines

- **Managed-child path** (guardian-initiated):
  `apps/api/src/inngest/functions/consent-revocation.ts`. Event
  `app/consent.revoked`. 6-day sleep → warn → 1-day sleep → recheck → age-gated
  branch: either `archivePersonOnRevocationV2` (COPPA boundary, feeds §3.4) or
  direct `deletePersonIfConsentWithdrawnV2`.
- **Email-consenting-parent path** (edge-free, bearer-token-triggered):
  `apps/api/src/inngest/functions/consent-email-revocation.ts:1-251`. Event
  `app/consent.email-revoked` (the event the threat-posture doc's
  `POST /consent-page/withdraw` dispatches). Clears nudges (132-136) → 6-day
  sleep → warning push (138-177) → 1-day sleep → recheck (182-193) → notify
  child (199-229) → `deletePersonIfConsentWithdrawnV2` (236-243, "FK cascades
  remove all associated data" per inline comment). No archive branch by design
  (comment 234-235).
- Both consent paths have `onFailure` Sentry escalation and best-effort
  `safeSend` dispatches: `app/consent.revocation.failed`
  (`consent-revocation.ts:63-122`) and
  `app/consent.email-revocation.failed`
  (`consent-email-revocation.ts:55-111`). WI-2346 added the equivalent
  account-deletion and subscription-store teardown attempts named in G-8.
  None of these `safeSend` calls is itself a persisted retry queue: rejection
  or a two-second timeout is logged/reported and allowed to return
  (`services/safe-non-core.ts:7-19,37-104`).

### 3.4 Archive-cleanup (COPPA-age archive branch terminus)

- `apps/api/src/inngest/functions/archive-cleanup.ts:11-72`. Event
  `app/profile.archived`. 30-day sleep (`ARCHIVE_RETENTION_MS`, lines 9, 28).
  Re-checks consent not restored and the archive window elapsed, then calls
  `deleteArchivedPersonIfStillEligibleV2` — hard delete.

### 3.5 Scheduled bulk-TTL crons (cross-profile, non-consent-gated)

| Table | File:line | Window | Operation |
|---|---|---|---|
| `retrieval_events` | `apps/api/src/inngest/functions/retrieval-events-retention-cron.ts:16,23-35` | 37 days rolling | Hard `DELETE`, whole row |
| `activation_events` | `apps/api/src/inngest/functions/activation-events-retention-cron.ts:22-23,60-126` | 90 days (121-day SLA-breach alert) | Hard `DELETE`, count-then-delete |
| `webhook_idempotency_keys` | `apps/api/src/inngest/functions/webhook-idempotency-purge.ts:32,44-61` | 30 days | Hard `DELETE` |
| `feedback_retry_queue` | same file, 63-78, via `apps/api/src/services/feedback-retry.ts` `purgeExpiredFeedbackRetries` | `FEEDBACK_RETRY_RETENTION_DAYS` — value not read this pass (TODO) | Hard `DELETE` |
| `subjects` (inactive) | `apps/api/src/inngest/functions/subject-auto-archive.ts:11,40-44` → `apps/api/src/services/subject.ts:893-` `archiveInactiveSubjects` | 30 days inactivity | **Soft** — `status='archived'`, content survives (not a deletion) |

### 3.6 Direct subject/topic delete (user-initiated, not a scheduled sweep)

`deleteSubject` (`apps/api/src/services/subject.ts:862-880`) issues a direct
`DELETE FROM subjects WHERE id=... AND profileId=...` (867-870) — **hard
delete at the DB layer, not archive-first**, despite an "archive-first
subject-delete" reference in prior project notes (PR #787 era). The FK
cascade (`subjects.id` → curriculum tree/sessions, `onDelete:'cascade'` at
`subjects.ts:112,140,221,230,283,286,357,392,421`) removes all child content
in one statement. `docs/flows/student-flow-access-inventory.md:73` documents
the *client-side* archive-first confirm UX ("archive-first delete (PR #787);
archive-first is client-only (server gap)") — **this is UI confirmation
copy, not a server-side archive step**; the server behavior is a direct hard
delete. Flag for the DPO: the "archive-first" language in the task brief and
in prior docs describes intended/UI behavior, not verified server behavior —
do not represent this as a soft-delete mechanism without re-confirming against
`git log` / the original PR if the distinction matters for the schedule.

### 3.7 Export

`GET /account/export` → `generateExportV2`
(`apps/api/src/services/identity-v2/export-v2.ts`, 409 lines) — owner-gated,
synchronous, available up to the moment the deletion transaction commits
(`docs/runbooks/deletion-irreversible-boundary.md` §4). **Not traced this
pass:** which tables `generateExportV2` actually covers — TODO before this
schedule can claim export/delete parity.

---

## 4. Derived-store and provider-copy propagation

### 4.1 Embeddings (`session_embeddings`, `memory_facts.embedding`)

Full copy of session text + vector, not just a vector. FK `onDelete:'cascade'`
on both `sessionId` and `profileId` (`embeddings.ts:23,26`) — propagates
automatically on person or session deletion. Additionally rewritten (not
merely retained) at 30-day transcript-purge time (§3.2). **No orphan risk
found in schema.** Provider-side (Voyage AI) copy: TODO, pending Action
8/9 evidence.

### 4.2 Persistent learner memory (`memory_facts`, `memory_dedup_decisions`, `learning_profiles`)

All three FK-cascade off `person.id ON DELETE CASCADE`
(`memory-facts.ts:24`, `memory-dedup-decisions.ts:18`,
`learning-profiles.ts:23`). No orphan risk found.

### 4.3 LLM provider calls (`apps/api/src/services/llm/router.ts`)

No persistence outside the DB found in the router itself; `logger.warn`/
`captureException` calls are error-path only, not full-transcript logging.
No in-repo statement of per-provider retention in this file — **provider
retention is out of this document's scope per the task brief and is being
gathered separately** (DPO Actions 7-9). Eval-harness snapshots
(`apps/api/eval-llm/snapshots/**`) are synthetic persona fixtures generated
by `runner/simulated-conversation.ts` / `fixtures/challenge-personas.ts`, not
real user data — verified by naming convention and generator presence, not
every file individually opened.

### 4.4 Sentry

Real scrubbing exists (`apps/api/src/services/sentry.ts`): strips
`Authorization` headers (194-200), strips `query_string`/URL query/
`request.data` body wholesale (273-285), key-denylist scrub of `extra`/
`contexts`/breadcrumb data (`PII_DENYLIST_KEYS`, 101-119 — includes
`transcript`, `messages`, `content`, `homeworkText`, `rawResponse`), redacts
quoted substrings in `event.message`/`exception.value` (166-176, 408-420),
drops all `console.*` breadcrumbs entirely (449-453). **What is NOT
scrubbed:** any field not on the denylist and not inside a quoted substring —
the code's own comment (319-320) states this is defense-in-depth, not a
guarantee. Sentry's own project-level event-retention window: TODO, confirm
in the Sentry dashboard directly.

### 4.5 Inngest event payloads

No in-repo statement of Inngest's own payload-retention policy found. Notable
indirect evidence the engineering team already treats Inngest's event store
as a leak vector: `feedback_retry_queue` exists specifically so
`app/feedback.delivery_failed` never carries the user's feedback free-text
through Inngest's store — only an opaque id does (`support.ts:13-24`).
**TODO: platform-level, confirm via the Inngest Cloud dashboard/plan** (or
self-hosted-mode config, per project memory the API runs Inngest via
`/v1/inngest` on Cloudflare Workers).

### 4.6 Neon Postgres backups / PITR

Restores only Neon Postgres — never Clerk or RevenueCat/Stripe
(`neon-pitr-identity-recovery.md` §4 table). **Structural resurrection risk:**
a PITR restore to a point before a deletion resurrects the deleted
`person`/`organization` row **and** the `deletion_audit`/`consent_receipt`/
`financial_record` rows proving the erasure happened, because all three
retain-tier tables live in the same database with no FK protection outside
the restore blast radius. The runbook's mandatory capture→freeze→restore→
replay procedure (§§3, 5) exists specifically to close this — but it is a
**manual runbook procedure**, not an automated safeguard, and has not been
run in production as of this pass (only a documented verification-drill
protocol exists, §6, three named test cases). Exact PITR window: TODO,
Neon console setting, not hardcoded.

### 4.7 Caches

`SUBSCRIPTION_KV` (`apps/api/src/services/kv.ts`) — 24h TTL, tier/quota
metadata only, not conversation content. `deleteSubscriptionStatus` exists
(`kv.ts:74-79`) but its wiring to account deletion was not confirmed this
pass — TODO. Consent-page rate limiter is per-IP, in-memory, not persisted
across Worker isolate restarts.

### 4.8 Queues

No Cloudflare Queues binding found in `apps/api/wrangler.toml`. Inngest is
the only durable async/queue layer.

### 4.9 Billing webhook payloads

`routes/revenuecat-webhook.ts` and
`services/billing/billing-v2/revenuecat-webhook-handler-v2.ts` exist —
**not opened this pass** to confirm whether raw webhook JSON bodies are
persisted anywhere beyond the structured `billing_alerts` fields. TODO if the
schedule needs a "raw webhook payload" row.

---

## 5. Gap register

| ID | Gap | Category affected | Severity (proposed read, not a ruling) | Tracking |
|---|---|---|---|---|
| G-1 | Verbatim `learnerQuote` (challenge-round evaluations) and other quotation/evidence fields have no age-out; survive indefinitely past the 30-day raw-transcript purge | Quotations (§2 row 3) | Medium — matches the 2026-06-07 audit's "misleading notice" finding (A24-b), re-verify current privacy-notice wording before treating as closed | A24-b (open, post-launch tightening per `ropa.md` line 80) |
| G-2 | `person_retain` set (`consent_receipt`, `deletion_audit`, `financial_record`) `retention_period` columns are NULL/unset — no defined retention today for the very rows that prove lawful erasure | Identity/consent evidence — retained (§2 row 7b) | High for this document's purpose — this is a direct blocker to closing DPO Action 6 with real numbers, not just a mechanism description | Counsel-owned seam per `deletion-v2.ts:43-46,1046-1049`; DPIA §9 item 7 (`dpia.md:115`) |
| G-3 | No dormant-account category exists in code at all — no sweep, no table, no defined "dormant" threshold, despite the DPO explicitly naming this category | Dormant accounts (§2 row 11) | High — this is a category the DPO asked for that has zero implementation, not a partial one | None found — needs a new work item |
| G-4 | `email_suppressions` (bounce/complaint suppression list, PK=email, no FK) has no delete/purge path anywhere in `apps/api/src/services/email-suppression.ts` (confirmed by direct grep, zero delete/DELETE/purge matches) — survives every account-deletion path indefinitely | Notifications/telemetry (adjacent) | Medium — narrow (email address only), but a genuine unbounded-retention gap for a PII field | Was `R3`/`R3b` in the 2026-06-07 audit against the legacy schema (marked moot after the identity cutover) — **needs re-opening against the current `email_suppressions` table**, which the 2026-06-07 audit did not cover |
| G-5 | Direct `deleteSubject` (`subject.ts:862-880`) is a hard DB delete, not archive-first, despite prior docs (`student-flow-access-inventory.md:73`) describing "archive-first delete" — the archive-first behavior appears to be client-side UX confirmation only, not a server soft-delete step | Learning state (§2 row 5) | Low-Medium — not a retention violation (deletion is more aggressive than the notice implies, not less), but a documentation/behavior mismatch worth flagging | None found — needs verification against `git log`/original PR if the distinction matters |
| G-6 | `byok_waitlist` erasure-by-email-match is wired into the whole-org deletion path (`deletion-v2.ts:542-548`) but not confirmed for the person-scoped delete paths (consent-withdrawal, archive-cleanup) | Billing (§2 row 10) | Low — narrow field (email only), only matters if a managed child ever has a `byok_waitlist` entry independent of the org owner, which may not be a real scenario | TODO — verify |
| G-7 | `deleteSubscriptionStatus` KV-invalidation function exists but wiring to account deletion not confirmed | Caches (§2 row 14) | Low — metadata cache, 24h TTL bounds exposure regardless | TODO — verify |
| G-8 | **Event construction and dispatch attempts landed in WI-2346 (PR #2792), but dispatch durability remains open:** exhausted Clerk and subscription-store teardown legs attempt `app/account.deletion_teardown.failed` and `app/billing.subscription_store_teardown.failed`, respectively (`apps/api/src/inngest/functions/account-deletion.ts:85-102`; `apps/api/src/inngest/functions/billing-subscription-store-teardown.ts:64-81`). Both use `safeSend`; rejection or a two-second timeout is logged/Sentry-reported and returns without persisting or retrying the failed dispatch (`apps/api/src/services/safe-non-core.ts:7-19,37-104`). The code-owned launch-health mapping is documented in `docs/runbooks/launch-health-alerts.md:268-280`. Manual provider remediation is still required; real chat/pager integrations and production-console rule routing remain parked under WI-1916 | Provider copies (§2 row 15) | Medium — the handler now attempts a PII-minimized failure signal, but an Inngest transport outage can still lose that signal; the GDPR Art 17 failure requires an operator to finish external erasure, and unproved production routing cannot be treated as a delivered page | WI-2346 closes event construction and best-effort dispatch wiring; WI-1916 owns durable external routing/remediation follow-through, including the residual dispatch gap |
| G-9 | PITR restore can resurrect a deleted person/org and its deletion-evidence rows; the mitigation is a manual runbook procedure, not an automated safeguard, and (per this pass) has not been proven via the documented 3-case verification drill in production | Backups (§2 row 12) | Medium-High for audit-defensibility (deletion supremacy is a stated invariant but only manually enforced) | `WI-2056`, `WI-2057`, `WI-2390` (named in `neon-pitr-identity-recovery.md` §7) |
| G-10 | Export table coverage (`export-v2.ts`) not traced against the full schema inventory in §1 — cannot yet state export/delete parity | Cross-cutting | Low for retention itself, but relevant to the DPO's "rights + authority-verification workflows" ask (Action 11) | TODO |
| G-11 | Media/audio retention (§2 row 2) is a stated design intent in `docs/architecture.md`, not a verified code path this pass | Media | Medium — this is exactly the kind of claim that should not ship to a DPO without direct code verification | TODO — trace the voice-input handler before finalizing |

---

## 6. Proposed deletion-propagation test plan

Each item names the flow to run and the tables/stores to check afterward.
None of these were executed this pass (no test run performed) — this is a
proposed plan, not evidence of a passing run.

1. **Whole-account deletion, happy path.** Create a test account with a
   learner profile, session history, notes, mastery data, subscription. Run
   `POST /account/delete` → wait grace (or trigger `executeDeletionV2`
   directly in a test harness) → assert: `person` row gone; representative
   rows gone from every category-5/6/9/10 table listed in §1; `consent_receipt`
   /`deletion_audit`/`financial_record` rows exist for that person;
   `byok_waitlist` row (if any) gone; Clerk `GET /v1/users/{id}` returns 404;
   `app/billing.subscription_store_teardown_requested` was dispatched and
   consumed (check Inngest run history).
2. **Person-scoped deletion (consent withdrawal, managed child).** Trigger
   `app/consent.revoked` → verify the 6-day/1-day timers, then
   `deletePersonIfConsentWithdrawnV2` cascade fires for that person only;
   sibling profiles and the guardian's own person row are untouched.
3. **Transcript purge cron.** Seed a session ≥30 days past summary
   completion → run `transcriptPurgeCron` → assert `session_events` for that
   session are gone; `session_embeddings` replaced (row count same or
   different vector content, not merely appended); `session_summaries.purgedAt`
   stamped; `learningSessions.metadata.challengeRound.evaluations[].learnerQuote`
   for that session **still present** (this is the known-gap assertion, G-1 —
   test should assert the survivor, not treat its presence as a failure,
   until G-1/A24-b is resolved).
4. **Delayed-purge path.** Seed a session ≥37 days old with no
   `llmSummary`/`learnerRecap` → run the cron → assert `app/session.purge.delayed`
   fired and the session was **not** purged (no `session_events` deleted).
5. **Bearer-token consent withdrawal (email-parent path).** Exercise
   `POST /consent-page/withdraw` → confirm `app/consent.email-revoked`
   dispatch → advance through the 6-day/1-day timers → assert
   `deletePersonIfConsentWithdrawnV2` cascade for the charge person.
6. **Archive-cleanup (COPPA path).** Trigger `app/profile.archived` → advance
   30 days → assert `deleteArchivedPersonIfStillEligibleV2` fires and the
   person is gone, unless consent was restored in the window (assert the
   negative case too: restore consent mid-window, confirm no delete).
7. **Scheduled TTL crons.** Seed rows past each window in the §3.5 table →
   run each cron → assert hard delete for `retrieval_events` (>37d),
   `activation_events` (>90d), `webhook_idempotency_keys` (>30d),
   `feedback_retry_queue` (per its constant, once G-value is read); assert
   `subjects` >30d inactive flips to `status='archived'` **without** row
   deletion.
8. **Subject delete.** Call `deleteSubject` → assert cascade removes only
   that subject's curriculum tree/sessions/notes, not sibling subjects;
   confirm (per G-5) this is a hard delete with no archived intermediate
   state, and reconcile against whatever the intended "archive-first" UX is
   supposed to guarantee.
9. **Export/delete parity.** Run export → hard-delete → diff the exported
   payload's table coverage against the full §1 inventory; flag any table in
   §1 not represented in the export (closes G-10).
10. **Partial-external-failure dead-letter drill.** In an isolated test
    environment, force the terminal Clerk-erasure and subscription-store
    teardown paths after the DB-side cascade has committed
    (`organizationExistsV2` false). Confirm the existing structured log and
    Sentry exception, plus successful dispatch of the exact PII-minimized events
    `app/account.deletion_teardown.failed` and
    `app/billing.subscription_store_teardown.failed` documented by WI-2346 in
    `docs/runbooks/deletion-irreversible-boundary.md` §5. Separately force the
    `safeSend` rejection and timeout paths and record that they log/report but
    do not persist or retry the failed event dispatch. Confirm the code-owned
    launch-health mapping in `docs/runbooks/launch-health-alerts.md:268-280`,
    but do not treat that as proof of chat/pager delivery or production-console
    rule activation: those remain parked under WI-1916. Complete the manual
    external-erasure remediation described by the runbook; this evidence drill
    does not mutate provider consoles, alert rules, environments, or retention
    clocks.
11. **PITR restore-replay drill.** Execute the three named cases (Alice/Bob/
    Org-Carol) already specified in `docs/runbooks/neon-pitr-identity-recovery.md`
    §6 against a non-production branch; record pass/fail for all three. This
    is the existing, already-designed test for G-9 — it has not been run per
    this pass's findings, only specified.
12. **`email_suppressions` negative check.** Run the whole-account-deletion
    test (#1) against an account with a bounced/suppressed email on file →
    confirm the row is (or, per G-4, currently is not expected to be) removed
    — this documents the gap with a real assertion rather than leaving it as
    a prose claim.
13. **KV cache invalidation.** After account deletion, query `SUBSCRIPTION_KV`
    for the deleted account's key → assert it is gone or expired, closing G-7
    either way (currently unverified).
14. **Sentry scrub regression.** Feed a synthetic event containing each
    `PII_DENYLIST_KEYS` field plus a deliberately *non-denylisted* free-text
    field through `scrubSentryEvent` → assert the denylisted fields are
    stripped and explicitly document that the non-denylisted field is NOT
    guaranteed stripped (matches the code's own stated limitation).
15. **Provider-copy verification (blocked).** Once DPO Actions 7-9 DPA/evidence
    packs are received from OpenAI, Mistral, Anthropic, Cerebras, Voyage AI —
    document each provider's own data-deletion mechanism/API and cross-check
    against what this codebase actually sends them (prompts, embeddings).
    Currently blocked on external responses per
    `DPO exchanges/2026-07-26-action-register-tracker.md` rows 7-9.

---

## 7. Summary of what this draft does and does not close

**Closes (code-verified, ready for DPO review):** the mechanism-level "how do
we delete" story for raw conversations, the whole-account/whole-person
cascade, consent-withdrawal grace pipelines, and the 30-day transcript purge
(confirmed live in production). These map cleanly to 6 of the DPO's 13 named
categories with concrete, cited periods.

**Does not close:** concrete retention *periods* for identity/consent-evidence
retained artifacts (G-2, counsel-owned), dormant accounts (G-3, not built),
backups (platform setting, TODO), queues/Inngest payload retention (platform
setting, TODO), most provider-copy retention (blocked on external DPA
responses, Actions 7-9), and deletion-propagation *test evidence* (§6 is a
proposed plan, not executed results). These are the concrete next steps to
bring DPO Action 6 from `partial-exists` to `sent-to-DPO`.
