# L-gap-delta — Phase L unified gap analysis (M/N/O input)

> Generated 2026-06-09 from run `wf_875e3fa8-4bf`. One row per consolidated finding with full classification tags. Companion to `RECONCILED.md` (Phase K). 183 findings + 2 inventory classes.

## Full delta table

| ID | Pri | Severity | WS | Scope | In-IF | Target WS | Canon cite | Verify | Provenance | Evidence (repo) | Title |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F-001 | P1 | P1 \| HIGH | architecture | in-other-workstream | no | architecture |  | confirmed | deep-review/arch-whole-repo::arch-whole-repo-P1-1; deep-review/arch-whole-repo::arch-whol… | apps/api/src/services/snapshot-aggregation.ts:244-252 | Unbounded lifetime materialization of assessments/retention/vocabulary on hot read + snapshot-cron … |
| F-002 | P1 | P1 \| HIGH | architecture | in-other-workstream | no | infrastructure / database-performance |  | confirmed | deep-review/arch-whole-repo::arch-whole-repo-P1-2; deep-review/arch-whole-repo::arch-whol… | apps/api/src/middleware/database.ts:103; packages/database/src/client.ts:96-120 | Per-request Neon pool churn — cache path exists but disabled (latency + connection pressure) |
| F-003 | P1 | P1 \| HIGH \| YELLOW \| unkno… | architecture | in-other-workstream | no | architecture |  | contested | deep-review/arch-whole-repo::arch-whole-repo-P1-3; deep-review/arch-whole-repo::arch-whol… | apps/api/src/services/session/session-exchange.ts; apps/api/src/services/session/session-… | session-exchange.ts — structural epicenter on the LLM trust boundary (oversized, no internal seams,… |
| F-004 | P1 | P1 \| HIGH | architecture | deferred | no |  |  | contested | deep-review/arch-whole-repo::arch-whole-repo-P1-4; deep-review/arch-whole-repo::arch-whol… | apps/api/src/services/settings.ts:25; apps/api/src/services/family-access.ts:11; apps/api… | Runtime circular dependency: {settings, family-access, consent, notifications} 4-node SCC |
| F-005 | P1 | P1 \| HIGH | architecture | in-other-workstream | no | architecture |  | contested | deep-review/arch-whole-repo::arch-whole-repo-P1-5; deep-review/arch-whole-repo::arch-whol… | apps/api/src/inngest/index.ts:194 | Inngest function registration array is a silent manual sync point (dispatch-but-never-run) |
| F-006 | P1 | P1 \| MEDIUM | architecture | in-other-workstream | no | backend-performance / api-architecture |  | contested | deep-review/arch-whole-repo::arch-whole-repo-P1-6; deep-review/arch-whole-repo::arch-whol… | apps/api/src/services/coaching-cards.ts:168; apps/api/src/services/interleaved.ts:72; app… | Fetch-all-then-filter-in-JS on hot read paths — Workers CPU + subrequest budget pressure |
| F-007 | P1 | P2 \| HIGH | architecture | in-other-workstream | no | architecture |  | confirmed | deep-review/arch-whole-repo::arch-whole-repo-P2-1; deep-review/arch-whole-repo::arch-whol… | apps/mobile/src/app/(app)/session/index.tsx; apps/api/src/services/curriculum.ts; apps/ap… | God components/files cluster — mobile session/shelf god screens + oversized session-vertical servic… |
| F-008 | P2 | P2 \| MEDIUM | architecture | deferred | no | architecture |  | confirmed | deep-review/arch-whole-repo::arch-whole-repo-P2-2; deep-review/arch-whole-repo::arch-whol… | packages/schemas/src/index.ts | @eduagent/schemas flat-barrel extreme fan-in (~378–497 consumers, no sub-package blast-radius conta… |
| F-009 | P2 | P2 \| MEDIUM | architecture | in-other-workstream | no | architecture |  | confirmed | deep-review/arch-whole-repo::arch-whole-repo-P2-3; deep-review/arch-whole-repo::arch-whol… | apps/api/src/services/metering.ts; apps/api/src/services/billing/metering.ts | metering.ts filename collision between services/metering.ts (quota math) and services/billing/meter… |
| F-010 | P2 | P2 \| MEDIUM | architecture | in-other-workstream | no | architecture |  | confirmed | deep-review/arch-whole-repo::arch-whole-repo-P2-4; deep-review/arch-whole-repo::arch-whol… | apps/api/src/services/stripe.ts; apps/api/src/services/subscription.ts; apps/api/src/serv… | Half-migrated billing domain — four flat files never moved into billing/ or made facades |
| F-011 | P2 | P2 \| MEDIUM | architecture | in-other-workstream | no | architecture |  | confirmed | deep-review/arch-whole-repo::arch-whole-repo-P2-5; deep-review/arch-whole-repo::arch-whol… | apps/api/src/services/curriculum.ts:58; apps/api/src/services/language-curriculum.ts:9; a… | Runtime cycle: curriculum.ts ⇄ language-curriculum.ts (back-dispatch smell) |
| F-012 | P2 | P2 \| MEDIUM | architecture | in-other-workstream | no | architecture |  | confirmed | deep-review/arch-whole-repo::arch-whole-repo-P2-6; deep-review/arch-whole-repo::arch-whol… | docs/architecture.md:710-715; docs/architecture.md:710,715; packages/database/src/reposit… | architecture.md warns of a non-existent database→schemas circular dependency (all edges import type) |
| F-013 | P2 | P2 \| LOW | architecture | deferred | no |  |  | confirmed | deep-review/arch-whole-repo::arch-whole-repo-P2-7; deep-review/arch-whole-repo::arch-whol… | eslint.config.mjs:106; eslint.config.mjs:106,132 | Permissive @nx/enforce-module-boundaries — package direction is review-enforced, not machine-enforc… |
| F-014 | P2 | P2 \| MEDIUM | architecture | in-other-workstream | no | architecture |  | contested | deep-review/arch-whole-repo::arch-whole-repo-P2-8; deep-review/arch-whole-repo::arch-whol… | apps/api/src/services/test-seed.ts; apps/api/src/index.ts:281 | test-seed.ts size (5,668 LOC) and production-bundle inclusion risk |
| F-015 | P1 | BUG | errors-api | in-other-workstream | no | errors-api |  | contested | deep-review/errors-api::errors-api-critic-1; root/deepsec-handover::deepsec-BUG-other-err… | apps/api/src/routes/sessions.ts:1268,1283,1336; apps/api/src/services/session/session-cru… | system-prompt/events/flag handlers throw raw Error('Session not found') → 500 + spurious Sentry ins… |
| F-016 | P1 | BUG | errors-api | in-other-workstream | no | errors-api |  | contested | deep-review/errors-api::errors-api-critic-2; root/deepsec-handover::deepsec-BUG-other-err… | apps/api/src/routes/vocabulary.ts:102-113; apps/api/src/services/vocabulary.ts:246-380; a… | vocabulary review route catch-all misclassifies transient DB errors as 422 and echoes raw err.messa… |
| F-017 | P1 | BUG | errors-api | in-other-workstream | no | errors-api |  | contested | deep-review/errors-api::errors-api-critic-3; root/deepsec-handover::deepsec-BUG-other-err… | apps/api/src/middleware/jwt.ts:124-185; apps/api/src/middleware/auth.ts:166; apps/api/src… | jwt.ts JWKS response shape unvalidated — malformed upstream 200 misclassified as token error → wron… |
| F-018 | P2 | MEDIUM | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | contested | deep-review/security-pii-inngest::security-pii-inngest-critic-1; root/deepsec-handover::d… | apps/api/src/inngest/functions/session-completed-observe.ts:44,50,84,90,122,128,139; apps… | session-completed-observe schema-drift path logs/captures the full raw event payload, contradicting… |
| F-019 | P2 | MEDIUM | security-pii-inngest | in-other-workstream | no | security-pii-inngest | docs/compliance/identity-compliance-register.md (… | contested | deep-review/security-pii-inngest::security-pii-inngest-critic-2; root/deepsec-handover::d… | apps/api/src/inngest/functions/freeform-filing.ts:148-176 | freeform-filing retry transmits minor's transcript to external LLM without re-checking GDPR consent |
| F-020 | P1 | MEDIUM \| P1 | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | contested | deep-review/security-pii-inngest::sec-M1; deep-review/security-pii-inngest::summary-P1-ch… | apps/api/src/services/child-cap-notifications.ts:178-189; apps/api/src/inngest/functions/… | recordChildCapNotificationForSubscription does not re-verify child belongs to subscription's accoun… |
| F-021 | P1 | YELLOW-RED | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/architecture-audit::architecture-audit-F2a; root/architecture-audit::architecture-au… | apps/api/src/middleware/jwt.ts:69,81,124,151; apps/api/src/services/llm/providers/anthrop… | Untrusted-data casts at trust boundaries — JWT, LLM providers, curriculum generation, and lower-pri… |
| F-022 | P1 | YELLOW-RED | errors-api | in-other-workstream | no | errors-api |  | contested | root/architecture-audit::architecture-audit-F3a; root/architecture-audit::architecture-au… | apps/api/src/routes/billing.ts:579-591; apps/api/src/services/session/session-crud.ts:326… | Silent-failure catch blocks across billing/session/family — bare catch or empty return with no log/… |
| F-023 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-expensive-api-abuse-656b9e07af; root/deepsec-handov… | apps/api/src/routes/assessments.ts:370-407; apps/api/src/services/assessments.ts:425-446 | Unmetered LLM endpoint POST /sessions/:id/quick-check bypasses quota — evaluateQuickCheckAnswer cal… |
| F-024 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-oidc-misuse-1d14c01b7b; root/deepsec-handover::deep… | .github/workflows/claude-code-review.yml:31; .github/workflows/claude.yml:30 | id-token:write granted to Claude review/agent jobs with no OIDC exchange step (unnecessary credenti… |
| F-025 | P1 | BUG | errors-api | in-other-workstream | no | errors-api |  | contested | root/deepsec-handover::deepsec-BUG-other-envelope-hardfail-93c9f9a13b; root/deepsec-hando… | packages/schemas/src/llm-envelope.ts:32-74; .deepsec/findings/BUG/eduagent-build-other-en… | Out-of-range private_sources.factual_confidence (>1) rejects the ENTIRE LLM envelope — drops reply … |
| F-026 | P1 | BUG | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | root/deepsec-handover::deepsec-BUG-other-i18n-untranslated-0cc33085a0; root/deepsec-hando… | apps/mobile/src/components/chrome/ModeSwitcher.tsx:116-133; .deepsec/findings/BUG/eduagen… | Mode-switch error row renders hardcoded English literals bypassing i18n |
| F-027 | P1 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-other-untrusted-markdown-link-88b9b774a8; root/deep… | apps/mobile/src/components/session/MessageBubble.tsx:218-261; apps/mobile/src/components/… | ThemedMarkdown renders LLM markdown with no onLinkPress / allowedImageHandlers — arbitrary-URL link… |
| F-028 | P1 | HIGH \| MEDIUM | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | confirmed | deep-review/security-pii-inngest::pii-H3; deep-review/security-pii-inngest::pii-H4; deep-… | apps/api/src/inngest/functions/auto-file-session.ts:71-76; apps/api/src/inngest/functions… | Minor's full session transcript memoized in step return state (auto-file-session, freeform-filing, … |
| F-029 | P2 | MEDIUM | architecture | in-other-workstream | no | architecture |  | contested | deep-review/arch-whole-repo::arch-whole-repo-MEDIUM-3 | apps/api/src/services/consent.ts:33-36; apps/api/src/services/notifications.ts:22 | Runtime cycle A: consent.ts ⇄ notifications.ts |
| F-030 | P2 | LOW | architecture | in-other-workstream | no | architecture |  | contested | deep-review/arch-whole-repo::arch-whole-repo-LOW-1 | apps/api/src/services/exchanges.ts; apps/api/src/services/exchange-prompts.ts:18 | Type-only cycles (compile-erased) — exchanges ⇄ exchange-prompts |
| F-031 | P2 | MEDIUM | architecture | deferred | no | architecture |  | contested | deep-review/arch-whole-repo::arch-whole-repo-MEDIUM-9 | apps/api/src/services/llm/router.ts; packages/database/src/repository.ts; apps/api/src/se… | Other oversized files — navigation and conflict hotspots across API and mobile |
| F-032 | P2 | MEDIUM | architecture | deferred | no |  |  | contested | deep-review/arch-whole-repo::arch-whole-repo-MEDIUM-10 | apps/api/src/index.ts; packages/database/src/repository.ts:71; docs/architecture.md:404 | Manual sync points — route mount list, scoped-repo blocks, doc route count, language enums |
| F-033 | P2 | LOW | architecture | deferred | no |  |  | confirmed | deep-review/arch-whole-repo::arch-whole-repo-LOW-2 | apps/api/src/routes/account.ts:50; apps/api/src/routes/test-seed.ts:210 | Ad-hoc error envelopes and missing service-folder graduation rule |
| F-034 | P2 | LOW | architecture | in-other-workstream | no | architecture |  | contested | deep-review/arch-whole-repo::arch-whole-repo-LOW-4 | apps/api/src/services/family-access.ts:13; apps/api/src/services/quiz/orchestrate-round.t… | Type-only layer inversions — services/lib reaching upward into middleware/components |
| F-035 | P0 | CRITICAL | agent-instructions | in-other-workstream | no | secrets-hygiene |  | confirmed | deep-review/agent-instructions::C1 | .claude/settings.local.json:7 | Plaintext Logfire secret-key pair embedded in .claude/settings.local.json |
| F-036 | P1 | HIGH | agent-instructions | in-other-workstream | no | agent-infrastructure |  | contested | deep-review/agent-instructions::H1 | .claude/settings.local.json:11 | autoMemoryDirectory points at a different filesystem tree than the live repo |
| F-037 | P1 | HIGH | agent-instructions | in-other-workstream | no | agent-instructions |  | contested | deep-review/agent-instructions::H2 | CLAUDE.md:40-43; AGENTS.md:68-71; AGENTS.md:23-44 | CLAUDE.md and AGENTS.md diverge on skill paths and content beyond cosmetic differences |
| F-038 | P2 | MEDIUM | agent-instructions | in-other-workstream | no | agent-instructions |  | contested | deep-review/agent-instructions::M1 | .agents/skills/code-review/SKILL.md; .agents/skills/thermo-nuclear-code-quality-review/SK… | Skill description: fields for code-review and thermo-nuclear-code-quality-review violate the repo's… |
| F-039 | P2 | MEDIUM | agent-instructions | in-other-workstream | no | agent-instructions |  | contested | deep-review/agent-instructions::M2 | .claude/skills/commit/SKILL.md:1-13 | Generated commit skill description is a workflow summary violating trigger-only rule, intentionally… |
| F-040 | P2 | MEDIUM | agent-instructions | in-other-workstream | no | agent-instructions |  | confirmed | deep-review/agent-instructions::M3 | .agents/skills/worktree-setup/SKILL.md | worktree-setup skill description embeds workflow narration after valid trigger opening |
| F-041 | P2 | MEDIUM | agent-instructions | in-other-workstream | no | agent-instructions |  | contested | deep-review/agent-instructions::M4 | CLAUDE.md (Profile Shapes); apps/mobile/src/app/(app)/_layout.tsx:122-185; apps/mobile/sr… | Stale / imprecise source citations in CLAUDE.md profile-shape section |
| F-042 | P2 | MEDIUM | agent-instructions | in-other-workstream | no | agent-instructions |  | confirmed | deep-review/agent-instructions::M5 | .claude/hooks/scope-keyword-check.sh:20,28,34-38 | scope-keyword-check.sh hook references a non-existent skill and is trivially bypassed by broad skip… |
| F-043 | P2 | MEDIUM | agent-instructions | deferred | no |  |  | confirmed | deep-review/agent-instructions::M6 | .deepsec/AGENTS.md:7-12 | .deepsec/AGENTS.md instructs agents to follow arbitrary per-project SETUP.md — indirect prompt inje… |
| F-044 | P2 | LOW | agent-instructions | deferred | no |  |  | confirmed | deep-review/agent-instructions::L1 | CLAUDE.md (Git Commits section); .claude/commands/my/commit-old.md | CLAUDE.md forbids /my:commit-old and /zdx:commit but both remain installed and invocable |
| F-045 | P2 | LOW | agent-instructions | in-other-workstream | no | agent-instructions |  | confirmed | deep-review/agent-instructions::L2 | CLAUDE.md (whole file) | CLAUDE.md is 333 lines and mixes constitution-level rules with command cookbooks, duplicating canon… |
| F-046 | P2 | LOW | agent-instructions | in-other-workstream | no | agent-instructions |  | confirmed | deep-review/agent-instructions::L3 | scripts/sync-skills.mjs:144-147 | sync-skills.mjs is additive-only; removed master leaves orphaned generated copy that --check won't … |
| F-047 | P2 | MEDIUM | errors-api | in-other-workstream | no | errors-api |  | confirmed | deep-review/errors-api::errors-api-1 | apps/api/src/routes/dictation.ts:286-288 | Silent swallow of DB failure when fetching dictation struggles — bare catch {} with no logging or S… |
| F-048 | P2 | LOW | errors-api | in-other-workstream | no | errors-api |  | contested | deep-review/errors-api::errors-api-2 | apps/api/src/services/consent.ts:672-674 | Consent resend-counter rollback failure swallowed without logging — inconsistent with two sibling c… |
| F-049 | P2 | LOW | errors-api | in-other-workstream | no | errors-api |  | confirmed | deep-review/errors-api::errors-api-3 | apps/api/src/routes/stripe-webhook.ts:87 | Signature-verification catch discards underlying error detail — Stripe and Resend webhook routes lo… |
| F-050 | P0 | CRITICAL | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | deep-review/l10n-a11y-mobile::a11y-C1 | components/session/MessageBubble.tsx:232-289, components/session/ChatShell.tsx:413-430 | Streamed tutor messages are never announced to screen-reader users (the core flow) |
| F-051 | P1 | HIGH | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | deep-review/l10n-a11y-mobile::a11y-H1 | app/(app)/quiz/play.tsx:946-1001, app/(app)/quiz/play.tsx:992 | Quiz answer result (correct / wrong + revealed answer) is not announced |
| F-052 | P1 | HIGH | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | deep-review/l10n-a11y-mobile::a11y-H2 | app/(app)/library.tsx, app/(app)/more/account.tsx, components/library/TopicPickerSheet.ts… | Modals do not trap VoiceOver focus (`accessibilityViewIsModal` missing everywhere) |
| F-053 | P1 | HIGH | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | deep-review/l10n-a11y-mobile::a11y-H3 | app/(app)/quiz/play.tsx:1072-1078, components/session/ChatShell.tsx:819-826 | Loading / busy states are not announced (systemic — 31 of 50 ActivityIndicator files) |
| F-054 | P1 | HIGH | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | deep-review/l10n-a11y-mobile::a11y-H4 | app/(app)/session/_components/ConfirmationToast.tsx:12-22 | Confirmation toast is invisible to screen readers |
| F-055 | P2 | MEDIUM | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | deep-review/l10n-a11y-mobile::a11y-M1 | app/(auth)/sign-in.tsx:1401-1416, app/(auth)/sign-up.tsx:595-605 | Form inputs lack `accessibilityLabel`; visible labels are detached siblings |
| F-056 | P2 | MEDIUM | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | deep-review/l10n-a11y-mobile::a11y-M2 | components/AnimatedSplash.tsx, components/common/BrandCelebration.tsx | Decorative animations not hidden from screen readers (noise) |
| F-057 | P2 | MEDIUM | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | deep-review/l10n-a11y-mobile::a11y-M3 | components/session/ChallengeOfferCard.tsx:26,35,44, components/session/DraftedNoteReview.… | Tappables with text children but no `accessibilityRole="button"` |
| F-058 | P2 | MEDIUM | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | deep-review/l10n-a11y-mobile::a11y-M4 | components/session/MessageBubble.tsx:239-256, components/session/MessageBubble.tsx:271-27… | Escalation / verification badges convey state with color + tiny text but no role |
| F-059 | P2 | LOW | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | deep-review/l10n-a11y-mobile::a11y-L1 | components/nudge/NudgeBanner.tsx:51 | Decorative leading icons inside labeled banners not hidden |
| F-060 | P2 | LOW | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | deep-review/l10n-a11y-mobile::a11y-L2 | components/home/CoachBand.tsx:45, components/home/SubjectTile.tsx:70, components/session/… | Tiny 10px text in a few badges/labels |
| F-061 | P0 | CRITICAL | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | deep-review/l10n-a11y-mobile::l10n-C1 | app/session-summary/[sessionId].tsx:445,448,818,1426,1475, app/(app)/shelf/[subjectId]/bo… | Multiline <Text> children — 163 hardcoded English sentences/labels |
| F-062 | P0 | CRITICAL | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | deep-review/l10n-a11y-mobile::l10n-C2 | app/(auth)/sign-in.tsx:1022,1430, app/(auth)/sign-up.tsx:413-653, app/(auth)/forgot-passw… | Auth screens render entirely in English |
| F-063 | P1 | HIGH | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | deep-review/l10n-a11y-mobile::l10n-H1 | components/session/SessionMessageActions.tsx:69,168,238, components/session/VoiceRecordBu… | `accessibilityLabel="…"` — 110 hardcoded English screen-reader strings |
| F-064 | P1 | HIGH | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | deep-review/l10n-a11y-mobile::l10n-H2 | app/profiles.tsx:90,135,177, app/(app)/session/index.tsx:1027,1067, app/(app)/homework/ca… | `platformAlert(...)` native dialogs — 25 hardcoded English title+body pairs |
| F-065 | P1 | HIGH | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | deep-review/l10n-a11y-mobile::l10n-H3 | components/progress/MilestoneCard.tsx:17,22,28,47, components/progress/SubjectProgressRow… | Manual pluralization with hardcoded English words — 29 sites |
| F-066 | P1 | HIGH | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | deep-review/l10n-a11y-mobile::l10n-H4 | app/session-summary/[sessionId].tsx:418,502, app/session-transcript/[sessionId].tsx:122,1… | `label=` / `title=` / `placeholder=` / `message=` literals outside auth — 60 sites |
| F-067 | P2 | MEDIUM | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | deep-review/l10n-a11y-mobile::l10n-M1 | lib/format-note-source.ts:10,14, app/(app)/topic/[topicId].tsx:82,103, app/(app)/child/[p… | `toLocaleDateString('en-US', …)` — date hardcoded to US locale (4 sites) |
| F-068 | P0 | CRITICAL | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | deep-review/l10n-a11y-mobile::summary-A11Y-C1 | components/session/MessageBubble.tsx:232-289, components/session/ChatShell.tsx:413-430 | Screen-reader users get silence in the most-used flow (streamed tutor replies) — coordinator synthe… |
| F-069 | P0 | CRITICAL | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | deep-review/l10n-a11y-mobile::summary-L10N-1 | app/(auth)/sign-in.tsx, app/(app)/shelf/[subjectId]/book/[bookId].tsx, app/session-summar… | ~358 hardcoded English strings render English to every non-English locale — coordinator synthesis |
| F-070 | P1 | HIGH | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | deep-review/l10n-a11y-mobile::summary-H2-modal | app/(app)/library.tsx, app/(app)/more/account.tsx, components/common/ProfileSwitcher.tsx,… | 0 of 13 modals use `accessibilityViewIsModal` — coordinator verified |
| F-071 | P2 | unknown | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | deep-review/l10n-a11y-mobile::summary-P2-plurals | components/progress/MilestoneCard.tsx, components/progress/SubjectProgressRow.tsx, compon… | 29 manual-pluralization sites — doubly broken: hardcoded English and binary plural model |
| F-072 | P2 | unknown | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | deep-review/l10n-a11y-mobile::summary-P2-dates | lib/format-note-source.ts:10 | 4 `toLocaleDateString('en-US', …)` hardcodes — coordinator summary |
| F-073 | P1 | HIGH | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | deep-review/security-pii-api::pii-H1 | apps/api/src/routes/filing.ts:172-187, :240-255 | Raw learner session transcript placed into Inngest event payload (third-party persistence) |
| F-074 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | deep-review/security-pii-api::pii-M1 | apps/api/src/services/learner-profile.ts:1782, apps/api/src/services/learner-input.ts:134… | Truncated LLM output (derived from minor's session) shipped to Sentry as extra.rawSlice / rawRespon… |
| F-075 | P2 | MEDIUM | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | contested | deep-review/security-pii-api::pii-M2 | apps/api/src/inngest/functions/progress-summary.ts:85,113,129 | Child's real display name memoized into Inngest step state (third-party persistence) |
| F-076 | P2 | LOW | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | deep-review/security-pii-api::pii-L1 | apps/api/src/services/exchange-prompts.ts:509-511,596-600 | Child's real first name sent to third-party LLM providers in every exchange |
| F-077 | P2 | LOW | security-pii-api | in-other-workstream | no | security-pii-api |  | confirmed | deep-review/security-pii-api::pii-L2 | apps/api/src/services/xp.ts:160 | Raw console.debug in service bypasses structured logger |
| F-078 | P2 | LOW | security-pii-api | in-other-workstream | no | security-pii-api | docs/canon/identity/data-model.md §5.1 ("the futu… | contested | deep-review/security-pii-api::sec-L1 | packages/database/src/rls.ts:46-66 | RLS helper withProfileScope defined but never wired — scoped-repo is the only tenant isolation layer |
| F-079 | P2 | LOW | security-pii-api | in-other-workstream | no | security-pii-api |  | confirmed | deep-review/security-pii-api::sec-L2 | packages/database/src/rls.ts:62 | SET LOCAL GUC built via sql.raw with string interpolation — mitigated but fragile |
| F-080 | P2 | LOW | security-pii-api | in-other-workstream | no | security-pii-api |  | confirmed | deep-review/security-pii-api::sec-L3 | apps/api/src/index.ts:165-191 | CORS reflects any localhost/127.0.0.1 origin with credentials:true in all environments including pr… |
| F-081 | P2 | LOW | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | deep-review/security-pii-api::sec-L4 | apps/api/src/routes/maintenance.ts:58, apps/api/src/routes/test-seed.ts:92 | X-Maintenance-Secret and X-Test-Secret must not land in query strings (informational guardrail) |
| F-082 | P2 | LOW | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | deep-review/security-pii-api::sec-L5 | apps/api/src/routes/test-seed.ts:75-89 | Test routes reachable without secret in development environment (by-design, informational) |
| F-083 | P1 | HIGH | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | contested | deep-review/security-pii-inngest::pii-H1 | apps/api/src/services/session/session-exchange.ts:1806-1818; apps/api/src/inngest/functio… | Minor's raw freeform 'ask' text placed in app/ask.classify_silently event payload |
| F-084 | P1 | HIGH | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | contested | deep-review/security-pii-inngest::pii-H2 | apps/api/src/services/session/session-exchange.ts:1181,1196-1199; apps/api/src/inngest/fu… | Minor's raw topic-probe answer in app/topic-probe.requested event payload |
| F-085 | P2 | MEDIUM | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | contested | deep-review/security-pii-inngest::pii-M6 | apps/api/src/inngest/functions/weekly-progress-push.ts:851-861 | Child names, struggle topics, and parent email memoized in weekly-progress-push prepare step |
| F-086 | P2 | MEDIUM | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | contested | deep-review/security-pii-inngest::pii-M7 | apps/api/src/inngest/functions/monthly-report-cron.ts:475-481 | Child display name and struggle topics memoized in monthly-report-cron generate step |
| F-087 | P2 | MEDIUM | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | contested | deep-review/security-pii-inngest::pii-M8 | apps/api/src/inngest/functions/progress-summary.ts:83-93 | Child name and knowledge inventory memoized in progress-summary gather-context step (known M2) |
| F-088 | P2 | MEDIUM | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | contested | deep-review/security-pii-inngest::pii-M9 | apps/api/src/inngest/functions/consent-revocation.ts:112-115 | Minor's display name and birth year memoized in consent-revocation step state |
| F-089 | P2 | MEDIUM | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | contested | deep-review/security-pii-inngest::pii-M10 | apps/api/src/inngest/functions/session-completed.ts:1490 | Minor's struggle topics round-trip through session-completed step state |
| F-090 | P2 | LOW | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | confirmed | deep-review/security-pii-inngest::pii-L11 | apps/api/src/inngest/functions/feedback-delivery-failed.ts:26-31 | User feedback free-text and support email in app/feedback.delivery_failed event payload |
| F-091 | P2 | LOW | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | confirmed | deep-review/security-pii-inngest::pii-L12 | apps/api/src/inngest/functions/topic-probe-extract.ts:184-186 | Inferred learner signals memoized in topic-probe-extract extract-signals step |
| F-092 | P2 | MEDIUM | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | contested | deep-review/security-pii-inngest::sec-M2 | apps/api/src/inngest/functions/monthly-report-cron.ts:256-449,532-643 | monthlyReportGenerate trusts (parentId, childId) event pair without re-verifying family link — cros… |
| F-093 | P2 | LOW | security-pii-inngest | in-IF-scope | yes |  | MMT-ADR-0001 (own the identity/tenancy graph; acc… | contested | deep-review/security-pii-inngest::sec-L3 | apps/api/src/inngest/functions/consent-revocation.ts:280-289; apps/api/src/services/delet… | Consent-revocation delete branch lacks parent-chain account guard that archive branch has (BUG-662 … |
| F-094 | P2 | LOW | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | confirmed | deep-review/security-pii-inngest::sec-L4 | apps/api/src/inngest/helpers.ts:13,75-79,154,182-183,222-223; apps/api/src/inngest/client… | Env bindings stored in module-level singletons may bleed across concurrent function runs in one iso… |
| F-095 | P1 | HIGH | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | contested | deep-review/security-pii-inngest::summary-prior-run-filing-H1 | apps/api/src/routes/filing.ts:175-180,244-249 | Minor's transcript in event payload — routes/filing.ts (prior-run HIGH site cited in systemic clust… |
| F-096 | P0 | RED | architecture | in-other-workstream | no | billing-and-quotas |  | contested | root/architecture-audit::architecture-audit-F1 | apps/api/src/services/billing/metering.ts, apps/api/src/services/billing/subscription-cor… | Untested billing / quota / idempotency logic |
| F-097 | P2 | YELLOW | architecture | in-other-workstream | no | architecture |  | contested | root/architecture-audit::architecture-audit-F5a | apps/api/src/services/quiz/orchestrate-round.ts | IDOR ownership check in orchestrate-round.ts has no regression test |
| F-098 | P2 | YELLOW | architecture | in-other-workstream | no | architecture |  | confirmed | root/architecture-audit::architecture-audit-F5b | apps/api/src/services/session/session-filing-dispatch.ts | isClosePathAutoFileEligible guard in session-filing-dispatch.ts has no regression test |
| F-099 | P2 | YELLOW | architecture | in-other-workstream | no | architecture |  | confirmed | root/architecture-audit::architecture-audit-F5c | apps/api/src/inngest/functions/webhook-idempotency-purge.ts | Retention cutoff math in webhook-idempotency-purge.ts (BUG-672) has no regression test |
| F-100 | P2 | YELLOW | architecture | deferred | no | architecture |  | confirmed | root/architecture-audit::architecture-audit-F5d | apps/api/src/services/session/session-analytics.ts | BUG-731 SQL cast in session-analytics.ts has no test for future event-type triggering cast error |
| F-101 | P2 | YELLOW | architecture | deferred | no |  |  | confirmed | root/architecture-audit::architecture-audit-F5e | apps/mobile/src/app/(app)/(tabs)/shelf/[subjectId]/book/[bookId].tsx, apps/mobile/src/app… | Mobile giant screens enumerated but not responsibility-analyzed (shelf, camera, sign-in, session-su… |
| F-102 | P2 | GREEN-YELLOW | architecture | deferred | no |  |  | contested | root/architecture-audit::architecture-audit-F6 | apps/api/src/services/** | Documentation / LLM-friendliness gap: JSDoc coverage ~46% on service exports |
| F-103 | unknown | unknown | architecture | in-other-workstream | no | learning-engine |  | contested | root/improve-codebase-architecture::improve-codebase-architecture-1 | apps/api/src/services/challenge-round/evaluation.ts, challenge-round/state.ts, challenge-… | Challenge Round mastery decision smeared across four modules |
| F-104 | unknown | unknown | architecture | in-other-workstream | no | architecture |  | confirmed | root/improve-codebase-architecture::improve-codebase-architecture-2 | apps/api/src/routes/sessions.ts:1547-1612, 1219-1244, 1366-1392, 1420-1442 | session.completed dispatch stranded in the route, gated three ways (confirmed by two agents) |
| F-105 | unknown | unknown | architecture | in-other-workstream | no | architecture |  | confirmed | root/improve-codebase-architecture::improve-codebase-architecture-3 | apps/api/src/routes/sessions.ts:288-357, apps/api/src/routes/filing.ts:61-114 (hardcoded … | Retry-filing duplicated across two handlers — cap already drifted (live bug, confirmed by two agent… |
| F-106 | unknown | unknown | architecture | in-IF-scope | yes |  | docs/canon/identity/data-model.md (target schema,… | contested | root/improve-codebase-architecture::improve-codebase-architecture-4 | apps/api/src/inngest/functions/session-completed.ts:1017,1075,1167,1262,1690; apps/api/sr… | Profile-context resolution — leaky seam repeated ~20 times |
| F-107 | unknown | unknown | architecture | in-other-workstream | no | architecture |  | contested | root/improve-codebase-architecture::improve-codebase-architecture-5 | apps/api/src/inngest/functions/session-completed.ts:90-110, apps/api/src/services/assessm… | loadTopicTitle defined twice with divergent ownership joins — cross-profile data leak risk |
| F-108 | unknown | unknown | architecture | in-other-workstream | no | navigation-contract |  | contested | root/improve-codebase-architecture::improve-codebase-architecture-6 | apps/mobile/src/app/(app)/session/_layout.tsx:17-19, practice/index.tsx:444-446, topic/re… | V0/V1 entry-gating copy-pasted across 8 screen layouts + progress |
| F-109 | unknown | unknown | architecture | in-other-workstream | no | navigation-contract |  | contested | root/improve-codebase-architecture::improve-codebase-architecture-7 | apps/mobile/src/app/(app)/home.tsx:161-169, apps/mobile/src/components/home/LearnerScreen… | Home surface chosen in two places, kept correct only by a magic prop |
| F-110 | unknown | unknown | errors-api | in-other-workstream | no | errors-api |  | contested | root/improve-codebase-architecture::improve-codebase-architecture-8 | apps/mobile/src/app/(app)/progress/index.tsx:235, progress/saved.tsx:137,225, dictation/c… | Error classification bypassed in 6 screens — violates UX-Resilience rule |
| F-111 | unknown | unknown | architecture | in-other-workstream | no | architecture |  | contested | root/improve-codebase-architecture::improve-codebase-architecture-9 | apps/api/src/routes/sessions.ts: safeRefundQuota at ~514,800,895,1007,1162; processMessag… | SSE stream route owns the quota-refund policy in five places |
| F-112 | unknown | unknown | architecture | in-other-workstream | no | architecture |  | contested | root/improve-codebase-architecture::improve-codebase-architecture-11 | apps/api/src/services/retention-data.ts:251,351,492; services/session/session-topic.ts:21… | createScopedRepository vs parent-chain joins — two adapters for one concern (revisits CLAUDE.md rul… |
| F-113 | unknown | unknown | agent-instructions | in-other-workstream | no | agent-instructions |  | contested | root/agent-skills-recommendations::agent-skills-recommendations-1 | packages/schemas/ (no specific file:line cited) | No repo-local skill enforcing @eduagent/schemas as the API-facing type source and trust-boundary pa… |
| F-114 | unknown | unknown | agent-instructions | in-other-workstream | no | agent-instructions |  | contested | root/agent-skills-recommendations::agent-skills-recommendations-2 | apps/api/src/db/ (no specific file:line cited) | No repo-local skill covering Drizzle/Neon scoping rules, profileId safety, migration rollback requi… |
| F-115 | unknown | unknown | agent-instructions | deferred | no |  |  | confirmed | root/agent-skills-recommendations::agent-skills-recommendations-3 | scripts/check-i18n-orphan-keys.ts, scripts/i18n-keep.ts (no specific line cited) | No repo-local skill encoding i18n key hygiene rules, JSX literal ratchet policy, and UI-vs-conversa… |
| F-116 | unknown | unknown | agent-instructions | in-other-workstream | no | platform-security / ci-cd-hardening |  | confirmed | root/agent-skills-recommendations::agent-skills-recommendations-4 | .github/workflows/ (no specific file:line cited) | No repo-local skill covering GitHub Actions security checklist (SHA pinning, pull_request_target, O… |
| F-117 | P1 | HIGH | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-HIGH-acl-check-336e2bca03 | apps/mobile/src/app/(app)/session/_layout.tsx:9 | Proxy-mode session write protection relies on a client-side redirect for non-metered writes |
| F-118 | P1 | HIGH | security-pii-api | in-IF-scope | yes |  | MMT-ADR-0015 (consent authority / data access / p… | contested | root/deepsec-handover::deepsec-HIGH-acl-check-911b3664da | apps/mobile/src/app/consent.tsx:46-180 | Consent request can target arbitrary same-account profiles |
| F-119 | P1 | HIGH | security-pii-api | in-other-workstream | no | security-pii-api |  | confirmed | root/deepsec-handover::deepsec-HIGH-missing-auth-ee640e6ddf | .github/workflows/claude.yml:20-45 | Any @claude issue or comment can invoke a secret-backed agent |
| F-120 | P0 | HIGH_BUG | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-HIGH_BUG-other-data-loss-e0853d1c31 | apps/api/src/services/dictation/result.ts:33-59 | Same-day dictations in the same mode overwrite each other |
| F-121 | P0 | HIGH_BUG | security-pii-api | in-other-workstream | no | billing-subscriptions |  | contested | root/deepsec-handover::deepsec-HIGH_BUG-other-race-condition-4ebbd964c7 | apps/api/src/services/billing/trial.ts:229-243 | Trial-expiry cron can downgrade a just-converted paying subscriber (missing status='trial' guard) |
| F-122 | P0 | HIGH_BUG | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-HIGH_BUG-other-race-condition-a46e5673e1 | apps/api/src/services/deletion.ts:162-171 | Deletion cancellation/restoration checks are not atomic with final deletes |
| F-123 | P0 | HIGH_BUG | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | root/deepsec-handover::deepsec-HIGH_BUG-other-stale-instance-action-063502d673 | apps/mobile/src/components/session/ChatShell.tsx:199-919 | Dormant web ChatShell still exposes voice controls bound to stale session handlers |
| F-124 | P0 | HIGH_BUG | security-pii-api | in-other-workstream | no | billing-subscriptions |  | contested | root/deepsec-handover::deepsec-HIGH_BUG-other-value-loss-e9ddd7be3e | apps/api/src/services/billing/top-up.ts:128-182 | Top-up credits permanently stranded after upgrading from a shared-pool tier to a per-profile tier |
| F-125 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-acl-check-18e8be58a2 | apps/api/src/routes/account.ts:38-44 | GET /account/deletion-status lacks the owner gate its three sibling routes enforce |
| F-126 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-acl-check-4669badcf7 | apps/api/src/routes/sessions.ts:360-407 | Library-filing write endpoints missing proxy-mode guard |
| F-127 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | confirmed | root/deepsec-handover::deepsec-MEDIUM-excessive-permissions-bbcd767d88 | .github/workflows/deploy.yml:37-40 | issues:write granted at workflow scope leaks to every deploy job that does not need it |
| F-128 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | confirmed | root/deepsec-handover::deepsec-MEDIUM-expensive-api-abuse-ab0387d47f | apps/api/src/services/homework-summary.ts:176-222 | Homework summary LLM call can run without quota |
| F-129 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-llm-prompt-injection-65211969f0 | .github/workflows/claude-code-review.yml:34-213 | PR title/author/base interpolated into inline prompt without untrusted-data framing |
| F-130 | P2 | MEDIUM | security-pii-api | in-IF-scope | yes |  | docs/compliance/identity-compliance-register.md (… | confirmed | root/deepsec-handover::deepsec-MEDIUM-other-age-gate-bypass-01cad8dd03 | apps/mobile/src/app/create-profile.tsx:157-163 | Minimum-age enforcement uses birth year instead of full birth date |
| F-131 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-other-audit-bypass-87ea29a0cc | apps/api/src/services/llm/stream-envelope.ts:17-318 | Streaming extractor can show a different reply than the one parsed and persisted |
| F-132 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-other-ci-gate-bypass-b391d49e68 | .github/workflows/claude-code-review.yml:235-288 | Review gate parses an unauthenticated PR comment as the source of truth — verdict is forgeable |
| F-133 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-other-content-safety-fallback-a34899eb0a | apps/api/src/services/llm/providers/gemini.ts:175-301 | Only 'SAFETY' block reason treated as safety filter; other Gemini block reasons trigger cross-provi… |
| F-134 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-other-cross-account-entitlement-race-520de4c9fa | apps/mobile/src/hooks/use-revenuecat.ts:70-164 | RevenueCat identity-sync race can cache another account's entitlement snapshot under the new user's… |
| F-135 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-other-cross-profile-disclosure-753ec3916c | apps/api/src/services/billing/top-up.ts:65-71 | Owner's top-up credit balance leaked to a child profile in quota-exceeded responses |
| F-136 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-other-envelope-projection-bypass-2268d070ec | apps/api/src/services/llm/project-response.ts:80-98 | Read projector leaks raw LLM envelope (private_sources/signals) when reply is empty or non-string |
| F-137 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-other-info-disclosure-c07bafbc70 | apps/mobile/src/lib/strip-envelope.ts:35-134 | Envelope key-allowlist fails open: unrecognized top-level key renders raw (leaks signals/private_so… |
| F-138 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-other-insecure-token-storage-c072f16985 | apps/mobile/src/app/_layout.tsx:58-63 | Clerk session/JWT tokens persisted to web localStorage via secure-storage fallback |
| F-139 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-other-llm-prompt-injection-9c469d204c | apps/api/src/services/session/session-context-builders.ts:192-261 | Learner-controlled library context interpolated into LLM system prompt without data fencing |
| F-140 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-other-pii-in-traces-d5a95497c6 | apps/api/src/services/language-detect.ts:87-89 | Raw learner subject input forwarded to Sentry in fallback catch block |
| F-141 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-other-prompt-injection-cc7702a6d7 | apps/api/src/services/exchange-prompts.ts:660-719 | Preformatted learner context blocks appended to system prompt without enforced escaping |
| F-142 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-MEDIUM-other-resource-exhaustion-836fcc397f | apps/api/src/services/quiz/complete-round.ts:105-259 | Unbounded attempt accumulation and unbounded answerGiven on /quiz/rounds/:id/check (no rate limit, … |
| F-143 | P2 | MEDIUM | security-pii-api | in-other-workstream | no | security-pii-api |  | confirmed | root/deepsec-handover::deepsec-MEDIUM-secret-in-fallback-2f5778d3f6 | apps/api/src/services/test-seed.ts:62-252 | Hardcoded default password used as fallback for seed-created Clerk users |
| F-144 | P1 | BUG | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-BUG-acl-check-1c83ea657a | apps/api/src/services/snapshot-aggregation.ts:973-1221 | Parent proxy sessions can mutate child progress state |
| F-145 | P1 | BUG | security-pii-api | in-other-workstream | no | security-pii-api | docs/canon/identity/prd.md — three-axis age model… | contested | root/deepsec-handover::deepsec-BUG-other-age-gate-fail-open-9802a84a7b | apps/mobile/src/app/(app)/onboarding/pronouns.tsx:62-193 | Pronouns age gate fails open when profile birthYear is missing |
| F-146 | P1 | BUG | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-BUG-other-billing-overcharge-5b66c31673 | apps/api/src/routes/assessments.ts:108-119 | App-help early-return on /assessments/:id/answer consumes quota without an LLM call |
| F-147 | P1 | BUG | architecture | in-other-workstream | no | architecture | MMT-ADR-0014 — router runtime / vetting split (na… | contested | root/deepsec-handover::deepsec-BUG-other-circuit-breaker-liveness-74f270f3ed | apps/api/src/services/llm/router.ts:721-1411 | HALF_OPEN probeInFlight can leak on the lazy streaming path and wedge a provider circuit |
| F-148 | P1 | BUG | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-BUG-other-cross-feature-interaction-2140f28ef5 | apps/api/src/routes/support.ts:69-75 | Outbox-spillover rate-limit rows silently consume the daily push-notification cap |
| F-149 | P1 | BUG | architecture | in-other-workstream | no | content / curriculum data quality |  | contested | root/deepsec-handover::deepsec-BUG-other-data-correctness-0bde1bb5d3 | apps/api/src/services/quiz/capitals-data.ts:143-516 | Duplicate accepted-aliases where diacritic variants were flattened to ASCII |
| F-150 | P1 | BUG | architecture | in-other-workstream | no | architecture |  | confirmed | root/deepsec-handover::deepsec-BUG-other-dead-branch-04fba40f0d | apps/api/src/services/learner-input.ts:78-88 | Redundant if/else in fallbackAnalysis — both branches identical (harmless dead code) |
| F-151 | P1 | BUG | security-pii-api | in-other-workstream | no | ci-cd-hardening |  | contested | root/deepsec-handover::deepsec-BUG-other-dead-code-latent-injection-823b408561 | .github/workflows/e2e-ci.yml:49-68 | Unreachable analyze-step branch contains a latent script-injection sink (base.ref interpolated into… |
| F-152 | P1 | BUG | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-BUG-other-dead-field-latent-idor-7c0b8c2fc1 | packages/schemas/src/learning-profiles.ts:284-290 | Dead childProfileId field in tellMentorInputSchema is a latent cross-profile IDOR footgun |
| F-153 | P1 | BUG | architecture | in-other-workstream | no | architecture |  | contested | root/deepsec-handover::deepsec-BUG-other-divergent-duplicate-29eeebcdd6 | apps/mobile/src/hooks/use-consent.ts:250 | Two different useRestoreConsent hooks with incompatible signatures |
| F-154 | P1 | BUG | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-BUG-other-fragile-single-layer-gate-8a3944ff24 | .github/workflows/e2e-ci.yml:183-279 | mobile-maestro (secret-bearing, executes checked-out code) gates only on a job output with no indep… |
| F-155 | P1 | BUG | security-pii-api | in-other-workstream | no | mobile-testing-infra |  | contested | root/deepsec-handover::deepsec-BUG-other-gating-inconsistency-db4f60235d | apps/mobile/src/app/dev-only/seed-pending-redirect.tsx:38-40 | IS_E2E_BUILD gate omits the __DEV__ guard its sibling screen uses |
| F-156 | P1 | BUG | architecture | in-other-workstream | no | architecture |  | confirmed | root/deepsec-handover::deepsec-BUG-other-guard-bypass-1451746c8d | scripts/check-gc1-pattern-a.ts:35-105 | GC1 mock guard misses multiline jest.mock calls |
| F-157 | P1 | BUG | security-pii-api | in-other-workstream | no | platform-infra |  | contested | root/deepsec-handover::deepsec-BUG-other-ineffective-required-check-86b5df2474 | .github/workflows/e2e-web.yml:45-229 | Required 'smoke' status check is a structural no-op on every pull_request (always green via 'skippe… |
| F-158 | P1 | BUG | security-pii-api | in-other-workstream | no | security-pii-api |  | confirmed | root/deepsec-handover::deepsec-BUG-other-input-validation-329d5c6874 | apps/mobile/src/app/(app)/session/_view-models/session-route-params.ts:73-75 | Untrusted deep-link homeworkProblems JSON parsed without schema validation |
| F-159 | P1 | BUG | security-pii-api | in-other-workstream | no | test-infrastructure |  | contested | root/deepsec-handover::deepsec-BUG-other-input-validation-ee84a692f4 | apps/mobile/src/app/dev-only/seed-pending-redirect.tsx:76-85 | staleMs parsed without a finite-number guard, unlike its sibling screen |
| F-160 | P1 | BUG | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | root/deepsec-handover::deepsec-BUG-other-logic-bug-2517efb7ac | apps/mobile/src/app/preview/topic.tsx:48-110 | Sample-lesson buttons can stay permanently disabled after returning to the screen (missing submitti… |
| F-161 | P1 | BUG | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | root/deepsec-handover::deepsec-BUG-other-logic-bug-2b8ccbc2c4 | apps/api/src/services/session/review-calibration.ts:74-91 | Non-answer substring matching misclassifies substantive answers as non-answers (locale false positi… |
| F-162 | P1 | BUG | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | contested | root/deepsec-handover::deepsec-BUG-other-logic-bug-6b1e72d468 | apps/api/src/inngest/functions/memory-facts-backfill.ts:64-220 | Self-reinvoke cursor advances past profiles that errored mid-run, silently skipping them |
| F-163 | P1 | BUG | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | root/deepsec-handover::deepsec-BUG-other-logic-bug-6bededf179 | apps/mobile/src/app/(app)/more/learning-preferences.tsx:33-89 | Child-mode learning preferences screen previews the parent's accommodation, not the child's |
| F-164 | P1 | BUG | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-BUG-other-lost-update-race-748976e6d6 | apps/api/src/services/onboarding/index.ts:156-190 | updateInterestsContext bumps the optimistic-concurrency version but never checks it (non-CAS) |
| F-165 | P1 | BUG | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | root/deepsec-handover::deepsec-BUG-other-malformed-input-handling-875b04425f | apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx:119-213 | masteryScore query param not guarded against NaN (incomplete sweep of BUG-813 fix) |
| F-166 | P1 | BUG | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-BUG-other-missing-input-validation-2a905de60a | apps/api/src/routes/language-progress.ts:18-26 | Missing UUID validation on subjectId path param causes unhandled 500s on malformed input |
| F-167 | P1 | BUG | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-BUG-other-non-atomic-write-0b7526a752 | apps/api/src/services/language-curriculum.ts:358-372 | Non-transactional regenerate: ownership-check -> delete-all -> insert can race a concurrent same-us… |
| F-168 | P1 | BUG | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | root/deepsec-handover::deepsec-BUG-other-param-handling-9dc7ae203b | apps/mobile/src/app/(app)/vocabulary/[subjectId].tsx:125-131 | subjectId route param not normalized for array case (inconsistent with sibling screen) |
| F-169 | P1 | BUG | security-pii-api | in-other-workstream | no | learning-engine |  | contested | root/deepsec-handover::deepsec-BUG-other-race-condition-103549719e | apps/api/src/services/vocabulary.ts:271-299 | Lost-update race in reviewVocabulary SM-2 read-compute-write (transaction does not provide claimed … |
| F-170 | P1 | BUG | security-pii-api | in-other-workstream | no | mobile-cache-data-fetching |  | contested | root/deepsec-handover::deepsec-BUG-other-race-condition-438202c1ef | apps/api/src/services/home-surface-cache.ts:224-245 | Pending celebration writes can still lose concurrent updates |
| F-171 | P1 | BUG | security-pii-api | in-other-workstream | no | reliability-and-correctness |  | contested | root/deepsec-handover::deepsec-BUG-other-race-condition-7bc421eb7e | apps/api/src/services/celebrations.ts:83-174 | Lost-update race in celebration writes: read happens outside the SELECT FOR UPDATE lock |
| F-172 | P1 | BUG | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | root/deepsec-handover::deepsec-BUG-other-race-condition-9c88182698 | apps/mobile/src/app/(app)/topic/recall-test.tsx:111-207 | Recall-test submit and 'don't remember' use independent in-flight guards, allowing a double-submit |
| F-173 | P1 | BUG | security-pii-api | in-other-workstream | no | billing-subscriptions |  | contested | root/deepsec-handover::deepsec-BUG-other-race-condition-d9af95b461 | apps/api/src/services/billing/trial.ts:52-75 | downgradeQuotaPool can reset an upgraded account's quota pool to free limits (day-28 transition rac… |
| F-174 | P1 | BUG | security-pii-inngest | in-other-workstream | no | security-pii-inngest |  | contested | root/deepsec-handover::deepsec-BUG-other-redundant-llm-call-487bac52e7 | apps/api/src/inngest/functions/review-calibration-grade.ts:95-131 | LLM recall-quality grade computed before cooldown claim, allowing wasted paid LLM call |
| F-175 | P1 | BUG | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | root/deepsec-handover::deepsec-BUG-other-render-phase-side-effect-dc16fb7b5e | apps/mobile/src/app/(auth)/_layout.tsx:64-74 | Impure side effect (sessionStorage write) executed unconditionally during render |
| F-176 | P1 | BUG | security-pii-api | in-IF-scope | yes |  | docs/canon/identity/domain-model.md; MMT-ADR-0007… | contested | root/deepsec-handover::deepsec-BUG-other-state-inconsistency-184499b672 | apps/mobile/src/lib/profile.ts:279-311 | Proxy mode not cleared when saved profile is removed server-side (sticky contradictory state) |
| F-177 | P1 | BUG | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | confirmed | root/deepsec-handover::deepsec-BUG-other-timezone-day-bucketing-af7c3e6e39 | apps/mobile/src/app/(app)/dictation/review.tsx:56 | localDate computed in UTC (toISOString) despite name/intent of device-local date |
| F-178 | P1 | BUG | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | root/deepsec-handover::deepsec-BUG-other-timezone-logic-bug-828ff02d9b | apps/mobile/src/app/(app)/quiz/history.tsx:16-221 | Quiz-history date grouping/labeling mixes UTC and local time bases (off-by-one labels) |
| F-179 | P1 | BUG | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-BUG-other-unbounded-input-7f16ac38e9 | packages/schemas/src/quiz-utils.ts:5-56 | Server-side grading input answerGiven has no maximum length before O(m*n) Levenshtein routine |
| F-180 | P1 | BUG | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-BUG-other-unbounded-input-ea02cf931f | packages/schemas/src/dictation.ts:29-31 | Uncapped chunks/chunksWithPunctuation arrays in dictation review input DTO |
| F-181 | P1 | BUG | security-pii-api | in-other-workstream | no | security-pii-api |  | contested | root/deepsec-handover::deepsec-BUG-rate-limit-bypass-372b9592f9 | apps/api/src/middleware/jwt.ts:134-190 | Unauthenticated forced JWKS re-fetch with no negative cache or cooldown (DoS amplification) |
| INV-1 | P1 | H (primary visible copy) | l10n-a11y-mobile | in-other-workstream | no | l10n-a11y-mobile |  | contested | workflow-1/findings::workflow-1-i18n | docs/audit/2026-05-29-full-audit/workflow-1/findings.md | Hardcoded user-visible JSX strings bypass i18n (no automated guard) |
| INV-2 | P2 | GC6 (backlog, not acceptable … | architecture | in-other-workstream | no | architecture |  | contested | workflow-2/findings::workflow-2-mocks | docs/audit/2026-05-29-full-audit/workflow-2/findings.md | Internal jest.mock() backlog (GC6 burn-down class) |

## Per-finding detail (provenance paths, quotes, rationale, contest notes)

### F-001 — Unbounded lifetime materialization of assessments/retention/vocabulary on hot read + snapshot-cron path (Worker OOM)

- **workstream:** architecture · **domain:** scale / data-access
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** P1 \| HIGH · **normalized_priority:** P1
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-P1-1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/SUMMARY-prioritized.md` — evidence: apps/api/src/services/snapshot-aggregation.ts:244-252
  - `deep-review/arch-whole-repo::arch-whole-repo-HIGH-4` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/services/snapshot-aggregation.ts:244-252
- **quote[0]:** `loadProgressStateOnce` does `findMany()` with **no limit** on assessments, retention cards, vocabulary, vocab-retention cards — loads a learner's *entire lifetime* into Worker memory on **every progress read AND every daily snapshot cron tick**. Sessions were already bounded to 2 years (`:230-243`); these sibling tables were missed.
- **quote[1]:** `loadProgressStateOnce` fetches `repo.assessments.findMany()`, `repo.retentionCards.findMany()`, `repo.vocabulary.findMany()`, `repo.vocabularyRetentionCards.findMany()` with **no limit** — loading a learner's entire lifetime of these rows into Worker memory on every progress read AND every daily snapshot cron tick.
- **rationale:** F-001 concerns unbounded findMany() on assessments, retentionCards, vocabulary, and vocabularyRetentionCards — learning-content/progress tables — causing Worker OOM. None of the 20 canonical-set members address progress-state loading, cron memory bounds, or Worker memory management. The set covers identity/tenancy, payer capacity, age/consent/guardianship, policy-engine/LLM routing, and the compliance register. No member can be cited to bring this into identity-foundation scope. It belongs to the architecture workstream, which owns cross-cutting data-access bound issues.

### F-002 — Per-request Neon pool churn — cache path exists but disabled (latency + connection pressure)

- **workstream:** architecture · **domain:** scale / infrastructure
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** infrastructure / database-performance
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** P1 \| HIGH · **normalized_priority:** P1
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-P1-2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/SUMMARY-prioritized.md` — evidence: apps/api/src/middleware/database.ts:103; packages/database/src/client.ts:96-120
  - `deep-review/arch-whole-repo::arch-whole-repo-HIGH-3` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/middleware/database.ts:103; packages/database/src/client.ts:96-120
- **quote[0]:** Fresh Neon WebSocket pool created + torn down **per request**; cache path exists but is disabled. Every request pays a new WS handshake; Neon connection pressure scales with raw traffic — biting at the ~2K–10K-user inflection the architecture doc flags.
- **quote[1]:** `databaseMiddleware` creates a fresh `NeonPool` per request and tears it down at request end; the pool-cache path exists but is explicitly disabled. Every request pays a new WebSocket handshake to Neon with no reuse across requests on a warm isolate.
- **rationale:** F-002 is about Neon WebSocket pool churn in `databaseMiddleware` — a runtime infrastructure concern. None of the 20 canonical-set members address connection pooling: `data-model.md` covers schema + migration strategy only; the ADRs (0011, 0012, 0015) govern table design; routing ADRs (0013, 0014) govern LLM routing. No canonical-set member can anchor an in-IF-scope call. The defect is real but owned by a database-performance/infrastructure workstream.

### F-003 — session-exchange.ts — structural epicenter on the LLM trust boundary (oversized, no internal seams, ~1000-line function)

- **workstream:** architecture · **domain:** architecture / coupling
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** P1 \| HIGH \| YELLOW \| unknown · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Classifier asks "does a member mandate the file's seams?" — but NO IF ADR dictates seams (0013/0014/0016 record the shape, not the code), so that test makes nothing structural ever in-scope, reducing M/N/O (implementation runway) to pure prose. Scope follows what surface remediation touches. This file realizes three members: resolveExchangeLlmRouting (ADR-0014 router; fail-closed/CircuitOpenError is an ADR-named structural property), decideMasteryAndReview (ADR-0013 spine), envelope signals (ADR-0016 judge). M/N/O must cut into this file to wire the router/spine; the finding's named remedy (routing/Escalation slices) is the seam IF creates anyway. Empty canonical_set_source = auto-flag.
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-P1-3` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/SUMMARY-prioritized.md` — evidence: apps/api/src/services/session/session-exchange.ts
  - `deep-review/arch-whole-repo::arch-whole-repo-HIGH-1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/services/session/session-exchange.ts
  - `root/architecture-audit::architecture-audit-F4` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/services/session/session-exchange.ts, apps/api/src/services/session/session-crud.ts, apps/api/src/services/curriculum.ts, apps/api/src/services/learner-profile.ts
  - `root/improve-codebase-architecture::improve-codebase-architecture-10` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-improve-codebase-architecture.md` — evidence: apps/api/src/services/session/session-exchange.ts (full file, key spans: 215-274, 453-984, 1404-2388, 2390-2742, 2748-3321); apps/api/src/services/escalation.ts:63-163
- **quote[0]:** Largest non-seed file; sits on the **LLM trust boundary + challenge-round mastery policy**; mixes pure decision functions with async I/O orchestration; ~20 sibling-service fan-out. Merge-conflict magnet and hardest-to-test surface.
- **quote[1]:** The largest non-seed source file and the single most concentrated structural risk in the repo. It is the central exchange-processing hub, sitting directly on the LLM trust boundary and the challenge-round mastery policy. It mixes **pure decision functions** with **async I/O orchestration** in one module.
- **quote[2]:** session-exchange.ts has fan-out of 28 import sources and one ~1,000-line function (prepareExchangeContext); session-crud.ts exports 41 symbols and embeds a complete LLM sub-service (matchTopicByIntent + helpers) inside a CRUD file.
- **quote[3]:** Any bug in mastery/escalation/opener means reading the whole file; everything tests as integration. Candidates 1 and the Escalation extraction are the cleanest first slices to carve out.
- **rationale:** F-003 is a structural/code-quality finding: session-exchange.ts is an oversized module mixing pure decision logic with async I/O orchestration. Although it touches the LLM trust boundary, canonical-set members MMT-ADR-0013/0014/0016 define the conceptual shape of the routing and policy engine — not file-level decomposition or internal seams. No named canonical-set member imposes a structural obligation on session-exchange.ts internals. The remedy (carving pure functions, reducing fan-out) is a general architecture/technical-debt concern owned by the architecture workstream.

### F-004 — Runtime circular dependency: {settings, family-access, consent, notifications} 4-node SCC

- **workstream:** architecture · **domain:** architecture / circular-dependencies
- **scope_class:** deferred · **in_scope:** false · **target_workstream:** (none)
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** P1 \| HIGH · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): SCC fuses concerns canon mandates separate: data-model inv 22 three-layer authority separation (consent/billing/visibility) = three of four SCC nodes (consent.ts, settings-subscription, family-access.ts). And consent.ts + family-access.ts realize two ratified members: ADR-0008 (authority check in one named function, no call site re-derives) and ADR-0010 (family-join). An SCC where none is isolable obstructs inv 22 and ADR-0008's single-resolver rule; the IF re-impl rewrites these services. So "no member citeable" is false: inv 22 and ADR-0008 are citeable. Honest call: in-other-workstream, source=inv22/ADR-0008, not deferred with empty source. \| quote-not-found: Quote 2 (REPORT.md arch-whole-repo-HIGH-2) is truncated. Provided quote ends 'risks a TDZ crash).' but source continues '; refactoring `settings` ripples into auth and consent...' with 200+ more chars. Truncation occurs at semicolon after the closing paren.
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-P1-4` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/SUMMARY-prioritized.md` — evidence: apps/api/src/services/settings.ts:25; apps/api/src/services/family-access.ts:11; apps/api/src/services/consent.ts:33; apps/api/src/services/notifications.ts:21
  - `deep-review/arch-whole-repo::arch-whole-repo-HIGH-2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/services/settings.ts:25; apps/api/src/services/family-access.ts:11; apps/api/src/services/consent.ts:33; apps/api/src/services/notifications.ts:21
- **quote[0]:** Genuine 4-node runtime SCC fusing four core back-office services into one init unit. - **Failure mode:** implicit, bundler-dependent module-init order → **TDZ crash risk** on any future load-time change touching a partner export; none of the four unit-testable in isolation. Root cause: `settings.ts` is a god-module.
- **quote[1]:** A genuine 4-node runtime strongly-connected component (madge #1/#2/#5 are different entry-paths into the same SCC). Four core back-office services (subscription/settings, family-access control, GDPR consent, notifications) are fused into one initialization unit. You cannot unit-test or reason about any one in isolation; initialization order is implicit and bundler-dependent (any new module-load-time evaluation touching a partner export risks a TDZ crash).
- **rationale:** F-004 is a bundler-level module-init defect: settings/family-access/consent/notifications form a runtime SCC with implicit init order and TDZ crash risk. The canonical set's 20 members govern identity/tenancy domain model, schema, ADRs 0000–0016 — none address import graphs or god-module decomposition. "Consent" in the SCC does not pull it in: the set's consent coverage is domain-model authority and migration schema, not runtime service wiring. No brief member is citeable. The finding is a general codebase-architecture concern; no workstream currently owns it.

### F-005 — Inngest function registration array is a silent manual sync point (dispatch-but-never-run)

- **workstream:** architecture · **domain:** architecture / background-jobs
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** P1 \| HIGH · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(high): Classifier's key claim is false: it says no canonical-set member touches Inngest/dispatch reliability. But MMT-ADR-0009 (#10, transition scheduler) is built on this exact failure on this exact rail. It names "the 'wired-but-untriggered' trap: if nothing schedules the re-evaluation, the transition silently never happens," on "the existing Inngest rail... mirroring daily-snapshot.ts." ADR-0009 mandates a net-new Inngest cron+fan-out pair for age/consent/dormancy — exactly the functions hand-added to the array the finding flags. A citable IF hook exists; "no hook" collapses. canonical_set_source="" admits no citation found — correct move is flag-to-human. In-IF-scope or flagged.
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-P1-5` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/SUMMARY-prioritized.md` — evidence: apps/api/src/inngest/index.ts:194
  - `deep-review/arch-whole-repo::arch-whole-repo-HIGH-5` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/inngest/index.ts:194
- **quote[0]:** New background functions must be hand-added to the array; miss it and events **dispatch but never run** — no type/runtime error. The "wired-but-untriggered" failure CLAUDE.md's UX-Resilience rules call out as worse than dead code.
- **quote[1]:** Every new background function must be hand-added to the `functions` array. An unregistered consumer means events dispatch but never run — the "wired-but-untriggered" failure CLAUDE.md's UX Resilience Rules explicitly call out as worse than dead code. The failure is silent: no type error, no runtime error, the event simply has no consumer.
- **rationale:** F-005 is Inngest function registration — backend infrastructure where new functions must be manually added to an array or events dispatch silently with no consumer. None of the 20 canonical-set members (locked 2026-06-08) address Inngest or event-dispatch reliability. The set covers identity/tenancy ontology, domain/data models, PRD personas/age model, compliance, and ADRs 0000-0016. No canonical-set hook exists to claim this finding. The finding's own workstream field names architecture as the correct owner.

### F-006 — Fetch-all-then-filter-in-JS on hot read paths — Workers CPU + subrequest budget pressure

- **workstream:** architecture · **domain:** performance / data-access
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** backend-performance / api-architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** P1 \| MEDIUM · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Classifier rightly notes finding is framed as pure perf (Workers CPU, subrequest budget), no member naming query efficiency. But "no IF tie" overstates. Member #3 data-model.md 5.1 owns scope keys: "person_id is the scope key for all learning data; person-scoped reads are an RLS-rollout obligation." Verified: cited progress.ts is profile-scoped (77 refs). The fix (push filters into SQL WHERE) rewrites the same person-scoped reads the IF migration re-keys onto person_id then wraps in RLS; two workstreams, one path, silent out risks collision. Limit: defect is real regardless of scope-key; owning the column is not owning query-shape. Borderline; target_workstream also unset. Flag to human. \| quote-not-found: Provenance[1] (arch-whole-repo-MEDIUM-8, REPORT.md line 125): Quote is TRUNCATED. Provided ends '(50 free / 1000 paid).' but actual file continues ' and the 50ms–30s CPU ceiling first, for power users.' — provided quote is missing the final clause. ; Provenance[0] (arch-whole-repo-P1-6, SUMMARY-prioritized.md lines 66-68): Quote IS FOUND when whitespace-normalized (the source has internal line breaks and indentation that the provided quote collapses to single line).
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-P1-6` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/SUMMARY-prioritized.md` — evidence: apps/api/src/services/coaching-cards.ts:168; apps/api/src/services/interleaved.ts:72; apps/api/src/services/retention-data.ts:1578; apps/api/src/services/progress.ts:1427,1691
  - `deep-review/arch-whole-repo::arch-whole-repo-MEDIUM-8` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/services/coaching-cards.ts:168; apps/api/src/services/interleaved.ts:72; apps/api/src/services/retention-data.ts:1578; apps/api/src/services/progress.ts:1427,1691
- **quote[0]:** Dominant data-access anti-pattern — pulls work onto Worker CPU instead of Postgres. Combined with #1, the progress/snapshot path is most likely to hit the subrequest budget (50 free / 1000 paid) and CPU ceiling first.
- **quote[1]:** MEDIUM. Collectively the dominant data-access anti-pattern: pulls work onto Worker CPU rather than Postgres, and the combined progress/snapshot read path (Promise.all of 6 large finds + per-subject queries + curricula) is the path most likely to approach the Workers subrequest budget (50 free / 1000 paid).
- **rationale:** F-006 is about fetch-all-then-filter-in-JS on hot read paths causing Workers CPU and subrequest-budget pressure. None of the 20 canonical-set members address query efficiency, Workers CPU budgets, or subrequest limits. The L1 docs define identity concepts/schema; L2 ADRs govern identity entities, tenancy, consent, LLM routing, and safety; L3 covers vetted models. No member is load-bearing for how API handlers construct DB queries or consume Cloudflare Workers resources. This is a backend-performance / API-architecture concern with no tie to identity-foundation scope.

### F-007 — God components/files cluster — mobile session/shelf god screens + oversized session-vertical service files

- **workstream:** architecture · **domain:** architecture / god-modules
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** P2 \| HIGH · **normalized_priority:** P1
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-P2-1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/SUMMARY-prioritized.md` — evidence: apps/mobile/src/app/(app)/session/index.tsx; apps/api/src/services/curriculum.ts; apps/api/src/services/session/session-crud.ts; apps/api/src/inngest/functions/session-completed.ts
  - `deep-review/arch-whole-repo::arch-whole-repo-HIGH-6` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/mobile/src/app/(app)/session/index.tsx; apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx
  - `deep-review/arch-whole-repo::arch-whole-repo-HIGH-7` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/services/curriculum.ts; apps/api/src/services/session/session-crud.ts; apps/api/src/services/learner-profile.ts; apps/api/src/inngest/functions/session-completed.ts
- **quote[0]:** **God components/files cluster** (same vertical): mobile `session/index.tsx` (82 hook calls), `shelf/.../book/[bookId].tsx` (68 hooks, 2,110 LOC); services `curriculum.ts` (2,643), `session-crud.ts` (2,228), `learner-profile.ts` (1,948), `session-completed.ts` (1,820, 35-step Inngest pipeline). 40 files >1,000 LOC.
- **quote[1]:** Screen-level god components in the most-used flow. They pull state, theming, navigation, streaming, and a dozen domain hooks into one file — hard to reason about, expensive to test, and prone to re-render / effect-ordering bugs.
- **quote[2]:** Exported-symbol counts this high (29/35/30) mean these files are de-facto namespaces, not cohesive services. `session-completed.ts` is a 35-step Inngest pipeline in one function (durable but monolithic — a failure-mode/idempotency change touches the whole chain).
- **rationale:** F-007 concerns god-component and oversized-file debt: mobile screens (session/index.tsx, shelf/book/[bookId].tsx) and API services (curriculum.ts, session-crud.ts, learner-profile.ts, session-completed.ts). None of the 20 canonical-set members (L1 domain docs, compliance register, MMT-ADR-0000–0016, L3 model register) address mobile component decomposition, service file cohesion, or Inngest pipeline monolithism. No brief member can be cited for identity-foundation scope. The source corpus already labels this workstream:architecture; it belongs there for remediation.

### F-008 — @eduagent/schemas flat-barrel extreme fan-in (~378–497 consumers, no sub-package blast-radius containment)

- **workstream:** architecture · **domain:** architecture / package-boundaries
- **scope_class:** deferred · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** P2 \| MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-P2-2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/SUMMARY-prioritized.md` — evidence: packages/schemas/src/index.ts
  - `deep-review/arch-whole-repo::arch-whole-repo-MEDIUM-1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: packages/schemas/src/index.ts
- **quote[0]:** **`@eduagent/schemas` flat-barrel fan-in** (~378 non-test consumers, ~37% of source). Any schema edit marks all consumers affected in Nx/CI. Add per-domain subpath exports while keeping the barrel.
- **quote[1]:** MEDIUM. This is the intended shared-contract hub (a true runtime leaf by design — not a layering bug), but it is a fragile bottleneck: any breaking schema change ripples to ~378–497 files with no sub-package boundary to contain blast radius.
- **rationale:** F-008 concerns @eduagent/schemas flat-barrel fan-in and missing per-domain subpath exports for Nx/CI blast-radius containment. No canonical-set member covers schema package build topology: L1 docs define identity concepts/rules; L2 ADRs (0000-0016) cover tenancy, entity/role primitives, data-model, migration, policy-engine, LLM router, and safety; L3 covers vetted models. Nothing addresses subpath exports or Nx module boundaries. This is a monorepo build/DX concern outside identity-foundation scope. target_workstream=architecture matches the finding's own domain.

### F-009 — metering.ts filename collision between services/metering.ts (quota math) and services/billing/metering.ts (DB mutators)

- **workstream:** architecture · **domain:** architecture / naming
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** P2 \| MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-P2-3` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/SUMMARY-prioritized.md` — evidence: apps/api/src/services/metering.ts; apps/api/src/services/billing/metering.ts
  - `deep-review/arch-whole-repo::arch-whole-repo-MEDIUM-5` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/services/metering.ts; apps/api/src/services/billing/metering.ts
- **quote[0]:** **`metering.ts` name collision** — `services/metering.ts` (pure quota math) vs `services/billing/metering.ts` (DB mutators). Mechanical rename, 3 importers.
- **quote[1]:** MEDIUM. Two distinct, both-live files share a name with non-overlapping exports at different layers. The highest-friction navigation hazard found: "open the metering service" is a 50/50 coin flip on the wrong file.
- **rationale:** The finding is a filename collision between services/metering.ts (quota math) and services/billing/metering.ts (DB mutators) — a navigation hazard requiring a mechanical rename. None of the 20 canonical-set members (ontology.md, domain-model.md, data-model.md, prd.md, compliance register, ADRs 0000–0016, model register) concern billing metering, quota math, or service-layer file naming. This is a billing/quota subsystem code-quality issue; no identity-foundation brief member can be cited to bring it in-scope. The finding's own declared workstream (architecture) is the natural owner.

### F-010 — Half-migrated billing domain — four flat files never moved into billing/ or made facades

- **workstream:** architecture · **domain:** architecture / domain-organisation
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** P2 \| MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-P2-4` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/SUMMARY-prioritized.md` — evidence: apps/api/src/services/stripe.ts; apps/api/src/services/subscription.ts; apps/api/src/services/billing-pricing.ts
  - `deep-review/arch-whole-repo::arch-whole-repo-MEDIUM-6` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/services/stripe.ts; apps/api/src/services/subscription.ts; apps/api/src/services/billing-pricing.ts
- **quote[0]:** **Half-migrated billing domain** — `billing/` folder exists but 4 flat files (`stripe.ts`, `subscription.ts`, `metering.ts`, `billing-pricing.ts`) never moved in or became facades.
- **quote[1]:** MEDIUM. The billing domain is half-migrated: a `billing/` folder exists, but four Sprint-9-era flat files never moved in and never became facades. New contributors can't tell which file is canonical.
- **rationale:** F-010 concerns billing-domain source file organization — four flat files never moved into billing/ or made facades. None of the 20 canonical-set members (docs/canon/identity/*, MMT-ADR-0000/0001/0002/0007-0016, the LLM register, the compliance register) govern billing code layout. The CANONICAL-SET.md correction block explicitly excludes MMT-ADR-0004 (mobile-IAP rails) as "billing mechanism, not core identity canon," confirming billing structure is outside identity-foundation scope. The finding is real but owned by the architecture/service-layer workstream.

### F-011 — Runtime cycle: curriculum.ts ⇄ language-curriculum.ts (back-dispatch smell)

- **workstream:** architecture · **domain:** architecture / circular-dependencies
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** P2 \| MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-P2-5` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/SUMMARY-prioritized.md` — evidence: apps/api/src/services/curriculum.ts:58; apps/api/src/services/language-curriculum.ts:9; apps/api/src/services/exchanges.ts; apps/api/src/services/exchange-prompts.ts
  - `deep-review/arch-whole-repo::arch-whole-repo-MEDIUM-4` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/services/curriculum.ts:58; apps/api/src/services/language-curriculum.ts:9
- **quote[0]:** **2nd runtime cycle** `curriculum.ts ⇄ language-curriculum.ts`; **type-only cycles** (`exchanges`/`exchange-prompts`) — relocate `ExchangeContext` to schemas to kill both.
- **quote[1]:** MEDIUM. True runtime 2-cycle. The language module specializes generic curriculum (`ensureDefaultBook`) while generic curriculum dispatches back into the language path — the back-dispatch is the smell.
- **rationale:** F-011 is a runtime circular dependency between curriculum.ts and language-curriculum.ts, with a recommendation to relocate ExchangeContext to schemas. None of the 20 canonical-set members cover curriculum service architecture, module dependency graphs, or ExchangeContext placement. The canonical set is scoped to identity/tenancy, person-role-consent, the 8-table schema, policy-engine spine, LLM routing/vetting, and safety/judge architecture. No canonical-set member is citable. The finding's own workstream field is already "architecture" — remediation belongs there.

### F-012 — architecture.md warns of a non-existent database→schemas circular dependency (all edges import type)

- **workstream:** architecture · **domain:** documentation / architecture
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** P2 \| MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-P2-6` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/SUMMARY-prioritized.md` — evidence: docs/architecture.md:710-715
  - `deep-review/arch-whole-repo::arch-whole-repo-MEDIUM-2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: docs/architecture.md:710,715; packages/database/src/repository.ts:18
- **quote[0]:** **`database → schemas` doc divergence** — `architecture.md:710-715` warns of a "circular dependency" that doesn't exist (all edges `import type`). Reconcile the doc.
- **quote[1]:** MEDIUM. The architecture doc says `@eduagent/database` has no workspace deps and warns a schemas import would create a "circular dependency." The code diverges: `database` declares and uses `@eduagent/schemas`. **Not an actual cycle** — every edge is `import type` (erased at compile time).
- **rationale:** F-012 targets architecture.md — the root estate canon doc that CANONICAL-SET.md explicitly places outside identity-foundation: "The loose root estate canon (architecture.md, PRD.md, ux-design-specification.md) still drains separately in Phase J / Stream 2." None of the 20 canonical-set members covers the database→schemas import-edge section. The finding is a doc-accuracy correction (stale circular-dependency warning where all edges are import type), not an identity-domain concern. No brief member can be cited. Ownership: architecture workstream.

### F-013 — Permissive @nx/enforce-module-boundaries — package direction is review-enforced, not machine-enforced

- **workstream:** architecture · **domain:** architecture / enforcement
- **scope_class:** deferred · **in_scope:** false · **target_workstream:** (none)
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** P2 \| LOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-P2-7` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/SUMMARY-prioritized.md` — evidence: eslint.config.mjs:106
  - `deep-review/arch-whole-repo::arch-whole-repo-LOW-3` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: eslint.config.mjs:106,132
- **quote[0]:** **Permissive nx boundary enforcement** (`eslint.config.mjs:106`) — direction is review-enforced, not machine-enforced. Add layer tags + `depConstraints`; wire `madge --circular` into CI (allow type-only pairs, fail new runtime cycles).
- **quote[1]:** LOW. `@nx/enforce-module-boundaries` is enabled but imposes no directional constraint between packages — direction is enforced only by `package.json` declarations and `no-restricted-imports` governance (G1/G3/G4). The documented one-way flow is review-enforced, not machine-enforced.
- **rationale:** F-013 concerns @nx/enforce-module-boundaries laxity — no directional layer-tag constraints, no madge CI wiring. None of the 20 canonical-set members (L1: ontology, domain-model, data-model, prd, compliance register; L2: MMT-ADR-0000–0016; L3: model register + audit-trail memo) address monorepo tooling, NX boundary enforcement, or circular-dependency detection. This is a repo-wide build/architecture-tooling concern outside the identity-foundation carve-out. No workstream is currently ready to own it, so the finding is deferred with no assigned target.

### F-014 — test-seed.ts size (5,668 LOC) and production-bundle inclusion risk

- **workstream:** architecture · **domain:** architecture / bundle-safety
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** P2 \| MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — quote-not-found: Quote 1 (provenance[0]): text exists in file but split across lines 95-96 with line break/indentation, so exact string match fails
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-P2-8` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/SUMMARY-prioritized.md` — evidence: apps/api/src/services/test-seed.ts; apps/api/src/index.ts:281
  - `deep-review/arch-whole-repo::arch-whole-repo-MEDIUM-7` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/services/test-seed.ts; apps/api/src/index.ts:281
- **quote[0]:** **`test-seed.ts`** (5,668 LOC, mounted gated into the live app) — verify excluded from the deployed Worker bundle.
- **quote[1]:** MEDIUM. By far the largest file; necessarily touches most domains (E2E seed), so high fan-out is expected, but at this size it's a maintenance/review hazard and may inflate the Worker bundle.
- **rationale:** F-014 concerns test-seed.ts file size and Worker bundle inclusion risk — a build/deployment concern. None of the 20 canonical-set members (L1: ontology, domain-model, data-model, prd, compliance-register; L2: ADRs 0000/0001/0002/0007–0016; L3: model register) govern Worker bundle composition, deployment artifact boundaries, or E2E seed file hygiene. No canonical-set citation is possible. The finding is real but owned by the architecture/infrastructure workstream.

### F-015 — system-prompt/events/flag handlers throw raw Error('Session not found') → 500 + spurious Sentry instead of typed 404

- **workstream:** errors-api · **domain:** unknown
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** errors-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): REFUTED. "No member can be cited" is false. getSession(profileId) uses createScopedRepository(profileId), so null conflates not-found with cross-profileId access (session exists, not yours). That is the person-scoped data-access boundary two canon members own: data-model.md L358 ("person_id is the scope key for all learning data") and domain-model.md inv 7/8 ("no data access without an edge"; "Self-ownership intrinsic to Person"). The raw Error masks unauthorized cross-profile access as a 500, weakening auditability of an IF invariant. A member IS citable, so canonical_set_source="" is wrong; scope is mixed (throw-pattern is shared errors-api), a flag-to-human case. \| quote-not-found: provenance[1] quote not found in cited source_path .deepsec/findings/BUG/eduagent-build-other-error-handling-72f9b181bc.md (file does not exist at repo root; similar content exists in _dev/eduagent-build variant but not exact quote)
- **provenance:**
  - `deep-review/errors-api::errors-api-critic-1` — src: `/Users/vetinari/nexus/_dev/eduagent-build/.deepsec/findings/BUG/eduagent-build-other-error-handling-72f9b181bc.md` — evidence: apps/api/src/routes/sessions.ts:1268,1283,1336; apps/api/src/services/session/session-crud.ts:1455,1475,1495
  - `root/deepsec-handover::deepsec-BUG-other-error-handling-72f9b181bc` — src: `.deepsec/findings/BUG/eduagent-build-other-error-handling-72f9b181bc.md` — evidence: apps/api/src/routes/sessions.ts:1268-1336
- **quote[0]:** recordSystemPrompt (session-crud.ts L1461-1464), recordSessionEvent (L1481-1484), and flagContent (L1502-1505) throw a raw `new Error('Session not found')` when getSession returns null ... Since a plain Error matches none of the typed branches in the global onError handler (index.ts L304-499), it falls through to captureException(err) + a 500 'Internal server error'.
- **quote[1]:** recordSystemPrompt, recordSessionEvent, and flagContent throw a raw new Error('Session not found') when getSession returns null. The corresponding route handlers do not wrap these calls in try/catch and do not throw the typed NotFoundError, causing the global error handler to emit 500 + Sentry capture instead of 404.
- **rationale:** F-015 is an API error-handling pattern defect: raw new Error bypasses typed branches in the global onError handler, producing 500+Sentry instead of a typed 404. No canonical-set member covers this domain. L1 docs define identity entities/roles/consent; ADRs 0001-0016 govern tenancy, payer capacity, guardianship, policy engine, LLM routing, and safety — none address session-error surfacing or HTTP status mapping. No brief member can be cited to bring this into IF scope. The finding is real and owned by errors-api.

### F-016 — vocabulary review route catch-all misclassifies transient DB errors as 422 and echoes raw err.message to client

- **workstream:** errors-api · **domain:** unknown
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** errors-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote 2 (verbatim_quote[1]): paraphrased, not verbatim. Source has '(lines 102-113)' and 'via isTransientDatabaseError() into a 503' but quote omits both. Quote 1 is verbatim.
- **provenance:**
  - `deep-review/errors-api::errors-api-critic-2` — src: `/Users/vetinari/nexus/_dev/eduagent-build/.deepsec/findings/BUG/eduagent-build-other-error-misclassification-4fb294fb99.md` — evidence: apps/api/src/routes/vocabulary.ts:102-113; apps/api/src/services/vocabulary.ts:246-380
  - `root/deepsec-handover::deepsec-BUG-other-error-misclassification-4fb294fb99` — src: `.deepsec/findings/BUG/eduagent-build-other-error-misclassification-4fb294fb99.md` — evidence: apps/api/src/routes/vocabulary.ts:102-113
- **quote[0]:** A transient Neon/Postgres error thrown inside that transaction is caught here and returned as HTTP 422 VALIDATION_ERROR, instead of propagating to the global onError handler in index.ts which would classify it via isTransientDatabaseError() into a 503 + Retry-After. ... Secondly, the raw `err.message` is returned to the client unconditionally (no production gate), unlike the global handler which suppresses internal messages in production.
- **quote[1]:** In the POST /subjects/:subjectId/vocabulary/:vocabularyId/review handler, the catch block handles VocabularyNotFoundError, then falls through to apiError(c, 422, ERROR_CODES.VALIDATION_ERROR, err instanceof Error ? err.message : 'Vocabulary review failed') for ALL other errors. A transient Neon/Postgres error is returned as HTTP 422 VALIDATION_ERROR, instead of propagating to the global onError handler which would classify it as 503 + Retry-After.
- **rationale:** F-016 concerns two defects in the vocabulary review route: transient DB errors misclassified as 422 instead of 503, and raw err.message leaked to clients in production. Neither defect touches any of the 20 canonical-set members (identity/tenancy ontology, domain/data models, compliance register, ADRs 0000-0016). API error-code classification and response-body information-disclosure are API infrastructure concerns. No canonical-set member can be cited to bring this into identity-foundation scope. Owner: errors-api workstream.

### F-017 — jwt.ts JWKS response shape unvalidated — malformed upstream 200 misclassified as token error → wrongful 401/sign-out + poisoned cache

- **workstream:** errors-api · **domain:** unknown
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** errors-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): The finding sits ON the seam MMT-ADR-0001 draws. ADR-0001 (L24) explicitly names "edge JWT verification" as the capability IF delegates to Clerk; jwt.ts IS that path, so 0001 plausibly OWNS the boundary and the finding should cite 0001 and be in-IF. Failure mode (malformed JWKS to TypeError to wrongful 401 to mass forced sign-out) is credential/session continuity, and 0001 L29 makes Person-Credential lifecycle core IF. The empty canonical_set_source is the tell: classifier claims 0001 governs the boundary yet won't cite it, placing the finding on the far side of a boundary it can't name (the auto-flag case). Repo-verified real. Counter is at least as strong; uncertain so flag to human. \| quote-not-found: Quote 1: Has '...' ellipsis instead of the full error message 'like 'Cannot read properties of undefined (reading find)'' ; Quote 2: Removes backticks around code (`(await res.json()) as JWKS`, etc) and omits line numbers (L124, L178/L185, L166)
- **provenance:**
  - `deep-review/errors-api::errors-api-critic-3` — src: `/Users/vetinari/nexus/_dev/eduagent-build/.deepsec/findings/BUG/eduagent-build-other-error-misclassification-d0408c2485.md` — evidence: apps/api/src/middleware/jwt.ts:124-185; apps/api/src/middleware/auth.ts:166
  - `root/deepsec-handover::deepsec-BUG-other-error-misclassification-d0408c2485` — src: `.deepsec/findings/BUG/eduagent-build-other-error-misclassification-d0408c2485.md` — evidence: apps/api/src/middleware/jwt.ts:124-185
- **quote[0]:** fetchJWKS casts the upstream body with `(await res.json()) as JWKS` (L124) and stores `jwks.keys` with no schema/shape validation. If the JWKS endpoint (or an intermediary) returns malformed JSON lacking a `keys` array, lookupJWKByKid's `jwks.keys.find(...)` (L178/L185) throws a TypeError ... That message does NOT match auth.ts's infra-failure regex `/fetch\|JWKS\|network\|abort/i` (auth.ts L166), so the request is treated as a token-validation failure and returns 401 — which the mobile client treats as session-expired and signs the user out.
- **quote[1]:** fetchJWKS casts the upstream body with (await res.json()) as JWKS with no schema/shape validation. If the JWKS endpoint returns malformed JSON lacking a keys array, lookupJWKByKid's jwks.keys.find(...) throws a TypeError. That message does NOT match auth.ts's infra-failure regex, so the request is treated as a token-validation failure and returns 401 — which the mobile client treats as session-expired and signs the user out.
- **rationale:** F-017 is a runtime error-classification bug in the API's Clerk JWKS middleware: JWKS body cast without schema validation; TypeError bypasses the infra-failure regex; wrongful 401 triggers client sign-out. MMT-ADR-0001 governs the architectural boundary (Clerk for auth only) but does not specify JWKS parsing robustness or error-regex coverage. None of the 20 canonical-set members address auth middleware implementation quality or JWKS shape validation. The defect lives in the API error-handling layer; the finding's own workstream tag (errors-api) is correct.

### F-018 — session-completed-observe schema-drift path logs/captures the full raw event payload, contradicting happy-path suppression

- **workstream:** security-pii-inngest · **domain:** unknown
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Classifier's load-bearing claim — "no canonical-set member governs PII/data-minimization" — is FALSE. Set member #20, the identity-compliance-register, is L1 CANON, not "product level." C-3(a) binds data-minimization (Basis: OSA). The leaked rawData carries profileId (the ADR-0001 identity-graph ID) + failedSteps[].error (free-text from transcript steps). CANONICAL-SET names the register binding IF compliance canon; canon members ARE the Phase-L scope boundary. WEAKNESS: C-3(a) targets guardian-visible schemas not server logs, fires only for minors — citation arguable. But that is exactly when task says refuted=true; a confident out silently drops a PII/identity finding. \| quote-not-found: Provenance[1] source file '.deepsec/findings/MEDIUM/eduagent-build-other-info-disclosure-d80cbd96fe.md' does not exist in Nexus repo ; Quote[1] paraphrased; audit contains verbatim with backticks, line refs (L42-51, L83-91, L121-129, L139), and extended explanation not in quote[1]
- **provenance:**
  - `deep-review/security-pii-inngest::security-pii-inngest-critic-1` — src: `/Users/vetinari/nexus/_dev/eduagent-build/.deepsec/findings/MEDIUM/eduagent-build-other-info-disclosure-d80cbd96fe.md` — evidence: apps/api/src/inngest/functions/session-completed-observe.ts:44,50,84,90,122,128,139
  - `root/deepsec-handover::deepsec-MEDIUM-other-info-disclosure-d80cbd96fe` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-info-disclosure-d80cbd96fe.md` — evidence: apps/api/src/inngest/functions/session-completed-observe.ts:44-139
- **quote[0]:** On a schema-validation failure, all three handlers log and capture the entire unvalidated payload: `logger.error(..., { issues, rawData: event.data })` and `captureException(..., { extra: { issues, rawData: event.data } })` (L42-51, L83-91, L121-129). The happy path for sessionCompletedWithErrors deliberately logs only step NAMES and never the error strings: `failedSteps: data.failedSteps.map((s) => s.step)` (L139).
- **quote[1]:** On a schema-validation failure, all three handlers log and capture the entire unvalidated payload: logger.error(..., { issues, rawData: event.data }) and captureException(..., { extra: { issues, rawData: event.data } }). The happy path for sessionCompletedWithErrors deliberately logs only step NAMES and never the error strings — the author intentionally kept failedSteps[].error out of the logs.
- **rationale:** F-018 is a PII-leakage defect in an Inngest handler: schema-validation failure paths log and capture the full raw payload (rawData: event.data) while the happy path deliberately suppresses sensitive fields. No canonical-set member governs Inngest handler error-path logging or PII scrubbing in Sentry. The compliance register records COPPA/GDPR obligations at product level — not a remediation scope boundary for observability defects. No canonical-set citation supports identity-foundation ownership. The finding's workstream label (security-pii-inngest) is the correct owner.

### F-019 — freeform-filing retry transmits minor's transcript to external LLM without re-checking GDPR consent

- **workstream:** security-pii-inngest · **domain:** unknown
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** docs/compliance/identity-compliance-register.md (J0 member — GDPR binding rules); MMT-ADR-0015 (consent authority / data access capability split)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): REAL: freeform-filing.ts lacks isGdprProcessingAllowed; siblings gate transmission with it. In-IF-scope: (1) "define=IF, enforce=other" misreads C-1. The register C-1 member embeds enforcement: "Guard test required (CI guard failing if a minor path reaches an unpapered model)." A missing guard is the canon's own unmet deliverable, not a generic chore. (2) Self-refuting: every authority cited to push it OUT (register, ADR-0015) is an IF set member; the obligation lives only in IF canon. (3) target security-pii-inngest has NO canonical_set_source — no member ratifies it; routing OUT rests on an uncitable boundary, IN ties to a named member. Counter at least as strong; default refuted=true. \| quote-not-found: provenance[1] source_path does not exist in nexus repo (.deepsec/findings/MEDIUM/... not found) ; Quote 1 is NOT verbatim: actual file text includes '— either from...by self-healing...' and '— the regulated processing act under GDPR Art. 7(3).' that quote omits; text is interrupted by additional content ; Quote 2 cannot be verified: source file for provenance[1] does not exist
- **provenance:**
  - `deep-review/security-pii-inngest::security-pii-inngest-critic-2` — src: `/Users/vetinari/nexus/_dev/eduagent-build/.deepsec/findings/MEDIUM/eduagent-build-other-missing-gdpr-consent-gate-dec2b0cc7d.md` — evidence: apps/api/src/inngest/functions/freeform-filing.ts:148-176
  - `root/deepsec-handover::deepsec-MEDIUM-other-missing-gdpr-consent-gate-dec2b0cc7d` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-missing-gdpr-consent-gate-dec2b0cc7d.md` — evidence: apps/api/src/inngest/functions/freeform-filing.ts:148-176
- **quote[0]:** The `app/filing.retry` handler (`runFreeformFiling`) builds a session transcript and passes it to `fileToLibrary({ sessionTranscript, sessionMode }, libraryIndex, routeAndCall)` (L169-176). `fileToLibrary` (services/filing.ts:306-344) embeds the transcript into a prompt and calls `routeAndCall(messages, 1)`, transmitting the learner's conversation to an external LLM provider. This handler does NOT call `isGdprProcessingAllowed(db, profileId)` before that transmission.
- **quote[1]:** The app/filing.retry handler (runFreeformFiling) builds a session transcript and passes it to fileToLibrary({ sessionTranscript, sessionMode }, libraryIndex, routeAndCall) — fileToLibrary embeds the transcript into a prompt and calls routeAndCall(messages, 1), transmitting the learner's conversation to an external LLM provider. This handler does NOT call isGdprProcessingAllowed(db, profileId) before that transmission.
- **rationale:** The violated GDPR consent obligation is named in the canonical set (compliance register, MMT-ADR-0015 consent-authority split), so the set touches this domain. However, the finding is not a gap in the identity model — it is an enforcement failure: runFreeformFiling skips isGdprProcessingAllowed before transmitting transcript PII to an external LLM. Defining the consent contract is identity-foundation work; patching call sites across Inngest handlers is security-pii-inngest's mandate, which owns cross-cutting PII-transmission enforcement and analogous missing-guard gaps.

### F-020 — recordChildCapNotificationForSubscription does not re-verify child belongs to subscription's account (cross-account minor name leak)

- **workstream:** security-pii-inngest · **domain:** Authorization (cross-tenant defense-in-depth)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM \| P1 · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Wrongly excluded as billing-only with empty cite. Defect breaches named IF canon: a child displayName shown to an owner whose account the child may not belong to = unverified cross-account person-visibility. Maps to ontology.md inv 8 (access to ANOTHER Person's data is edge-derived), inv 9 (visibility edge-scoped), MMT-ADR-0001 (edge-scoped authz). Scope = which CONTRACT is breached, not where the fix lands; the billing guard is the fix SITE, not the invariant. The "ADR-0001 owns primitives not consumers" line is the error: a consumer violating an owned IF invariant is in-scope. canonical_set_source should be ontology inv 8/9, not empty; empty cite must auto-flag. refuted=true is safe.
- **provenance:**
  - `deep-review/security-pii-inngest::sec-M1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/security-reviewer.md` — evidence: apps/api/src/services/child-cap-notifications.ts:178-189; apps/api/src/inngest/functions/notify-parent-child-cap-hit.ts:20-28
  - `deep-review/security-pii-inngest::summary-P1-child-cap-escalation` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/SUMMARY-prioritized.md` — evidence: apps/api/src/services/child-cap-notifications.ts:178-189; apps/api/src/inngest/functions/notify-parent-child-cap-hit.ts:20-28
- **quote[0]:** The handler for `app/billing.profile_quota.exhausted` takes `subscriptionId` and `childProfileId` from the event payload. The service resolves `ownerProfileId` from `subscriptionId` (`findOwnerProfileIdBySubscription`, lines 59-72) but then inserts a `childCapNotifications` row pairing that owner with `input.childProfileId` **without checking that `childProfileId` belongs to the same account/subscription**. `listActiveChildCapNotifications` (lines 117-141) later joins `profiles.displayName` on that `childProfileId` and shows it to the owner.
- **quote[1]:** **Why P1 (raised from MEDIUM):** cross-account exposure of a **minor's name**, the fix is a one-query ownership check + a "break" test, and CLAUDE.md mandates the consumer re-validate. Gated today only because the sole producer (`billing/metering.ts`) validates the pairing — i.e. this consumer defends at one end where the rest of the surface defends at both.
- **rationale:** F-020 is a billing-layer Inngest defect: the billing.profile_quota.exhausted consumer fails to re-verify childProfileId belongs to the subscription's account before inserting a childCapNotifications row, leaking a minor's displayName. No canonical-set member owns that handler. The compliance register names COPPA/GDPR obligations but is not the fix site. MMT-ADR-0001 owns identity/tenancy graph primitives, not billing consumers that neglect to call them. Fix is a one-query ownership guard in the billing/Inngest layer; no IF surface changes needed.

### F-021 — Untrusted-data casts at trust boundaries — JWT, LLM providers, curriculum generation, and lower-priority sites cast without zod validation

- **workstream:** security-pii-api · **domain:** Type Safety — Trust Boundaries (Auth/JWT)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** YELLOW-RED · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Classifier blanket-assigned a BUNDLED finding to security-pii-api, canonical_set_source="", claiming no member governs it. False for the JWT slice: MMT-ADR-0001 rules the JWT a transport for a resolved decision; domain-model.md:103 and ontology.md:192 name those claims the AgeConsentDecision transport (ageBand/consentStatus/assuranceLevel). The cast at jwt.ts:69,81 (sub unvalidated, mistyped claims flowing downstream) sits ON the consent/age-gating seam the carve-out owns, so the cite must be ADR-0001, not empty. Classifier is right the LLM/curriculum casts belong elsewhere. Real defect is bundling: split JWT (in-IF-scope) from LLM casts; empty cite on a citable slice is the auto-flag.
- **provenance:**
  - `root/architecture-audit::architecture-audit-F2a` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/middleware/jwt.ts:69,81,124,151
  - `root/architecture-audit::architecture-audit-F2b` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/services/llm/providers/anthropic.ts:174, apps/api/src/services/llm/providers/openai.ts:157,254,285, apps/api/src/services/llm/providers/gemini.ts:236,293
  - `root/architecture-audit::architecture-audit-F2c` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/services/curriculum.ts:127
  - `root/architecture-audit::architecture-audit-F2d` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/services/billing/monthly-report.ts:307, apps/api/src/services/llm/embeddings.ts:136, apps/mobile/src/hooks/use-curriculum.ts:203
- **quote[0]:** apps/api/src/middleware/jwt.ts:69,81 — JSON.parse(base64UrlDecode(...)) as JWTPayload/JWTHeader. Signature verification runs but does not validate claim *types*; a signed token with non-string sub flows into every downstream user lookup mistyped. apps/api/src/middleware/jwt.ts:124,151 — (await res.json()) as JWKS fed straight into crypto.subtle.importKey with no structural validation.
- **quote[1]:** apps/api/src/services/llm/providers/anthropic.ts:174, openai.ts:157,254,285, gemini.ts:236,293 — raw provider bodies cast to TS interfaces; a shape change or error envelope yields undefined content stored as empty transcript text rather than a surfaced error.
- **quote[2]:** apps/api/src/services/curriculum.ts:127 — JSON.parse(jsonStr) as GeneratedTopic[] writes curriculum DB rows with no zod check, while every sibling generator (book-generation.ts, filing.ts) validates. Clear outlier.
- **quote[3]:** Lower-priority same class: monthly-report.ts:307 (as Partial<MonthlyReportData> bypasses the existing SchemaDriftError pattern); embeddings.ts:136 (Voyage json.data[0] crashes on error body); apps/mobile/src/hooks/use-curriculum.ts:203 (as unknown as double-cast on API response — use Hono RPC inferred type).
- **rationale:** F-021 is an input-validation hardening finding — raw TS casts at trust boundaries (JWT claims, LLM provider bodies, curriculum JSON.parse, misc sites) without Zod validation. No canonical-set member governs this. MMT-ADR-0001 decides tenancy-graph ownership vs. Clerk, not claim-type validation. MMT-ADR-0014/-0016 govern routing/vetting split and judge safety — not provider response parsing. Domain docs and compliance register define the identity/consent model; none mandate Zod hardening here. The assigned workstream security-pii-api is the correct owner.

### F-022 — Silent-failure catch blocks across billing/session/family — bare catch or empty return with no log/escalation

- **workstream:** errors-api · **domain:** Silent Failures — Billing / Timezone
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** errors-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** YELLOW-RED · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): REFUTE. Empty canonical_set_source is the schema auto-flag, not a clearance. A named member plausibly owns part: data-model.md (L1 #3) governs subscription, payer_person_id (ADR-0002), and family-downgrade lifecycle (line 427: membership add, org decommission, payer placement). Cited downgradeAllFamilyProfiles silent return-[] (dangling entitlements) mutates the membership/subscription tenancy graph ADR-0010/0002 define, so "touches none" is false for that sub-item. It is a BUNDLE; one out-of-scope verdict mis-assigns the IF-touching family piece. Honest counter: primary axis is runtime catch-discipline, which IF target-schema canon does not clearly own. Uncertain, flag. \| quote-not-found: F3a (billing.ts:579-591): Audit claims 'bare catch {} does not log'; actual code has logger.warn + captureException. Finding contradicts code state — outdated.
- **provenance:**
  - `root/architecture-audit::architecture-audit-F3a` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/routes/billing.ts:579-591
  - `root/architecture-audit::architecture-audit-F3b` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/services/session/session-crud.ts:326-339
  - `root/architecture-audit::architecture-audit-F3c` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/services/session/session-exchange.ts:1647-1654
  - `root/architecture-audit::architecture-audit-F3d` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/services/billing/family.ts:233, apps/api/src/services/billing/family.ts:582
  - `root/architecture-audit::architecture-audit-F3e` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/services/billing/revenuecat-webhook-handler.ts:652-673
- **quote[0]:** apps/api/src/routes/billing.ts:579-591 — bare catch {} on timezone resolution silently scopes per-profile daily usage to UTC on a bad IANA string; its sibling billing/family.ts:172 logs the identical fallback, this one does not. (CRITICAL.)
- **quote[1]:** apps/api/src/services/session/session-crud.ts:326-339 — parseTopicIntentMatcherResponse catch { return null } with no log; a systematic LLM-JSON regression silently routes every session to fallbackTopicId. (HIGH.)
- **quote[2]:** apps/api/src/services/session/session-exchange.ts:1647-1654 — catch → return [] on prior-summaries query logs warn but no captureException; caller can't distinguish "first session" from "DB error." (HIGH.)
- **quote[3]:** apps/api/src/services/billing/family.ts:233 (listFamilyMembers) and :582 (downgradeAllFamilyProfiles) — return [] on missing subscription with no log; downgrade no-op could leave dangling entitlements. (HIGH/MEDIUM.)
- **quote[4]:** apps/api/src/services/billing/revenuecat-webhook-handler.ts:652-673 — handleNonRenewingPurchase returns null for both idempotent-skip and success; caller can't alert differently and a silent grant failure still returns HTTP 200. (HIGH.)
- **rationale:** F-022 covers silent-failure catch blocks in billing, session-crud/exchange, billing/family, and the RevenueCat webhook handler. No canonical-set member covers this: the set addresses identity tenancy (ADR-0001/0007), guardianship (0008), age/consent transitions (0009), family-join (0010), data model (0011/0015), policy-engine (0013), LLM router/vetting (0014), judge architecture (0016), and COPPA/GDPR compliance. Error-handling observability in billing and session services touches none of these surfaces. The source audit labels workstream errors-api, the correct owner.

### F-023 — Unmetered LLM endpoint POST /sessions/:id/quick-check bypasses quota — evaluateQuickCheckAnswer calls routeAndCall unmetered

- **workstream:** security-pii-api · **domain:** expensive-api-abuse
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Classifier missed an IF hook. Source 656b9e07af (verbatim): quick-check unmetered means the proxy-mode guard "(assertNotProxyMode at metering.ts:549) is also skipped, so a parent in proxy mode on a child session can drive these LLM calls too." Verified: assertNotProxyMode runs ONLY inside the middleware, so any isLlmRoute-rejected path bypasses the proxy guard. That guard enforces guardian act-for — a canonical concept: prd.md:311 "Guardian act-for \| proxy mode / isParentProxy" (member #4). canonical_set_source should be prd.md, not "". Not purely a quota gap; it voids a guardian-act-for authz boundary IF owns — at minimum shared/contested, so clean in-other-workstream erases the IF overlap. \| quote-not-found: Quote 1: File has (services/assessments.ts:425-453) and (middleware/metering.ts) and (lines 135-229) that task quote omits. Task provides a simplified version without file/line references. ; Quote 2: File uses backticks around code terms and has (apps/api/src/routes/assessments.ts:370-416) and (apps/api/src/middleware/metering.ts) and (lines 140-248) references that task quote omits. File says 'short-circuits and skips' vs task 'skips'. File uses … character, task uses ...
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-expensive-api-abuse-656b9e07af` — src: `.deepsec/findings/MEDIUM/eduagent-build-expensive-api-abuse-656b9e07af.md` — evidence: apps/api/src/routes/assessments.ts:370-407
  - `root/deepsec-handover::deepsec-MEDIUM-expensive-api-abuse-7ebe479378` — src: `.deepsec/findings/MEDIUM/eduagent-build-expensive-api-abuse-7ebe479378.md` — evidence: apps/api/src/services/assessments.ts:425-446
- **quote[0]:** The quick-check handler (routes/assessments.ts:370-416) calls evaluateQuickCheckAnswer(...), which invokes routeAndCall(messages, 2, ...) — a billable Gemini LLM call. However, the metering middleware gates LLM consumption purely by request-path regex (LLM_ROUTE_PATTERNS_ANY_METHOD / LLM_ROUTE_PATTERNS_POST_ONLY), and NO pattern matches '/sessions/<uuid>/quick-check'.
- **quote[1]:** evaluateQuickCheckAnswer (lines 425-453) calls the LLM unconditionally via routeAndCall(messages, 2, ...) (line 446, Gemini Flash). It is exposed at POST /v1/sessions/:sessionId/quick-check. Quota/abuse protection for LLM routes is enforced ONLY by meteringMiddleware, which skips metering for any path not matching LLM_ROUTE_PATTERNS_ANY_METHOD or LLM_ROUTE_PATTERNS_POST_ONLY. The quick-check path matches NEITHER list.
- **rationale:** F-023 is a quota-enforcement gap: meteringMiddleware regex patterns miss POST /sessions/:id/quick-check, leaving evaluateQuickCheckAnswer's Gemini call unmetered. No canonical-set member covers metering middleware or abuse-rate protection. MMT-ADR-0013/0014 govern model selection and router/vetting split — not consumption accounting. MMT-ADR-0016 covers judgment-based safety. The compliance register covers COPPA/GDPR/OSA. No member can be cited as IF ownership basis. The finding's stated workstream (security-pii-api) is the correct owner.

### F-024 — id-token:write granted to Claude review/agent jobs with no OIDC exchange step (unnecessary credential surface)

- **workstream:** security-pii-api · **domain:** oidc-misuse
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — quote-not-found: Quote 1: Paraphrased/truncated. Missing backticks and text '(L190/202/212)...should be dropped per least privilege.' Actual source continues beyond 'through an LLM.' ; Quote 2: Paraphrased/truncated. Missing '(AWS/GCP/Azure)', 'runs with...Bash (L57 commented out) and', '$ACTIONS_ID_TOKEN_REQUEST_URL', and closing 'Granting this permission to an LLM-agent job...'
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-oidc-misuse-1d14c01b7b` — src: `.deepsec/findings/MEDIUM/eduagent-build-oidc-misuse-1d14c01b7b.md` — evidence: .github/workflows/claude-code-review.yml:31
  - `root/deepsec-handover::deepsec-MEDIUM-oidc-misuse-b87a5f8435` — src: `.deepsec/findings/MEDIUM/eduagent-build-oidc-misuse-b87a5f8435.md` — evidence: .github/workflows/claude.yml:30
- **quote[0]:** The claude-review job grants id-token: write (L31) but no step requests or uses an OIDC token; authentication to the action is via the explicit secrets.CLAUDE_CODE_OAUTH_TOKEN. This is an unnecessary credential-surface grant on a job that ingests untrusted PR content through an LLM.
- **quote[1]:** The claude job declares id-token: write (L30), which lets the runner mint OIDC tokens that can be federated into cloud roles if a trust policy references this repo/workflow. No step in the job performs an OIDC exchange — the only credential actually used is the OAuth token (L45). Because the agent is driven by attacker-influenced text, a successful prompt injection combined with any weakening of the author gate could request an OIDC token and exchange it for cloud credentials.
- **rationale:** F-024 is about GitHub Actions workflow permission hygiene — `id-token: write` granted to CI jobs processing attacker-influenced PR content with no OIDC exchange step. No member of the identity-foundation canonical set (locked 2026-06-08, 20 members) covers CI/CD credential scoping or runner permissions. The set covers the identity/tenancy domain model, ADRs 0000–0016, and the LLM routing register — none touch CI/CD infrastructure security. This is a DevSecOps hardening finding owned by the security-pii-api workstream.

### F-025 — Out-of-range private_sources.factual_confidence (>1) rejects the ENTIRE LLM envelope — drops reply + all state signals

- **workstream:** errors-api · **domain:** other-envelope-hardfail-on-noncritical-field
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** errors-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Empty canonical_set_source is the tell — a named member owns the broken invariant. Scope test = does a member own the invariant, not does canon spec Zod .catch() syntax. MMT-ADR-0016 §1 (member #17) canonizes "envelope integrity is load-bearing for the state machine" and makes envelope-gating the age-safety control. F-025 fails the whole envelope, dropping ready_to_finish + judge safety signals. ADR-0014 §6 attaches age-appropriateness to the envelope; the buggy factual_confidence is 0.0–1.0, ADR-0013's load-bearing knowledge-axis range. Steelman: fix is a pure schema edit, envelope predates IF — but that's remediation-routing, not scope. Citable member left blank; default-refute. \| quote-not-found: Quote 1 (provenance[0]): 'privateFactualConfidenceSchema is z.preprocess(fn, z.number().min(0).max(1).optional())...' — NOT FOUND. Actual text at line 13 uses backticks and '(1) The preprocessor...(2) Because...' structure. ; Quote 2 (provenance[1]): '`privateFactualConfidenceSchema` (L32-39) is `z.preprocess...` The number path short-circuits...' — NOT FOUND. Actual text at line 23 starts 'Verified the failure chain end to end' and differs in wording.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-envelope-hardfail-93c9f9a13b` — src: `.deepsec/findings/BUG/eduagent-build-other-envelope-hardfail-on-noncritical-field-93c9f9a13b.md` — evidence: packages/schemas/src/llm-envelope.ts:32-74
  - `root/deepsec-handover::deepsec-handover-critic-1` — src: `.deepsec/findings/BUG/eduagent-build-other-envelope-hardfail-on-noncritical-field-93c9f9a13b.md` — evidence: .deepsec/findings/BUG/eduagent-build-other-envelope-hardfail-on-noncritical-field-93c9f9a13b.md line 5: Slug `other-envelope-hardfail-on-noncritical-field`
- **quote[0]:** privateFactualConfidenceSchema is z.preprocess(fn, z.number().min(0).max(1).optional()) with NO .catch(). The preprocessor only applies percentage normalization on the STRING path; the number path short-circuits, so a bare numeric value > 1 is returned verbatim. Because the field has no .catch(), when the inner z.number().max(1) rejects that value, the top-level llmResponseEnvelopeSchema fails entirely.
- **quote[1]:** `privateFactualConfidenceSchema` (L32-39) is `z.preprocess(fn, z.number().min(0).max(1).optional())` with NO `.catch()`. The number path short-circuits: `if (typeof value === 'number') return value` — bare numeric value > 1 returned verbatim. Because the field has no `.catch()`, inner `z.number().max(1)` rejects it, `privateSourcesSchema` fails, `llmResponseEnvelopeSchema` fails.
- **rationale:** F-025 is a Zod schema robustness defect: `privateFactualConfidenceSchema` lacks `.catch()`, so an out-of-range numeric value fails the entire `llmResponseEnvelopeSchema` parse. This is an implementation bug in the shared envelope parsing layer, not an identity/routing architecture gap. No canonical-set member governs Zod `.catch()` placement on envelope fields. MMT-ADR-0014's fail-closed rule applies to routing decisions, not envelope field validation errors. The source's own `errors-api` workstream classification is correct — envelope parsing robustness is an API error-handling concern.

### F-026 — Mode-switch error row renders hardcoded English literals bypassing i18n

- **workstream:** l10n-a11y-mobile · **domain:** other-i18n-untranslated-strings
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Classifier's claim is categorical: "None of the 20 members address this," cite="". That overclaims. The finding sits in ModeSwitcher.tsx, which consumes useNavigationContract and renders Study<->Family tabs off useAppContext().mode — the role/tenancy-derived nav surface the IF carve-out reworks. A canon member names it: prd.md (#4) Part-9 crosswalk + "Two-vocabulary risk" rules on resolveNavigationContract vs resolveTabShape/isOwner. So a host-component cite exists, contradicting "none." Caveat: the DEFECT is pure i18n/a11y string coverage, orthogonal to identity. Close, but the categorical "none" is the weak point and a wrong scope call costs more than a flag. \| quote-not-found: Quote 1: 'The component obtains the translate function (const { t } = useTranslation())...Dismiss" (L133).' — Found in narrative form in .deepsec file line 13, but NOT as exact verbatim standalone quote. Paraphrased within longer paragraph. ; Quote 2: 'The error-row UI renders hardcoded English literals instead of going through `t()`...Dismiss" (L133).' — Found in .deepsec file line 13 within the narrative, NOT as exact verbatim text. Embedded in larger synthesized paragraph.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-i18n-untranslated-0cc33085a0` — src: `.deepsec/findings/BUG/eduagent-build-other-i18n-untranslated-strings-0cc33085a0.md` — evidence: apps/mobile/src/components/chrome/ModeSwitcher.tsx:116-133
  - `root/deepsec-handover::deepsec-handover-critic-2` — src: `.deepsec/findings/BUG/eduagent-build-other-i18n-untranslated-strings-0cc33085a0.md` — evidence: .deepsec/findings/BUG/eduagent-build-other-i18n-untranslated-strings-0cc33085a0.md line 5: Slug `other-i18n-untranslated-strings`
- **quote[0]:** The component obtains the translate function (const { t } = useTranslation()) and uses it correctly for the tab labels. However, the error-row UI renders hardcoded English literals: "Couldn't switch. Tap to try again." (L116), the retry button's accessibilityLabel="Retry mode switch" (L122), and accessibilityLabel="Dismiss" (L133).
- **quote[1]:** The error-row UI renders hardcoded English literals instead of going through `t()`: "Couldn't switch. Tap to try again." (L116), the retry button's `accessibilityLabel="Retry mode switch"` (L122), and `accessibilityLabel="Dismiss"` (L133).
- **rationale:** F-026 is about hardcoded English literals in a mode-switch error row UI component bypassing `t()`. None of the 20 canonical-set members address UI string localization or mobile accessibility labels — the set is bounded to identity/tenancy domain model, person/role/consent ADRs (0001, 0002, 0007–0016), LLM routing/safety architecture, compliance register, and the meta-ADR 0000. No canonical-set member can be cited to bring this into identity-foundation scope. The finding's own workstream tag `l10n-a11y-mobile` is the correct owner.

### F-027 — ThemedMarkdown renders LLM markdown with no onLinkPress / allowedImageHandlers — arbitrary-URL link nav + zero-click remote image load

- **workstream:** security-pii-api · **domain:** other-untrusted-markdown-link-and-image-injection
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Empty-citation out-of-scope is overconfident: compliance-register (member 20) reaches the HARM via COPPA disclosure (C-2) and OSA child-safety (C-3). The zero-click image-exfil IS unauthorized child-data disclosure: an LLM image URL leaks IP plus context on render. Finding evidence is family-account, not self-XSS: child on parent account, recaps surface content cross-party. Classifier judged only the render MECHANISM (no ADR governs markdown handlers) and missed scope attaching via the protected INTEREST. canonical_set_source should be the register, not blank. Concede: register states policy not fixes; finding self-tags mobile. Ambiguous, so contested: flag-to-human. \| quote-not-found: Quote 2: paraphrase not verbatim in unvalidated-link-navigation file, line 13 has different wording ; Quote 3: paraphrase not verbatim in untrusted-markdown file, line 29 Revalidation section has similar but rewording
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-other-untrusted-markdown-link-88b9b774a8` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-untrusted-markdown-link-and-image-injection-88b9b774a8.md` — evidence: apps/mobile/src/components/session/MessageBubble.tsx:218-261
  - `root/deepsec-handover::deepsec-MEDIUM-other-unvalidated-link-navigation-4335e6910a` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-unvalidated-link-navigation-4335e6910a.md` — evidence: apps/mobile/src/components/common/ThemedMarkdown.tsx:106-128
  - `root/deepsec-handover::deepsec-handover-critic-3` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-untrusted-markdown-link-and-image-injection-88b9b774a8.md` — evidence: .deepsec/findings/MEDIUM/eduagent-build-other-untrusted-markdown-link-and-image-injection-88b9b774a8.md line 5: Slug `other-untrusted-markdown-link-and-image-injection`
- **quote[0]:** MessageBubble renders assistant content as Markdown: displayContent is passed to ThemedMarkdown. ThemedMarkdown overrides only the inline and textgroup rules and passes NO onLinkPress and NO allowedImageHandlers, so react-native-markdown-display@7.0.2 keeps its dangerous defaults.
- **quote[1]:** ThemedMarkdown renders LLM-generated content using react-native-markdown-display@7.0.2. It overrides only the inline and textgroup rules and passes NO onLinkPress handler. The library's default link/blocklink rules therefore call openUrl(node.attributes.href) which invokes Linking.openURL(href) directly with no scheme validation.
- **quote[2]:** `ThemedMarkdown` (apps/mobile/src/components/common/ThemedMarkdown.tsx) overrides only the `inline` and `textgroup` rules and passes NO `onLinkPress` and NO `allowedImageHandlers`, so react-native-markdown-display@7.0.2 keeps its dangerous defaults: LINK rule calls `Linking.openURL(href)` with zero scheme validation; IMAGE rule auto-fetches remote URLs zero-click.
- **rationale:** F-027 targets ThemedMarkdown.tsx — a mobile UI component passing LLM content to react-native-markdown-display with no link-scheme validation or image-fetch guard. None of the 20 canonical-set members governs mobile markdown rendering or link/image handler policy. The L1 compliance register covers COPPA/GDPR at the data/consent layer, not the rendering layer. No ADR (0001-0016) or L1 domain doc reaches this component. The finding self-assigns workstream security-pii-api, the correct owner for mobile/API security concerns outside the identity/tenancy graph.

### F-028 — Minor's full session transcript memoized in step return state (auto-file-session, freeform-filing, topic-probe-extract fetch/load-transcript steps)

- **workstream:** security-pii-inngest · **domain:** PII / Third-Party Sharing (memoized step return)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH \| MEDIUM · **normalized_priority:** P1
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/security-pii-inngest::pii-H3` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/pii-leak-scanner.md` — evidence: apps/api/src/inngest/functions/auto-file-session.ts:71-76
  - `deep-review/security-pii-inngest::pii-H4` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/pii-leak-scanner.md` — evidence: apps/api/src/inngest/functions/freeform-filing.ts:152-159
  - `deep-review/security-pii-inngest::pii-M5` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/pii-leak-scanner.md` — evidence: apps/api/src/inngest/functions/topic-probe-extract.ts:176-179
- **quote[0]:** `step.run('fetch-transcript', …)` **returns** the joined transcript string (`Learner: … / Tutor: …`). A `step.run` return value is memoized into Inngest's third-party state store so it survives replay. The transcript is then only needed by the *next* step (`file-session`, line 87) which already opens its own DB connection. The transcript crosses the third-party boundary purely as a replay convenience.
- **quote[1]:** Same pattern as #3 — `step.run('fetch-transcript')` returns the joined transcript; the value is memoized in Inngest state, then consumed only by the `retry-filing` step (line 169) which opens its own DB. NOTE: the Scope Context cites `freeform-filing.ts:151-160` as the *mitigation* pattern for the H1 event-payload issue (it self-heals by re-fetching from DB instead of trusting an event field) — and it *is* correct that the transcript is no longer in the event. But the re-fetched value is **returned from the step**, so it still lands in memoized step state. The mitigation is incomplete for the step-state boundary.
- **quote[2]:** `step.run('load-transcript')` returns the full `history` array; memoized into Inngest state. Consumed only by the next step `extract-signals` (line 184).
- **rationale:** F-028 concerns Inngest step return values memoizing minor session transcripts into Inngest's third-party state store — an async pipeline PII data-boundary issue. The compliance register (docs/compliance/identity-compliance-register.md) supplies normative backing (COPPA/GDPR), but no canonical-set member makes identity-foundation the remediation owner. The fix is a refactor of Inngest step-return patterns, not a change to the identity schema or consent model. The finding's own workstream tag (security-pii-inngest) is correct; that workstream owns the remediation.

### F-029 — Runtime cycle A: consent.ts ⇄ notifications.ts

- **workstream:** architecture · **domain:** architecture / circular-dependencies
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Refuted. "Incidental participation" fails: consent.ts:36 imports ./notifications; notifications.ts:22 imports isGdprProcessingAllowed from ./consent — the cycle's binding symbol IS the GDPR consent gate. Both members are identity surfaces coupled through it; structural. Named members own it: domain-model.md (consent model); compliance-register (GDPR/COPPA, enforced by isGdprProcessingAllowed); ADR-0009 (age/consent). Decisive: consent.ts:197 MINIMUM_AGE=11 is the stale "11+" constraint the brief flags BY NAME as a Phase-J identity cleanup target. Empty canonical_set_source should flag-to-human, not justify exclusion. Bound: a runtime graph defect an architecture cross-cut could own.
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-MEDIUM-3` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/services/consent.ts:33-36; apps/api/src/services/notifications.ts:22
- **quote[0]:** MEDIUM. A true runtime 2-cycle; tolerated only because the imported symbols are functions called later, not load-time values. Fragile to refactor (TDZ/undefined risk) and makes the pair effectively one testable unit.
- **rationale:** F-029 is a runtime circular import between consent.ts and notifications.ts — a module-coupling defect. None of the 20 canonical-set members address import structure or circular dependencies; the set covers ontology, domain/data model contracts, compliance obligations, and ADRs 0000–0016 (identity graph, age/consent policy, payer capacity, LLM routing/safety). That consent.ts participates is incidental — the defect is about load-time coupling, not any identity-foundation contract. No brief member can be cited for IF scope. Natural owner is the architecture workstream.

### F-030 — Type-only cycles (compile-erased) — exchanges ⇄ exchange-prompts

- **workstream:** architecture · **domain:** architecture / circular-dependencies
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Wrong altitude. The cycle's endpoints are IF LLM files: exchanges.ts imports routeAndCall and defines ExchangeContext carrying the routing rung; exchange-prompts.ts owns the general-knowledge axis and builds the prompts (verified, commit 79288101a). They realize MMT-ADR-0014 (router/vetting split, tutor/judge roles) and 0013 (knowledge axes, router key) — canonical-set members. The audit's own fix, moving ExchangeContext into @eduagent/schemas, is an IF contract decision, not architecture housekeeping. A member need not name import graphs to own remediation of its own files; "architecture" is the raw domain field, not a scope ruling. Cite ADR-0014/0013; in_scope=true, or flag.
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-LOW-1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/services/exchanges.ts; apps/api/src/services/exchange-prompts.ts:18
- **quote[0]:** LOW. Reported by madge but the closing edge is `import type`, erased by TS — no runtime initialization hazard today. Still couples files for human/AI navigation, and a careless `import type → value` change would instantly create a real cycle.
- **rationale:** F-030 is a type-only circular import between exchanges and exchange-prompts — a code-quality/module-coupling concern. None of the 20 canonical-set members address import cycle hygiene or internal file-level dependency structure. The LLM ADRs (0013, 0014, 0016) govern behavioral contracts (routing semantics, vetting axes, judge independence), not module dependency graphs. No canonical-set member can be cited to place this in identity-foundation scope. The source audit already tags it workstream "architecture," which is the correct owner.

### F-031 — Other oversized files — navigation and conflict hotspots across API and mobile

- **workstream:** architecture · **domain:** architecture / god-modules
- **scope_class:** deferred · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Classifier line is too narrow: "ADR-0014 governs router behavior, not file organization." MMT-ADR-0014 §3 (canonical member #15) IS a decomposition ruling — vetting vs routing must be "different code paths, schemas, owners" — about the exact file F-031 names (llm/router.ts, verified 1728 LOC). ADR-0014 is scoped Identity Foundation, lockstepped to architecture.md's routing section; its fail-closed CircuitOpenError/routeAndCall live in this file. So canonical_set_source is NOT empty; ADR-0014 is citable. Weakness: ADR-0014's seam is vetting-vs-routing, not F-031's provider-vs-streaming seam — so it's in-IF-scope/contested (flag-to-human), not confident deferral.
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-MEDIUM-9` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/services/llm/router.ts; packages/database/src/repository.ts; apps/api/src/services/exchange-prompts.ts; apps/api/src/routes/sessions.ts
- **quote[0]:** MEDIUM/LOW. Not layering violations, but each concentrates responsibility and is a navigation/change-risk hotspot. `llm/router.ts` is a guarded seam (eval-harness gate by policy) — avoid letting it grow past 1463 LOC / 16 exports without splitting provider-selection from streaming normalization.
- **rationale:** F-031 is a file-size/code-organization risk finding — llm/router.ts at 1463 LOC mixing provider-selection with streaming normalization. No canonical-set member addresses LOC limits or module decomposition policy. MMT-ADR-0014 governs the router's behavioral contract (3-param runtime, fail-closed, vetting split) but not its file organization. MMT-ADR-0016 covers safety/judge architecture, not file size. The eval-harness gate is a change-control policy, not an identity-foundation invariant. This is a genuine architecture-hygiene concern owned by the architecture workstream.

### F-032 — Manual sync points — route mount list, scoped-repo blocks, doc route count, language enums

- **workstream:** architecture · **domain:** architecture / manual-sync-points
- **scope_class:** deferred · **in_scope:** false · **target_workstream:** (none)
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): F-032 fuses four strands; deferring the bundle lets three out-strands (route mounts, doc-count drift, language enums) drag out one in-IF strand. The scoped-repo strand is createScopedRepository re-implementing WHERE profile_id per table — live enforcement of the data-model scope key. data-model.md §5.1 ("person_id is the scope key... migration enforces it") and MMT-ADR-0001 (we own the tenancy graph) own this. A forget-prone per-table profile-scoping list is a tenancy hazard: a missed block = a table unscoped = cross-profile exposure. So canonical_set_source should cite data-model.md §5.1 + ADR-0001, not be empty. Correct: split — scoped-repo in-IF-scope, defer rest. Refuted.
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-MEDIUM-10` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/index.ts; packages/database/src/repository.ts:71; docs/architecture.md:404
- **quote[0]:** MEDIUM/LOW. Forget-prone manual registration lists; the route-count doc drift is benign ("source wins"); the language enums are intentionally divergent and guarded by staleness scripts.
- **rationale:** F-032 covers route-mount registration, scoped-repo hygiene, route-count doc drift, and divergent language enums. None map to any canonical-set member. The set covers identity/tenancy/consent/payer (L1 docs), ADRs 0000-0016, compliance register, and LLM model register. Route mounting, DB access patterns, and i18n enum governance are general application-architecture concerns orthogonal to identity-foundation. No specific brief member can be cited. Source rates these MEDIUM/LOW; enum divergence is intentional and guarded. No workstream currently owns all four.

### F-033 — Ad-hoc error envelopes and missing service-folder graduation rule

- **workstream:** architecture · **domain:** architecture / patterns
- **scope_class:** deferred · **in_scope:** false · **target_workstream:** (none)
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-LOW-2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/routes/account.ts:50; apps/api/src/routes/test-seed.ts:210
- **quote[0]:** LOW. Only 2 ad-hoc `c.json(4xx)` sites across ~200 helper call sites — near-total consistency. No documented rule for when a domain graduates to a folder, so the flat-vs-folder split is a coin flip for new authors.
- **rationale:** F-033 covers API error-envelope consistency and a missing service-folder graduation rule. Neither maps to any canonical-set member. L1 docs cover identity vocabulary/model/PRD/compliance; L2 ADRs cover tenancy, guardianship, age transitions, family-join, data-model, policy-engine, LLM router/vetting, safety/judge; L3 covers the vetted-model register. API response conventions and folder organization are general API/monorepo hygiene outside identity-foundation scope. No canonical-set member can be cited. Source severity is LOW; no workstream is ready to own it — deferred, no target owner.

### F-034 — Type-only layer inversions — services/lib reaching upward into middleware/components

- **workstream:** architecture · **domain:** architecture / layer-boundaries
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): REFUTE. Classifier left canonical_set_source="" (auto-flags) yet ruled "out"; default is flag-to-human when no member is citable. The inverted type is ProfileMeta from middleware/profile-scope — the scoping seam the set OWNS: MMT-ADR-0007 ("scopes all learning data to the human") + data-model.md (profileId enforcement). Consumers family-access.ts + consent are the named heart of the identity SCC in this audit; a type that IS the scoping contract reaching upward is a defect on canon-owned surface, not generic layering. "import type/LOW" is severity, not scope. F-034 is mixed: ProfileMeta limb plausibly in-IF, WelcomeAudience not. Counter at least as strong; empty citation tips it.
- **provenance:**
  - `deep-review/arch-whole-repo::arch-whole-repo-LOW-4` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-29-arch-whole-repo/REPORT.md` — evidence: apps/api/src/services/family-access.ts:13; apps/api/src/services/quiz/orchestrate-round.ts:14; apps/mobile/src/lib/pre-auth-audience.ts:29
- **quote[0]:** LOW. Direction inversions (inner layer reaching into outer), but all `import type` only — erased at compile time, no runtime coupling or cycle.
- **rationale:** F-034 is about import-direction discipline (services/lib reaching into middleware/components via `import type`). None of the 20 canonical-set members addresses module layering rules or import direction — the set covers identity/tenancy domain model, consent/age/payer ADRs (0001–0015), LLM routing (0013–0016), compliance obligations, and the model register. This is a general architecture quality concern; the source audit already tagged it "architecture" / LOW (compile-time only, no runtime coupling). Owner: architecture workstream.

### F-035 — Plaintext Logfire secret-key pair embedded in .claude/settings.local.json

- **workstream:** agent-instructions · **domain:** Security
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** secrets-hygiene
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** CRITICAL · **normalized_priority:** P0
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/agent-instructions::C1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-agent-instructions/agent-instructions-reviewer.md` — evidence: .claude/settings.local.json:7
- **quote[0]:** A `PowerShell(...)` permission allow-rule hard-codes a Logfire credential pair in cleartext: a public token `pk-lf-[REDACTED]` and, critically, a **secret token** `sk-lf-[REDACTED]`, joined as `<pk>:<sk>` inside a base64-encoding command. A leaked `sk-lf-` Logfire write/ingest key allows telemetry injection/exfiltration against the project's Logfire account. It also contradicts the repo's own non-negotiable rule "All secrets are managed through Doppler. Never suggest ... direct ... entry".
- **rationale:** F-035 is a plaintext Logfire `sk-lf-*` credential in `.claude/settings.local.json`. None of the 20 canonical-set members (4 L1 domain docs, compliance register, ADRs 0000/0001/0002/0007-0016, model register, A-vs-B memo) address secrets management or agent-instruction security hygiene. The violated rule ("All secrets managed through Doppler") is a repo-wide CLAUDE.md non-negotiable, not an identity-foundation canon obligation. No canonical-set member can be cited in-IF-scope; finding is real but owned by secrets-hygiene / platform-security.

### F-036 — autoMemoryDirectory points at a different filesystem tree than the live repo

- **workstream:** agent-instructions · **domain:** Correctness / Completeness
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** agent-infrastructure
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Misread of the lens. CANONICAL-SET.md never marks `.claude/memory/` "Not a member." Its watch-out (L115-117) marks one THING — the stale "Strictly 11+" note inside it — out, AND names it a Phase-J cleanup target "Superseded by the 13+ consent-capacity floor," which IS IF canon (prd.md member #4: 13+ floor, sub-13 gated). So the lens itself binds `.claude/memory/` to an active IF task. F-036 is exactly what breaks that task: if autoMemoryDirectory targets a stale checkout, the mandated supersession of the 11+ note silently lands in the wrong tree and looks done while the live repo keeps the stale floor. Citable to prd.md + the Phase-J watch-out. At minimum: flag, don't silently exclude.
- **provenance:**
  - `deep-review/agent-instructions::H1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-agent-instructions/agent-instructions-reviewer.md` — evidence: .claude/settings.local.json:11
- **quote[0]:** `autoMemoryDirectory` = `/Users/vetinari/_dev/eduagent-build/.claude/memory`, but the repo under review is `/Users/vetinari/nexus/_dev/eduagent-build/...`. Both paths exist on disk (likely a stale duplicate checkout or symlink), so memory reads/writes silently land in a **different working tree** than the one the agent is editing. The Session/Memory protocol in `CLAUDE.md`/`AGENTS.md` assumes `.claude/memory/MEMORY.md` is the repo-local memory; this split means memory updates can diverge from the code being changed without any error surfacing.
- **rationale:** F-036 is about a misconfigured `autoMemoryDirectory` path in the agent harness — resolving to a stale duplicate checkout rather than the live repo. None of the 20 canonical-set members cover agent session tooling or `.claude/memory/` path config. CANONICAL-SET.md's watch-out section explicitly marks `.claude/memory/` as "Not a member of this set." The finding is real but is an agent-infrastructure/session-protocol concern owned by the Nexus control-plane layer, not identity-foundation. No brief member can be cited to bring it in scope.

### F-037 — CLAUDE.md and AGENTS.md diverge on skill paths and content beyond cosmetic differences

- **workstream:** agent-instructions · **domain:** Contradictions / Consistency
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** agent-instructions
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Classifier's load-bearing claim is false. It says no canonical-set member governs agent instruction files. But MMT-ADR-0000 (member #5) I.1 lists a "Agent doctrine" layer = CLAUDE.md / AGENTS.md, test: "a LINK to canon instead of a COPY?" The finding — both files carrying divergent COPIES of skill paths — is that exact failure. So a member CAN be cited; canonical_set_source="" and "no member can be cited" are wrong. The out-of-scope outcome may hold (ADR-0000 is repo-wide constitutional governance, finding is identity-agnostic tooling drift), but it rests on a false premise that is the very thing deciding whether agent-doctrine pulls it in. Not cleanly verifiable; flag.
- **provenance:**
  - `deep-review/agent-instructions::H2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-agent-instructions/agent-instructions-reviewer.md` — evidence: CLAUDE.md:40-43; AGENTS.md:68-71; AGENTS.md:23-44
- **quote[0]:** The two governing files give **different instructions for the same action**: Worktree/commit/writing-plans skill references point to `.claude/skills/...` in CLAUDE.md but `.agents/skills/...` in AGENTS.md. Both resolve (the files exist in both trees after sync), so it is not a dead link — but an agent reading one file is told a different canonical location than an agent reading the other. The override table's stated purpose is to prevent "competing guidance," yet the two files themselves now constitute competing guidance.
- **rationale:** F-037 concerns CLAUDE.md/AGENTS.md divergence on skill path references (.claude/skills/ vs .agents/skills/). None of the 20 canonical-set members — four L1 domain docs, compliance register, ADRs 0000/0001/0002/0007-0016, LLM register, or A-vs-B memo — governs agent instruction files or skill path resolution. The canonical set is scoped to identity/tenancy design, persona/age model, data schema, compliance, and LLM routing. Agent instruction consistency is a repo-infrastructure concern. No canonical-set member can be cited to bring it in scope; ownership stays with agent-instructions.

### F-038 — Skill description: fields for code-review and thermo-nuclear-code-quality-review violate the repo's trigger-only rule

- **workstream:** agent-instructions · **domain:** Consistency / Agent Definition
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** agent-instructions
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — quote-not-found: Provided quote is paraphrased, not verbatim. Audit has 'Skill Authoring mandates' (not just 'mandates') plus omitted workflow-shortcut sentence. Skill files at evidence_loc do not exist in repo.
- **provenance:**
  - `deep-review/agent-instructions::M1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-agent-instructions/agent-instructions-reviewer.md` — evidence: .agents/skills/code-review/SKILL.md; .agents/skills/thermo-nuclear-code-quality-review/SKILL.md
- **quote[0]:** CLAUDE.md mandates: *"The `description:` field describes ONLY when to use, not what the skill does. Start with 'Use when …'."* Violations: `code-review`: `"Mandatory code reviews via /code-review before commits and deploys"` — pure workflow summary, no "Use when". `thermo-nuclear-code-quality-review`: leads with workflow (`"Run an extremely strict maintainability review for ... giant files, and spaghetti-condition growth."`) and only then gives triggers.
- **rationale:** F-038 concerns description-field format of two Claude Code skills against the repo's trigger-only skill-authoring rule in CLAUDE.md. None of the 20 canonical-set members — the four L1 domain docs, compliance register, ADRs 0000/0001/0002/0007–0016, the model register, or the A-vs-B memo — govern skill authoring conventions. The set is strictly scoped to identity/tenancy, auth delegation, LLM routing/safety, and policy-engine shape. No member can be cited to bring this into identity-foundation scope. Owning workstream is agent-instructions (already the finding's assigned workstream).

### F-039 — Generated commit skill description is a workflow summary violating trigger-only rule, intentionally diverged from master

- **workstream:** agent-instructions · **domain:** Consistency / Master-Generated drift / Agent Definition
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** agent-instructions
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — quote-not-found: Quote does not match verbatim. Source text includes "- **Issue:**" prefix, backtick example, "allowed to diverge..." and ", independent of the body divergence" phrases absent from provided quote.
- **provenance:**
  - `deep-review/agent-instructions::M2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-agent-instructions/agent-instructions-reviewer.md` — evidence: .claude/skills/commit/SKILL.md:1-13
- **quote[0]:** The master commit description is correctly trigger-only. The generated `.claude/skills/commit/SKILL.md` description is a multi-sentence workflow summary (`"Safe git commit workflow ... Drafts a conventional commit message and handles pre-commit hook failures. Pushes after every successful commit by default ..."`) — exactly the "summarize workflow" pattern the Skill-Authoring rule bans. This divergence is *intentional and documented* (`commit` is in `SKIP_SKILLS` in `sync-skills.mjs:52-59`) — but the **description** still violates the repo's own trigger-only convention.
- **rationale:** F-039 concerns `.claude/skills/commit/SKILL.md` violating the repo's trigger-only Skill Authoring convention. None of the 20 canonical-set members (L1 domain docs, ADRs 0000/0001/0002/0007–0016, LLM model register, compliance register, A-vs-B memo) address skill authoring, developer tooling, or commit workflow descriptions — all are scoped to identity/tenancy/consent/LLM-routing/safety. No canonical-set member can be cited to bring this in-IF-scope. The finding's own workstream field correctly names agent-instructions as owner.

### F-040 — worktree-setup skill description embeds workflow narration after valid trigger opening

- **workstream:** agent-instructions · **domain:** Consistency / Agent Definition
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** agent-instructions
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/agent-instructions::M3` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-agent-instructions/agent-instructions-reviewer.md` — evidence: .agents/skills/worktree-setup/SKILL.md
- **quote[0]:** Starts correctly with "Use when starting isolated work …" but then narrates the workflow: *"Creates a git worktree at .worktrees/<branch>/ from origin/main, runs pnpm install, syncs secrets."* Per the Skill-Authoring rule this is the workflow-summary shortcut hazard; the "how" belongs in the body.
- **rationale:** F-040 is a Skill-Authoring rule violation in the worktree-setup skill description — workflow narration embedded after a valid trigger opening. None of the 20 canonical-set members (L1 domain docs, L2 ADRs 0000–0016, compliance register, LLM-model register, A-vs-B memo) address skill-description conventions or agent-instruction hygiene. The canonical set covers identity-foundation domain canon only. No brief member can be cited for an in-IF-scope call. The finding is real but owned entirely by the agent-instructions workstream.

### F-041 — Stale / imprecise source citations in CLAUDE.md profile-shape section

- **workstream:** agent-instructions · **domain:** Structure / Stale references
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** agent-instructions
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Classifier's key premise is false: it says no canonical member covers the mobile nav contract (resolveTabShape) and sets source="". But member #4, prd.md:318, names resolveTabShape/isOwner and flags the "Two-vocabulary risk": the IF clean cut lands resolveNavigationContract on new {admin,learner} roles, retiring resolveTabShape (map prd.md:305-318). So the nav contract is a named IF target inside canon; guardian/learner tab shapes realize the canon role model (prd.md:59-122). Defect verified real. Empty source auto-flags. Concession: fix is trivial line-rot in non-canon CLAUDE.md; IF arguably owns migrating resolveTabShape, not prose about it. But that does not rescue the wrong rationale.
- **provenance:**
  - `deep-review/agent-instructions::M4` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-agent-instructions/agent-instructions-reviewer.md` — evidence: CLAUDE.md (Profile Shapes); apps/mobile/src/app/(app)/_layout.tsx:122-185; apps/mobile/src/lib/navigation-contract.ts:146,152,163
- **quote[0]:** `_layout.tsx:122` is `function TabIcon(...)`, not the cited V0 helpers (`resolveTabShape`, `computeVisibleTabs`, …). The named tab sets actually live at `navigation-contract.ts:146` (`STUDY_TABS`), `:152` (`FAMILY_TABS`), `:163` (`LEGACY_GUARDIAN_TABS`) — the prose doesn't give line numbers there, but the `_layout.tsx` range appears to have drifted as the file changed. Line-pinned citations in a long-lived instruction doc rot quickly and mislead agents into reading the wrong region.
- **rationale:** F-041 concerns stale line-number citations in CLAUDE.md's profile-shape section (_layout.tsx, navigation-contract.ts). None of the 20 canonical-set members cover CLAUDE.md instruction-doc hygiene or the mobile navigation contract (resolveTabShape, STUDY_TABS, FAMILY_TABS, LEGACY_GUARDIAN_TABS). The canonical set covers identity ontology, domain model, data model, PRD/personas/age-model, compliance register, and identity/policy/LLM-routing ADRs. Tab-shape/navigation-contract doc rot is owned by the agent-instructions workstream — the workstream already assigned to this finding.

### F-042 — scope-keyword-check.sh hook references a non-existent skill and is trivially bypassed by broad skip-regex

- **workstream:** agent-instructions · **domain:** Completeness / Security (defense-in-depth, not exploitable)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** agent-instructions
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/agent-instructions::M5` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-agent-instructions/agent-instructions-reviewer.md` — evidence: .claude/hooks/scope-keyword-check.sh:20,28,34-38
- **quote[0]:** The hook injects `additionalContext` telling the agent it "MUST invoke the `deep-scope-understanding` skill" on scope-risk keywords. But (a) it is a soft prompt nudge with no enforcement; (b) the skip-regex at lines 20 and 28 is broad: any prompt mentioning `commit`, `review`, `PR`, or a `.md/.json/.yaml` filename short-circuits the check (`exit 0`); (c) the referenced skill `deep-scope-understanding` was **not found** among the 17 master or 17 generated skills in this repo.
- **rationale:** F-042 is about scope-keyword-check.sh referencing a non-existent skill and having a broad bypass regex. None of the 20 canonical-set members (four L1 domain docs, compliance register, 13 MMT-ADRs 0000–0016, L3 model register, audit-trail memo) govern repo hook scripts or agent-instrumentation tooling. No canonical_set_source can be cited. The defect is real but belongs to the agent-instructions workstream that already owns these hooks — same workstream the finding was tagged to.

### F-043 — .deepsec/AGENTS.md instructs agents to follow arbitrary per-project SETUP.md — indirect prompt injection surface

- **workstream:** agent-instructions · **domain:** Security (prompt-injection surface)
- **scope_class:** deferred · **in_scope:** false · **target_workstream:** (none)
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/agent-instructions::M6` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-agent-instructions/agent-instructions-reviewer.md` — evidence: .deepsec/AGENTS.md:7-12
- **quote[0]:** This file directs agents to "read `data/<id>/SETUP.md` and follow it" and to "read `node_modules/deepsec/SKILL.md`." Treating per-project SETUP.md files and a `node_modules` skill as instructions to *follow* means any content placed in those locations (including by a scanned third-party project or an npm-installed package) becomes executable agent instruction. This is a classic indirect-prompt-injection channel.
- **rationale:** F-043 concerns prompt injection via .deepsec/AGENTS.md instructing agents to follow arbitrary data/<id>/SETUP.md and node_modules/deepsec/SKILL.md. None of the 20 canonical-set members (CANONICAL-SET.md, locked 2026-06-08) address agent-instruction security or the .deepsec/ tooling surface. The set covers identity ontology, domain/data model, personas, compliance, tenancy ADRs, policy/routing, and safety architecture. No member justifies in-scope for identity-foundation. The finding is real but belongs to an agent-hardening workstream not yet in the runway.

### F-044 — CLAUDE.md forbids /my:commit-old and /zdx:commit but both remain installed and invocable

- **workstream:** agent-instructions · **domain:** Clarity / Hygiene
- **scope_class:** deferred · **in_scope:** false · **target_workstream:** (none)
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/agent-instructions::L1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-agent-instructions/agent-instructions-reviewer.md` — evidence: CLAUDE.md (Git Commits section); .claude/commands/my/commit-old.md
- **quote[0]:** The rule forbids commands that remain installed and invocable, so the only thing stopping their use is the prose. That's acceptable (deprecation-by-doc), but keeping `commit-old.md` around invites accidental use and contradicts the "Clean up all artifacts when removing a feature" guard elsewhere in CLAUDE.md.
- **rationale:** F-044 concerns stale skill artifact files remaining installed despite CLAUDE.md forbidding them. None of the 20 canonical-set members covers developer workflow tooling, skill file lifecycle, or commit-convention enforcement — the set is scoped to identity/tenancy domain (ontology, data model, compliance, policy engine, LLM routing, safety). No named brief member ties to this finding. It is real but belongs to an agent-workflow or dev-experience workstream not yet defined in the current roadmap; no future owner is known, so target_workstream is left empty.

### F-045 — CLAUDE.md is 333 lines and mixes constitution-level rules with command cookbooks, duplicating canonical docs

- **workstream:** agent-instructions · **domain:** Structure / Maintainability
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** agent-instructions
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/agent-instructions::L2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-agent-instructions/agent-instructions-reviewer.md` — evidence: CLAUDE.md (whole file)
- **quote[0]:** The file is well-sectioned but carries a lot of detail (full audience matrix prose, language-enum tables, Handy Commands) that duplicates canonical docs it also points to (`docs/audience-matrix.md`, `docs/architecture.md`). Every token here is paid on each interaction, and the duplicated matrix is a second place to keep in sync.
- **rationale:** F-045 concerns CLAUDE.md size and duplication of canonical docs. None of the 20 canonical-set members (4 L1 domain docs, compliance register, MMT-ADR-0000–0016, model register, A-vs-B memo) govern CLAUDE.md authoring, agent-instruction hygiene, or token-cost optimization. The canonical set is scoped strictly to identity/tenancy domain: ontology, roles, consent, data model, and associated ADRs. CLAUDE.md maintenance is an agent-instructions workstream concern — matching the finding's own assigned workstream. No brief member provides basis for an in-IF-scope claim.

### F-046 — sync-skills.mjs is additive-only; removed master leaves orphaned generated copy that --check won't catch

- **workstream:** agent-instructions · **domain:** Maintainability
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** agent-instructions
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/agent-instructions::L3` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-agent-instructions/agent-instructions-reviewer.md` — evidence: scripts/sync-skills.mjs:144-147
- **quote[0]:** Additive sync never deletes `.claude/skills/<name>/` files whose master was removed; the header documents this trade-off honestly. The risk is a generated copy lingering after its master is deleted, with no `--check` failure (check only flags *missing* content, not *orphaned* content).
- **rationale:** F-046 concerns `sync-skills.mjs` — the script that mirrors `.agents/skills/` into `.claude/skills/`. The defect: additive-only sync leaves orphaned generated copies when a master is deleted, and `--check` won't catch it. No member of the 20-entry canonical set touches agent tooling or skill-sync scripts; the set covers identity ontology, domain/data model, compliance, ADRs 0000–0016, and the LLM model register. No canonical-set member can justify an in-IF-scope call. The finding's own workstream label ("agent-instructions") is the correct owner.

### F-047 — Silent swallow of DB failure when fetching dictation struggles — bare catch {} with no logging or Sentry

- **workstream:** errors-api · **domain:** Silent Failure
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** errors-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/errors-api::errors-api-1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-errors-api/silent-failure-hunter.md` — evidence: apps/api/src/routes/dictation.ts:286-288
- **quote[0]:** [PRE-EXISTING] MEDIUM — Silent swallow of DB failure when fetching dictation struggles - **Location:** `apps/api/src/routes/dictation.ts:286-288` - **Category:** Silent Failure - **Issue:** The `try { ... getLearningProfile(...) ... } catch { /* Graceful degradation */ }` block swallows **all** errors with no `logger` call and no `captureException`. [...] If the learning-profile read starts failing systematically [...], every dictation review silently loses struggle-aware feedback and **ops has zero signal** — you cannot query how often this degradation fires. Not a billing/auth/consent path, so impact is feature-quality, not money/access.
- **rationale:** F-047 is a bare catch{} in apps/api/src/routes/dictation.ts swallowing getLearningProfile DB failures with no logger/Sentry. None of the 20 canonical-set members — four L1 domain docs, compliance register, or ADRs 0000–0016 — govern error-handling observability in feature routes. The set covers identity/tenancy graph, data-model contracts, consent/age policy, LLM routing, and safety architecture. A missing Sentry capture in a dictation route has no tie to any named brief member. The finding's own workstream label already identifies errors-api as the correct owner.

### F-048 — Consent resend-counter rollback failure swallowed without logging — inconsistent with two sibling catch blocks

- **workstream:** errors-api · **domain:** Silent Failure (GDPR-adjacent)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** errors-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(low): Counter (IN-scope): defect is in consent.ts; consent is named canon in all four identity docs and the subject of register C-4 audit obligations. A swallowed rollback on a consent mutation arguably gaps that audit discipline. canonical_set_source="" also auto-flags the row — the lens calls an uncitable scope call unverifiable. Honest weighing: the classifier is stronger — domain-membership isn't the test; no member governs catch-block logging, and C-4 targets PERSISTENT records (consent_grant, deletion_audit), not a transient logger.warn. refuted=true on flag-to-human grounds (empty citation + GDPR adjacency = cheap doubt), not a clear win.
- **provenance:**
  - `deep-review/errors-api::errors-api-2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-errors-api/silent-failure-hunter.md` — evidence: apps/api/src/services/consent.ts:672-674
- **quote[0]:** [PRE-EXISTING] LOW — Consent resend-counter rollback failure swallowed without escalation - **Location:** `apps/api/src/services/consent.ts:672-674` (`} catch { /* best-effort rollback */ }`) - **Category:** Silent Failure (GDPR-adjacent) - **Issue:** [...] this particular rollback catch swallows the rollback error with only a comment — no `logger.warn`, no Sentry. The sibling rollback handlers at `consent.ts:548-556` and `:724-733` correctly `logger.warn('[consent] Failed to rollback resend counter', ...)`; this one is the odd inconsistent site.
- **rationale:** F-048 is a catch-block observability consistency defect — one rollback handler swallows silently while two siblings correctly emit logger.warn. No canonical-set member governs internal logging discipline in service implementations. The compliance register (J0 member) covers binding GDPR/COPPA rules and locked product parameters, not catch-block observability. This is a code-quality/error-handling issue owned by the errors-api workstream, exactly as the source audit tagged it.

### F-049 — Signature-verification catch discards underlying error detail — Stripe and Resend webhook routes log no context on verification failure

- **workstream:** errors-api · **domain:** Missing Context
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** errors-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/errors-api::errors-api-3` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-errors-api/silent-failure-hunter.md` — evidence: apps/api/src/routes/stripe-webhook.ts:87
- **quote[0]:** [PRE-EXISTING] LOW — Signature-verification catch discards underlying error detail (Stripe + Resend) - **Location:** `apps/api/src/routes/stripe-webhook.ts:87` and `apps/api/src/routes/resend-webhook.ts` signature path - **Category:** Missing Context - **Issue:** The `catch {}` around `verifyWebhookSignature` returns a 400 without logging *why* verification failed [...]. During a real incident (e.g. a webhook-secret rotation gone wrong where *every legitimate* Stripe event starts 400ing), there is no breadcrumb distinguishing "attacker probing" from "we broke our own secret."
- **rationale:** F-049 is about missing error-context logging in catch blocks of Stripe (billing) and Resend (email) webhook routes. None of the 20 canonical-set members — the four L1 identity docs, the compliance register, identity ADRs (MMT-ADR-0001/0002/0007-0016), or the LLM-model registers — address webhook signature verification or observability in third-party integration routes. No canonical-set member can be cited. The finding is real but owned entirely by the errors-api workstream, which matches its source workstream label.

### F-050 — Streamed tutor messages are never announced to screen-reader users (the core flow)

- **workstream:** l10n-a11y-mobile · **domain:** Accessibility — live-region / screen-reader announcement
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** CRITICAL · **normalized_priority:** P0
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/l10n-a11y-mobile::a11y-C1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/accessibility-scanner.md` — evidence: components/session/MessageBubble.tsx:232-289, components/session/ChatShell.tsx:413-430
- **quote[0]:** `MessageBubble` renders AI content in a plain `<View>`/`ThemedMarkdown` with **no `accessibilityLiveRegion`, no `accessibilityRole`, and no sender prefix.** When a screen reader is active, `ChatShell`'s auto-TTS effect early-returns (`if (!isVoiceEnabled \|\| screenReaderEnabled) return;`) — correct, to avoid fighting VoiceOver — but nothing announces the new message in its place. There is also no `AccessibilityInfo.announceForAccessibility()` call and no programmatic focus move to the new bubble.
- **rationale:** F-050 concerns mobile screen-reader accessibility: missing `accessibilityLiveRegion`, `accessibilityRole`, sender prefix on `MessageBubble`, and no `AccessibilityInfo.announceForAccessibility()` call when auto-TTS early-returns. None of the 20 canonical-set members (L1 ontology/domain/data-model/PRD, L2 ADRs 0000-0016 on tenancy/person-role-consent/LLM routing/policy/compliance, L3 model register) address UI a11y or screen-reader patterns. The finding's own workstream tag correctly names the owner.

### F-051 — Quiz answer result (correct / wrong + revealed answer) is not announced

- **workstream:** l10n-a11y-mobile · **domain:** Accessibility — live-region / screen-reader announcement
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/l10n-a11y-mobile::a11y-H1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/accessibility-scanner.md` — evidence: app/(app)/quiz/play.tsx:946-1001, app/(app)/quiz/play.tsx:992
- **quote[0]:** When an answer is checked, a result block appears (`PolarStar` celebration, "Correct"/"Not quite" text at `:998-1000`, and the revealed correct answer at `:982-988`) but the block carries **no `accessibilityLiveRegion` and triggers no focus shift or `announceForAccessibility`.** Correctness is correctly conveyed by text (not color-only — good), but a screen-reader user isn't told the result occurred.
- **rationale:** F-051 is a mobile UI screen-reader defect: missing accessibilityLiveRegion and no focus shift on the quiz answer-result block. No canonical-set member covers mobile accessibility patterns — the L1 docs define identity ontology/data model/PRD/compliance; the compliance register covers COPPA/GDPR/EU AI Act/OSA/DPIA (data obligations, not UI accessibility); ADRs 0000–0016 cover identity, tenancy, policy-engine, and LLM routing. No canonical-set citation is possible. The finding's existing workstream tag (l10n-a11y-mobile) is the correct owner.

### F-052 — Modals do not trap VoiceOver focus (`accessibilityViewIsModal` missing everywhere)

- **workstream:** l10n-a11y-mobile · **domain:** Accessibility — modal focus management
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/l10n-a11y-mobile::a11y-H2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/accessibility-scanner.md` — evidence: app/(app)/library.tsx, app/(app)/more/account.tsx, components/library/TopicPickerSheet.tsx, components/nudge/NudgeUnreadModal.tsx, components/common/ProfileSwitcher.tsx, components/session/SessionModals.tsx
- **quote[0]:** No modal sets `accessibilityViewIsModal={true}` on its content container. On iOS, VoiceOver can swipe out of the modal into the (still-present) screen behind it. None move accessibility focus into the modal on open, and none restore focus to the triggering control on close.
- **rationale:** F-052 concerns iOS VoiceOver focus-trapping in modals — missing `accessibilityViewIsModal`, no focus-on-open, no focus-restore-on-close. None of the 20 canonical-set members address UI component accessibility patterns. The set covers identity ontology, domain/data models, consent/age policy, tenancy ADRs, LLM routing/vetting, compliance register, and model register — all backend or product-policy concerns. No brief member can justify identity-foundation ownership. The finding is real and already correctly tagged to `l10n-a11y-mobile`, the natural owner of mobile accessibility remediation.

### F-053 — Loading / busy states are not announced (systemic — 31 of 50 ActivityIndicator files)

- **workstream:** l10n-a11y-mobile · **domain:** Accessibility — live-region / screen-reader announcement
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote omits '(Auth is a good counter-example: sign-in.tsx:1073 labels its indicator "Signing you in".)' from line 74 — provides spliced text from lines 74 and 76 with parenthetical deleted.
- **provenance:**
  - `deep-review/l10n-a11y-mobile::a11y-H3` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/accessibility-scanner.md` — evidence: app/(app)/quiz/play.tsx:1072-1078, components/session/ChatShell.tsx:819-826
- **quote[0]:** 31 of 50 non-test files using `ActivityIndicator` have no live region or busy state. Notable in core flows: `quiz/play.tsx:1072-1078` ("Scoring round…"), session "thinking" indicator (`ChatShell.tsx:819-826`, `DeskLampAnimation`), various save/submit spinners. Spinners render with no `accessibilityLabel`, no `accessibilityState={{ busy: true }}`, and no live-region text.
- **rationale:** F-053 is about missing accessibilityLabel/accessibilityState/live-region annotations on ActivityIndicator components — a mobile UI a11y concern. None of the 20 canonical-set members address mobile screen-reader patterns or loading-state announcements. The set is bounded to identity/tenancy ontology, domain model, data model, PRD personas/age model, compliance obligations, and LLM routing ADRs. No brief member can be cited. The finding is already tagged l10n-a11y-mobile, which is the correct remediation owner.

### F-054 — Confirmation toast is invisible to screen readers

- **workstream:** l10n-a11y-mobile · **domain:** Accessibility — live-region / screen-reader announcement
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/l10n-a11y-mobile::a11y-H4` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/accessibility-scanner.md` — evidence: app/(app)/session/_components/ConfirmationToast.tsx:12-22
- **quote[0]:** The toast is a plain `<View>`/`<Text>` with no `accessibilityLiveRegion`/`accessibilityRole="alert"`. Used in the active session for transient confirmations. Actions that confirm only via a toast (e.g. "Saved", "Added to library") give a blind user no feedback that the action succeeded.
- **rationale:** F-054 is a mobile UI accessibility issue: confirmation toasts rendered as plain View/Text with no accessibilityLiveRegion or accessibilityRole="alert". None of the 20 canonical-set members address mobile accessibility or screen-reader semantics. The set covers identity ontology, domain/data models, product PRD, compliance obligations, and ADRs for tenancy, payer capacity, entity/role model, guardianship, age transitions, family-join, data-model, policy-engine, LLM router, and safety/judge. No connection to any of these. Owned by l10n-a11y-mobile as the finding itself asserts.

### F-055 — Form inputs lack `accessibilityLabel`; visible labels are detached siblings

- **workstream:** l10n-a11y-mobile · **domain:** Accessibility — form input labeling
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Classifier tested only WCAG-vs-data-protection, never the minor-consent-accessibility angle. IF's PRD centers minors (13+ floor, sub-13 gated); the IF stream owns the consent/onboarding form screens where this bites. Compliance register C-3 (OSA child-safety) and C-5 (Children's Code/DPIA) bind how consent info reaches children — an input announcing as 'unnamed edit field' blocks a child from consent, arguably within those duties. So the empty canonical_set_source is contestable, not settled. Weaker side: OSA doesn't literally import WCAG, and the quote is a generic email field. But the adjacency is real, unrebutted, and an uncitable 'out' should flag-to-human.
- **provenance:**
  - `deep-review/l10n-a11y-mobile::a11y-M1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/accessibility-scanner.md` — evidence: app/(auth)/sign-in.tsx:1401-1416, app/(auth)/sign-up.tsx:595-605
- **quote[0]:** A visible `<Text>Email</Text>` sits above the `<TextInput>`, but in React Native a sibling `<Text>` is **not** programmatically associated with the input (no `htmlFor`/`id` linkage). The input's only accessible name is its `placeholder` — which disappears once the user types. A screen reader re-focusing a filled field then announces an unnamed edit field.
- **rationale:** F-055 is a React Native form-input accessibility defect: sibling `<Text>` labels are not programmatically associated with `<TextInput>`, leaving screen readers to announce unnamed edit fields. None of the 20 canonical-set members (ontology, domain-model, data-model, prd, compliance-register, ADRs 0000–0016, model register, A-vs-B memo) address UI accessibility labeling or screen-reader semantics. The compliance register covers COPPA/GDPR/EU AI-Act/OSA — data-protection obligations, not WCAG/ADA. The finding's own workstream tag correctly identifies the owner: `l10n-a11y-mobile`.

### F-056 — Decorative animations not hidden from screen readers (noise)

- **workstream:** l10n-a11y-mobile · **domain:** Accessibility — decorative content / accessible={false}
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — quote-not-found: Provided quote is paraphrased, not verbatim. Source lists specific siblings (DeskLampAnimation, MagicPenAnimation, CheckmarkPopAnimation, CelestialCelebration); provided quote condenses to 'Most siblings comply' without names.
- **provenance:**
  - `deep-review/l10n-a11y-mobile::a11y-M2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/accessibility-scanner.md` — evidence: components/AnimatedSplash.tsx, components/common/BrandCelebration.tsx
- **quote[0]:** Per CLAUDE.md, `*Animation`/`*Celebration`/`AnimatedSplash` components should be `accessible={false}` or carry a meaningful label. Most siblings comply, but `AnimatedSplash` and `BrandCelebration` do not. VoiceOver/TalkBack may stop on and verbalize the internal SVG/animated nodes of a purely decorative celebration or splash, adding confusing noise during a celebratory moment.
- **rationale:** F-056 concerns mobile UI accessibility: AnimatedSplash/BrandCelebration lacking accessible={false}, causing VoiceOver/TalkBack to verbalize decorative nodes. None of the 20 locked canonical-set members address screen-reader behavior or mobile UI accessibility attributes — the set covers identity/tenancy, role/consent/guardianship, age transitions, family-join, data model, policy engine, LLM routing/judge, and the compliance register (COPPA/GDPR). No ADR (0000–0016) touches this. The finding is real but owned by the l10n-a11y-mobile workstream, matching its own assigned workstream.

### F-057 — Tappables with text children but no `accessibilityRole="button"`

- **workstream:** l10n-a11y-mobile · **domain:** Accessibility — role annotation
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/l10n-a11y-mobile::a11y-M3` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/accessibility-scanner.md` — evidence: components/session/ChallengeOfferCard.tsx:26,35,44, components/session/DraftedNoteReview.tsx:52,71,80, components/guards/RequireFamilyContext.tsx:101,112
- **quote[0]:** These `Pressable`s wrap visible `<Text>`, so RN derives an accessible *name* and they are announced — but without `accessibilityRole="button"` they aren't announced as buttons, and on some configurations the "double-tap to activate" affordance hint is weaker.
- **rationale:** F-057 is about Pressable components lacking accessibilityRole="button", weakening screen-reader affordance hints. No canonical-set member (ontology, domain-model, data-model, prd, compliance register, MMT-ADR-0000–0016) addresses mobile UI accessibility markup, ARIA-equivalent roles, or screen-reader behavior. The finding has no identity, tenancy, consent, age-model, or LLM-routing dimension. It is already workstream-tagged l10n-a11y-mobile, the correct natural owner. No canonical-set source can be cited.

### F-058 — Escalation / verification badges convey state with color + tiny text but no role

- **workstream:** l10n-a11y-mobile · **domain:** Accessibility — color + low-vision / badge sizing
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/l10n-a11y-mobile::a11y-M4` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/accessibility-scanner.md` — evidence: components/session/MessageBubble.tsx:239-256, components/session/MessageBubble.tsx:271-277, components/session/MessageBubble.tsx:128-168
- **quote[0]:** The wrapping `<View>` carries `accessibilityLabel="Guided response"` (`:242`) but the specific level text isn't part of the bubble's announced content stream in an obvious order, and the verification badge ✓ relies on a 10px `text-success` string. Low-vision users may miss the 10px badge.
- **rationale:** F-058 is a mobile UI accessibility defect: a 10px verification badge with no structural role and an accessibilityLabel that omits level text from the announced stream. None of the 20 canonical-set members — identity ontology, domain/data model, product PRD, compliance register, ADRs 0000–0016 (tenancy, guardianship, age/consent, family-join, data model, policy engine, LLM routing, safety/judge) — govern mobile UI accessibility patterns or badge rendering. No canonical-set member can be cited. The finding belongs to the l10n-a11y-mobile workstream, which already owns it per its source tag.

### F-059 — Decorative leading icons inside labeled banners not hidden

- **workstream:** l10n-a11y-mobile · **domain:** Accessibility — decorative content / accessible={false}
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/l10n-a11y-mobile::a11y-L1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/accessibility-scanner.md` — evidence: components/nudge/NudgeBanner.tsx:51
- **quote[0]:** The parent `Pressable` is announced via its `<Text>` children, but the leading `heart-outline` icon is not marked decorative. Minor noise, not a blocker.
- **rationale:** F-059 is a mobile UI accessibility defect: a decorative icon inside a labeled banner is not marked decorative, causing minor screen-reader noise. No canonical-set member (ontology, domain-model, data-model, prd, compliance register, ADRs 0000/0001/0002/0007-0016, LLM register) covers UI accessibility markup or icon decoration patterns. The set is scoped to identity/tenancy, data model, age/consent policy, LLM routing, safety, and compliance — none touching React Native accessibilityElementsHidden. The finding's own workstream tag (l10n-a11y-mobile) is the correct owner.

### F-060 — Tiny 10px text in a few badges/labels

- **workstream:** l10n-a11y-mobile · **domain:** Accessibility — low-vision / text sizing
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/l10n-a11y-mobile::a11y-L2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/accessibility-scanner.md` — evidence: components/home/CoachBand.tsx:45, components/home/SubjectTile.tsx:70, components/session/ChatShell.tsx:728,748, components/session/MessageBubble.tsx:274
- **quote[0]:** `text-[10px]` is below comfortable minimums for low-vision users; though it scales with Dynamic Type, the small base size compounds in dense UI.
- **rationale:** F-060 concerns `text-[10px]` Tailwind classes producing sub-optimal font sizes for low-vision users — a mobile UI accessibility issue. None of the 20 locked canonical-set members cover mobile typography, font sizing, or WCAG/Dynamic Type behaviour. The compliance register covers COPPA/GDPR/EU AI-Act/OSA/DPIA (data-privacy, child-safety) — not UI accessibility. No brief member is citable for in-IF-scope. The finding's source audit already assigned workstream "l10n-a11y-mobile", which is the correct remediation owner.

### F-061 — Multiline <Text> children — 163 hardcoded English sentences/labels

- **workstream:** l10n-a11y-mobile · **domain:** Localization — hardcoded JSX text
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** CRITICAL · **normalized_priority:** P0
- **verify_status:** contested — scope-refuted(medium): Classifier over-claims. Its "no canonical-set member provides a hook" is false. Compliance register C-1 binds minor-facing copy: privacy copy must disclose profiling per GDPR Art 13(2)(f), plus AI-training-toggle gating. F-061's leaks land there — subscription, profiles, auth onboarding. A non-English minor seeing consent copy only in English is an Art 13(2)(f) defect the register owns. Classifier collapsed "no member governs all 163" into "no member governs any," killing the partition: the consent subset is IF-scope; headings are l10n. Right call is a split, not wholesale out. Caveat: F-061 doesn't itemize a specific consent string, so the hook is to a subset. Flag to human.
- **provenance:**
  - `deep-review/l10n-a11y-mobile::l10n-C1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/localization-scanner.md` — evidence: app/session-summary/[sessionId].tsx:445,448,818,1426,1475, app/(app)/shelf/[subjectId]/book/[bookId].tsx:1273, app/profiles.tsx:254,257,265, app/(app)/subscription.tsx:735
- **quote[0]:** Multiline `<Text>…</Text>` children (English sentence between tags) \| **163** \| Largest class. Headings, empty-states, error copy, CTAs. … A German/Japanese/Polish user who selected their language at onboarding sees English headings, empty-states, and error copy throughout session-summary, book, profile, and subscription flows.
- **rationale:** F-061 is a localization gap (163 hardcoded English `<Text>` children). None of the 20 canonical-set members governs UI string externalization or l10n coverage. The identity-foundation set covers ontology, domain/data model, product PRD (personas/age/consent), compliance register (COPPA/GDPR/EU-AI-Act consent+data-access obligations — not locale/language), and ADRs 0000–0016 (tenancy, guardianship, payer, policy engine, LLM routing, safety). No canonical-set member provides a hook into this finding. The finding's own workstream tag is correct.

### F-062 — Auth screens render entirely in English

- **workstream:** l10n-a11y-mobile · **domain:** Localization — hardcoded auth-screen strings
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** CRITICAL · **normalized_priority:** P0
- **verify_status:** contested — quote-not-found: Quote is a composite of two separate source sections (lines 50-52 + 84-85) merged together. Neither section appears verbatim as presented. Component pieces exist but not as single continuous passage.
- **provenance:**
  - `deep-review/l10n-a11y-mobile::l10n-C2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/localization-scanner.md` — evidence: app/(auth)/sign-in.tsx:1022,1430, app/(auth)/sign-up.tsx:413-653, app/(auth)/forgot-password.tsx:326-504
- **quote[0]:** `app/(auth)/sign-in.tsx` — **0 `t()` calls**; e.g. `:1022` `title="Still signing you in"`, `:1430` `placeholder="Enter your password"`, plus all button labels. Two screens are **systemically un-internationalized**, not incidentally leaky: `app/(auth)/sign-in.tsx` — **zero `t()` calls in the entire file**; the whole primary sign-in flow is hardcoded English.
- **rationale:** F-062 is a UI i18n defect: zero t() calls in app/(auth)/sign-in.tsx, hardcoded English throughout. No canonical-set member addresses UI localization or t() hygiene — the set governs the identity/tenancy graph, Clerk-as-auth-only, data model, role/consent model, policy engine, and LLM routing/safety. The auth-screen location does not bring the finding into identity-foundation scope; canonical-set authority covers domain model and architectural decisions, not the UI rendering layer. The finding is already self-classified as l10n-a11y-mobile in the audit corpus, which is the correct owner.

### F-063 — `accessibilityLabel="…"` — 110 hardcoded English screen-reader strings

- **workstream:** l10n-a11y-mobile · **domain:** Localization — hardcoded accessibilityLabel strings
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote mismatch: table says 'reads English to every locale' (line 27); task quote says 'reads English aloud to blind/low-vision users regardless of UI locale — a hard accessibility + localization failure combined' — this exact wording does not appear as a single verbatim quote in the audit file.
- **provenance:**
  - `deep-review/l10n-a11y-mobile::l10n-H1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/localization-scanner.md` — evidence: components/session/SessionMessageActions.tsx:69,168,238, components/session/VoiceRecordButton.tsx:133,141,163, components/session/ChatShell.tsx:703,1045,1092
- **quote[0]:** `accessibilityLabel="…"` literals \| **110** \| Screen-reader text — VoiceOver/TalkBack reads English aloud to blind/low-vision users regardless of UI locale — a hard accessibility + localization failure combined.
- **rationale:** F-063 is 110 hardcoded English `accessibilityLabel` strings — a mobile UI screen-reader localization/a11y defect. None of the 20 canonical-set members address mobile UI string handling or VoiceOver/TalkBack locale compliance. The set covers identity-foundation: tenancy, personas, roles, consent, policy engine, LLM routing (L1 docs, compliance register, ADRs 0000-0016, LLM register). No canonical-set member is citeable. The finding is real but owned by l10n-a11y-mobile, which the source audit already assigned.

### F-064 — `platformAlert(...)` native dialogs — 25 hardcoded English title+body pairs

- **workstream:** l10n-a11y-mobile · **domain:** Localization — hardcoded native dialog strings
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Composite/paraphrased — combines table row (line 32) and user-impact (lines 124-125), not verbatim. Shows `platformAlert(...)` vs line 32's `platformAlert('Title','Body')`.
- **provenance:**
  - `deep-review/l10n-a11y-mobile::l10n-H2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/localization-scanner.md` — evidence: app/profiles.tsx:90,135,177, app/(app)/session/index.tsx:1027,1067, app/(app)/homework/camera.tsx:197,611, app/(app)/quiz/play.tsx:347,595
- **quote[0]:** `platformAlert(...)` native dialogs \| **25** \| Native confirm/error dialogs — each leaks 2 strings. Error/confirmation dialogs (the moments users most need to understand) appear in English.
- **rationale:** F-064 is about 25 hardcoded English title/body pairs in `platformAlert(...)` native dialogs — a pure l10n/i18n defect in the mobile UI layer. No canonical-set member (ontology.md, domain-model.md, data-model.md, prd.md, compliance register, ADRs 0000–0016, LLM model register, A-vs-B memo) touches mobile UI string hygiene or native dialog copy. No named brief member can be cited. The finding's own workstream label "l10n-a11y-mobile" is the correct remediation owner.

### F-065 — Manual pluralization with hardcoded English words — 29 sites

- **workstream:** l10n-a11y-mobile · **domain:** Localization — pluralization
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/l10n-a11y-mobile::l10n-H3` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/localization-scanner.md` — evidence: components/progress/MilestoneCard.tsx:17,22,28,47, components/progress/SubjectProgressRow.tsx:62,78, components/session/LivingBook.tsx:142,148,189, components/session/MilestoneDots.tsx:28
- **quote[0]:** i18next plural rules (`_one`/`_other`/`_few`/`_many`) are bypassed with `count === 1 ? 'x' : 'xs'` ternaries embedded in English … Doubly broken — (a) the words are hardcoded English; (b) the binary singular/plural model is wrong for Polish (3 forms: 1 / 2-4 / 5+) and others, so even after translation the counts would read ungrammatically.
- **rationale:** F-065 is an i18n infrastructure defect: i18next plural-suffix rules are bypassed by inline English ternaries, producing ungrammatical output in Polish and other multi-form locales. No canonical-set member (ontology, domain-model, data-model, prd, compliance register, ADRs 0000/0001/0002/0007-0016, LLM model register) touches UI string localization or plural forms. Identity-foundation scope is bounded by identity/tenancy, consent, guardianship, policy engine, and LLM routing. The finding is already tagged `l10n-a11y-mobile`, the correct owning workstream.

### F-066 — `label=` / `title=` / `placeholder=` / `message=` literals outside auth — 60 sites

- **workstream:** l10n-a11y-mobile · **domain:** Localization — hardcoded prop-attribute strings
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote is reformatted/reconstructed, not verbatim from audit file. File has bullet ('- `title=`:') and additional content (.../layout.tsx line) that the quoted string omits or reformats.
- **provenance:**
  - `deep-review/l10n-a11y-mobile::l10n-H4` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/localization-scanner.md` — evidence: app/session-summary/[sessionId].tsx:418,502, app/session-transcript/[sessionId].tsx:122,142, app/(app)/topic/[topicId].tsx:563,817, app/(app)/_layout.tsx:457, components/feedback/FeedbackSheet.tsx:184
- **quote[0]:** Beyond the auth screens (C2), the same prop classes leak app-wide: `title=`: `app/session-summary/[sessionId].tsx:418` `"Session not found"`, `:502` `"Taking longer than expected"`; `app/session-transcript/[sessionId].tsx:122,142` `"Still loading"`, `"Couldn't load conversation"`; `app/(app)/topic/[topicId].tsx:563` `"Taking too long to open this topic"`.
- **rationale:** F-066 reports hardcoded English literals in label=/title=/placeholder=/message= props across non-auth mobile screens (session-summary, session-transcript, topic). None of the 20 canonical-set members — the four L1 identity domain docs, the 13 L2 ADRs (0000–0016), the compliance register, the vetted-model register, or the A-vs-B memo — address UI string localization or i18n hygiene in mobile screens. No canonical-set member can be cited to place this in identity-foundation scope. The finding's own workstream tag (l10n-a11y-mobile) is correct.

### F-067 — `toLocaleDateString('en-US', …)` — date hardcoded to US locale (4 sites)

- **workstream:** l10n-a11y-mobile · **domain:** Localization — locale-unaware date formatting
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/l10n-a11y-mobile::l10n-M1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/localization-scanner.md` — evidence: lib/format-note-source.ts:10,14, app/(app)/topic/[topicId].tsx:82,103, app/(app)/child/[profileId]/session/[sessionId].tsx:36
- **quote[0]:** `lib/format-note-source.ts:10` — formats a note byline with `'en-US'`; **also** hardcodes the surrounding English text: returns `` `From session · ${monthDay}` `` / `` `Note · ${monthDay}` `` (`:14`). Month names render in English ("Mar 5") and US ordering for users in any locale, even though the rest of the app correctly uses device locale.
- **rationale:** F-067 reports lib/format-note-source.ts hardcoding 'en-US' in toLocaleDateString and English-only surrounding text, causing US-locale date rendering for all users. No member of the identity-foundation canonical set (CANONICAL-SET.md, locked 2026-06-08, 20 entries) addresses locale-aware date formatting or i18n strings. The set covers identity ontology, domain/data models, PRD personas/age model, compliance register, and ADRs for tenancy/guardianship/consent/LLM routing — none govern mobile UI date rendering. Pure l10n/a11y concern owned by l10n-a11y-mobile.

### F-068 — Screen-reader users get silence in the most-used flow (streamed tutor replies) — coordinator synthesis

- **workstream:** l10n-a11y-mobile · **domain:** Accessibility — live-region / screen-reader announcement
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** CRITICAL · **normalized_priority:** P0
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/l10n-a11y-mobile::summary-A11Y-C1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/SUMMARY-prioritized.md` — evidence: components/session/MessageBubble.tsx:232-289, components/session/ChatShell.tsx:413-430
- **quote[0]:** In the active learning session, auto-TTS is (correctly) suppressed under VoiceOver/TalkBack — but **nothing replaces it**: no live region, no focus shift, no `announceForAccessibility`. A blind learner sends a message and hears nothing back. The product's core loop is unusable with a screen reader.
- **rationale:** F-068 is a mobile a11y gap: no live region, focus shift, or announceForAccessibility when streamed tutor replies arrive under VoiceOver/TalkBack. No canonical-set member covers screen-reader support or mobile a11y. The set covers identity/tenancy/role ontology, ADRs 0001-0016 (tenancy, Payer capacity, entity/role, guardianship, transitions, family-join, data-model, migration, policy-engine, router, safety/judge), LLM model register, and compliance register (COPPA/GDPR/EU AI-Act -- data-protection, not sensory accessibility). Owned by l10n-a11y-mobile as the finding already indicates.

### F-069 — ~358 hardcoded English strings render English to every non-English locale — coordinator synthesis

- **workstream:** l10n-a11y-mobile · **domain:** Localization — hardcoded strings (aggregate)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** CRITICAL · **normalized_priority:** P0
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/l10n-a11y-mobile::summary-L10N-1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/SUMMARY-prioritized.md` — evidence: app/(auth)/sign-in.tsx, app/(app)/shelf/[subjectId]/book/[bookId].tsx, app/session-summary/[sessionId].tsx
- **quote[0]:** i18n is live and key parity is perfect (all 7 `*.json` = 1906 keys, 0 missing-key defects). The entire problem is the documented unguarded gap: **≈358 hardcoded user-visible English sites across 59 of ~88 screens** (~383 strings) that never enter `t()`, so the German/Spanish/etc. user sees English.
- **rationale:** F-069 is about ~358 hardcoded English strings in ~59 mobile screens that never pass through `t()`, causing non-English locales to render English. None of the 20 canonical-set members touch localization, i18n string coverage, or UI copy hygiene. The set covers identity ontology, domain model, target schema, PRD personas/age model, compliance obligations, and ADRs for tenancy/Payer/guardianship/consent/LLM-routing/safety — no overlap with l10n. The finding's own workstream tag (`l10n-a11y-mobile`) is correct; no canonical-set member can bring this into identity-foundation scope.

### F-070 — 0 of 13 modals use `accessibilityViewIsModal` — coordinator verified

- **workstream:** l10n-a11y-mobile · **domain:** Accessibility — modal focus management
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/l10n-a11y-mobile::summary-H2-modal` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/SUMMARY-prioritized.md` — evidence: app/(app)/library.tsx, app/(app)/more/account.tsx, components/common/ProfileSwitcher.tsx, components/session/SessionModals.tsx
- **quote[0]:** **H2** **0 of 13 modals** use `accessibilityViewIsModal` (verified); 9/13 have no focus management → VoiceOver wanders behind the overlay. Add `accessibilityViewIsModal` + focus-on-open.
- **rationale:** F-070 is an iOS VoiceOver accessibility finding (missing `accessibilityViewIsModal`, no focus-on-open across 13 modals). None of the 20 canonical-set members touch accessibility or modal focus management — L1 covers identity ontology/domain/data-model/PRD/compliance; L2 ADRs cover tenancy, guardianship, age transitions, LLM routing, data-model realization, safety architecture; L3 is the vetted-model register. No brief member can be cited. The finding's own workstream label (l10n-a11y-mobile) is the correct owner.

### F-071 — 29 manual-pluralization sites — doubly broken: hardcoded English and binary plural model

- **workstream:** l10n-a11y-mobile · **domain:** Localization — pluralization
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** unknown · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/l10n-a11y-mobile::summary-P2-plurals` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/SUMMARY-prioritized.md` — evidence: components/progress/MilestoneCard.tsx, components/progress/SubjectProgressRow.tsx, components/session/LivingBook.tsx
- **quote[0]:** **29 manual-pluralization sites** (`count === 1 ? 'word' : 'words'`) — doubly broken: hardcoded English **and** a binary plural model that's wrong for Polish (3 forms). Use i18next plurals.
- **rationale:** F-071 is about mobile UI pluralization mechanics — 29 ternary sites that hardcode English and break Polish's three-form plural model. None of the 20 canonical-set members (docs/canon/identity/*, MMT-ADR-0000–0016, compliance register, LLM model register, A-vs-B memo) address i18n pluralization or locale-aware string formatting. The compliance register covers COPPA/GDPR/OSA data-handling obligations, not UI copy mechanics. The PRD covers personas and age-bracket product rules, not l10n patterns. The finding is correctly tagged l10n-a11y-mobile, which is the appropriate remediation owner.

### F-072 — 4 `toLocaleDateString('en-US', …)` hardcodes — coordinator summary

- **workstream:** l10n-a11y-mobile · **domain:** Localization — locale-unaware date formatting
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** unknown · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/l10n-a11y-mobile::summary-P2-dates` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/SUMMARY-prioritized.md` — evidence: lib/format-note-source.ts:10
- **quote[0]:** **4 `toLocaleDateString('en-US', …)` hardcodes** (incl. `format-note-source.ts`, which also hardcodes the "From session ·" byline). Use `undefined`/`i18n.language` like the ~31 correct sites.
- **rationale:** F-072 is a pure i18n/l10n defect: hardcoded `toLocaleDateString('en-US', …)` locale strings and a hardcoded "From session ·" byline. No member of the 20-entry canonical set touches locale formatting or i18n string handling. The set covers identity ontology, domain model, data model, PRD/age model, compliance register, and ADRs 0000–0016 (tenancy, guardianship, family-join, policy-engine, LLM routing, safety). The finding's own workstream tag (`l10n-a11y-mobile`) is the correct owner.

### F-073 — Raw learner session transcript placed into Inngest event payload (third-party persistence)

- **workstream:** security-pii-api · **domain:** Third-Party Sharing / Unsafe Storage (retention)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Classifier's key claim ("no member governs this; no jurisdictional hook") is wrong. Register member #20 C-1: "the LLM call is a third-party disclosure of a child's data" — minor data must flow only to vetted, papered third parties. Raw learner transcript to Inngest (unvetted processor, persisted for console readers) is the same disclosure class. C-3(a): forward-only guard vs surfacing verbatim learner quotes; the dashboard exposes verbatim transcript. Ontology member #1 models purposeScope.thirdPartyShare + a disclosure obligation. Defect is real; team already runs transcript-purge-cron. At least dual-owned (IF + security); excluding with empty canonical_set_source is the auto-flag case.
- **provenance:**
  - `deep-review/security-pii-api::pii-H1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-api/pii-leak-scanner.md` — evidence: apps/api/src/routes/filing.ts:172-187, :240-255
- **quote[0]:** Data flow: body → sessionTranscript → inngest.send({ name: 'app/filing.retry', data: { profileId, sessionId, sessionTranscript, sessionMode } }). Inngest persists event payloads in its dashboard (a third-party processor) for the run's retention window, where vendor support / anyone with Inngest console access can read them.
- **rationale:** F-073 is about raw learner transcripts persisting in Inngest event payloads (third-party retention). None of the 20 canonical-set members govern background-job payload hygiene: identity-foundation canon covers the tenancy/consent model, age-gating, and COPPA/GDPR product parameters — not runtime data in Inngest functions. The compliance register records binding obligations but does not create IF ownership over an implementation gap in the filing-retry function. No ADR (0001–0016) provides a jurisdictional hook. The finding belongs to the security-pii-api workstream.

### F-074 — Truncated LLM output (derived from minor's session) shipped to Sentry as extra.rawSlice / rawResponseTrunc

- **workstream:** security-pii-api · **domain:** Logging Exposure (error tracker)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Classifier routed out (security-pii-api), source="". A named IF member plausibly owns it. The leak is a MINOR's verbatim message text egressing to a broad-audience, indefinite-retention third-party sink. Compliance register (J0 member): C-1 frames the LLM call as "third-party disclosure of a child's data" (COPPA+GDPR Art 8) — Sentry IS that surface; C-3 (OSA) bars "verbatim learner quote" exposure on a data-minimization basis the classifier wrongly narrowed to guardian schema. Ontology inv 17 makes LLM-disclosure a standing obligation. Code confirmed real. Empty source is the auto-flag tell: nothing anchors the out-route, C-1/C-3 anchor in-scope. At least as strong; default refuted.
- **provenance:**
  - `deep-review/security-pii-api::pii-M1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-api/pii-leak-scanner.md` — evidence: apps/api/src/services/learner-profile.ts:1782, apps/api/src/services/learner-input.ts:134,145
- **quote[0]:** apps/api/src/services/learner-profile.ts:1782 — captureException(err, { extra: { context: 'analyzeSession', rawSlice: result.response?.slice(0, 500) } }) ... apps/api/src/services/learner-input.ts:134 and :145 — rawResponseTrunc: result.response.slice(0, 200) ... a 200–500-char slice on the parse-failure path can echo learner quotes/phrasing back into Sentry, which has a broad audience (SRE, vendor support) and indefinite retention.
- **rationale:** F-074 is a Sentry-scrubbing / telemetry-hygiene defect: truncated LLM output from minor sessions forwarded to Sentry as error extras. No canonical-set member governs observability pipeline controls. The compliance register (J0 member) covers COPPA/GDPR product/data-model rules, not operational logging. Identity-foundation owns the consent model, tenancy graph, and policy-engine spine — none implicated here. Remediation belongs to security-pii-api, which holds Sentry scrubbing and PII-in-logs controls.

### F-075 — Child's real display name memoized into Inngest step state (third-party persistence)

- **workstream:** security-pii-inngest · **domain:** Third-Party Sharing / Unsafe Storage (retention)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): OPPOSITE: in-IF-scope; register owns it. C-1's basis isn't the LLM call alone — it states "COPPA third-party-disclosure + GDPR Art 8," the call being the exemplar. Inngest memoized step-state is another third-party processor holding the same plaintext child name. C-4 owns data-minimization/storage-limitation; data-model §4.9 names the "Art 28 processor side." Classifier conflates fix-owner with obligation-owner: by its "infra" logic C-1's own in-scope LLM guard is infra too. Tell: in_scope=false with canonical_set_source="" is the schema auto-flag — an exclusion naming no member is unverifiable; flag-to-human. Cites: register C-1/C-4; data-model §4.9.
- **provenance:**
  - `deep-review/security-pii-api::pii-M2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-api/pii-leak-scanner.md` — evidence: apps/api/src/inngest/functions/progress-summary.ts:85,113,129
- **quote[0]:** Location: apps/api/src/inngest/functions/progress-summary.ts:85 — the gather-context step returns { … childName: profile.displayName … }, which Inngest serializes and persists as memoized step output; later read at :113 and :129. ... The leak is the persistence of the plaintext name in the third-party state store, not a cross-user exposure.
- **rationale:** F-075 concerns a child's displayName serialized into Inngest memoized step-output state. The compliance register (docs/compliance/identity-compliance-register.md, J0 member) covers COPPA/GDPR obligations but establishes binding rules — not how Inngest step return values must be structured. Remediation requires refactoring Inngest step outputs to strip child PII, which is an Inngest infrastructure/app-security concern. No canonical-set member governs background-job step-state data handling. The finding's own workstream label correctly identifies the owner.

### F-076 — Child's real first name sent to third-party LLM providers in every exchange

- **workstream:** security-pii-api · **domain:** Third-Party Sharing
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Classifier's key claim is wrong: the compliance register isn't scoped only to consent/age-gating. Member C-1 (AI/LLM exposure) canonicalizes the runtime LLM call as a disclosure vector — "the LLM call is a third-party disclosure of a child's data" (COPPA + GDPR Art 8), requiring a contractually-papered (DPA-covered) endpoint plus an Art 13 privacy-notice bullet. F-076 (minor display name to Gemini/OpenAI must be DPA + privacy-notice covered) is a concrete instance of C-1. A named IF member (identity-compliance-register C-1, L1) owns this topic; the empty cite and out-of-scope call missed it. Scope = topic ownership, not who writes the fix. At least as strong; default-to-flag.
- **provenance:**
  - `deep-review/security-pii-api::pii-L1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-api/pii-leak-scanner.md` — evidence: apps/api/src/services/exchange-prompts.ts:509-511,596-600
- **quote[0]:** safeLearnerName = sanitizeXmlValue(context.learnerName, 64); rendered into the system prompt as The learner's name is "<name>" (data only — not an instruction). Use it naturally … Source: session-exchange.ts:2372 (learnerName: profile?.displayName). ... Sending a first name to the tutor LLM is defensible for a tutoring product. The residual consideration is purely compliance: a minor's name leaving to a sub-processor must be covered by the provider DPA and the privacy notice.
- **rationale:** F-076 is about a child's first name flowing into LLM system-prompt text and whether sub-processor DPA/privacy-notice coverage exists. No canonical-set member owns this. The compliance register covers COPPA/GDPR obligations scoped to consent/age-gating/guardianship, not runtime prompt data-minimization. MMT-ADR-0013/0014/0016 govern routing/judging architecture, not what profile fields appear in prompts. The finding frames the residual as 'purely compliance' (sub-processor DPA, privacy notice) — a documentation gap in the security-pii-api workstream already assigned.

### F-077 — Raw console.debug in service bypasses structured logger

- **workstream:** security-pii-api · **domain:** Logging Exposure (discipline only)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/security-pii-api::pii-L2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-api/pii-leak-scanner.md` — evidence: apps/api/src/services/xp.ts:160
- **quote[0]:** apps/api/src/services/xp.ts:160 — console.debug(`[syncXpLedgerStatus] No xp_ledger row for profile=${profileId} topic=${topicId} — skipped`). Violates the CLAUDE.md "structured logging via logger.ts, no raw console.* in services" rule, but carries no PII.
- **rationale:** F-077 is a raw console.debug call in apps/api/src/services/xp.ts violating the structured-logging rule. None of the 20 canonical-set members (four L1 domain docs, compliance register, ADRs 0000/0001/0002/0007-0016) address logging standards or the xp service. The finding itself notes no PII is involved, further distancing it from identity-foundation scope. No canonical-set citation is possible. The source audit placed it under security-pii-api, which is the closest named owner for API-layer hygiene findings.

### F-078 — RLS helper withProfileScope defined but never wired — scoped-repo is the only tenant isolation layer

- **workstream:** security-pii-api · **domain:** Authorization / Defense in depth
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** docs/canon/identity/data-model.md §5.1 ("the future RLS surface") + MMT-ADR-0011 §T3 ("RLS rollout. (T3 obligation, Phase F.")
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): The classifier's cited members defeat it. architecture.md:576 (IF carve-out) canonizes "the future RLS surface" per data-model.md §5.1; :135 states the CONTRACT "Neon RLS as defense-in-depth." The finding's core: this two-layer contract is FALSE — repo has one layer, withProfileScope has zero callers (verified, rls.ts:46-66). A defect falsifying an IF canon member's isolation contract is in-IF-scope; IF owns its contract integrity. The classifier scoped by remediation verb (wire helper=security); scope should follow which canon the defect contradicts. ADR-0011 also calls RLS rollout a "T3 obligation, Phase F" — an IF runway phase, so IF owns it as deferred work. Flag to human. \| quote-not-found: Provided quote is paraphrased/condensed, not verbatim. Source line 29 includes backticks, markdown, parentheticals, and examples that are stripped from the quote.
- **provenance:**
  - `deep-review/security-pii-api::sec-L1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-api/security-reviewer.md` — evidence: packages/database/src/rls.ts:46-66
- **quote[0]:** docs/architecture.md advertises "Neon RLS as defense-in-depth, not primary enforcement." The helper that would establish the per-transaction GUC exists, but a repo-wide search shows no caller in apps/api/src or packages/database/src. Net effect: tenant isolation rests entirely on application-layer WHERE profile_id = ... predicates. ... a single future query that forgets the predicate would silently leak across tenants with no second line of defense.
- **rationale:** data-model.md §5.1 names the RLS surface obligation and MMT-ADR-0011 defers "RLS rollout" to Phase F — the canonical set acknowledges the gap. But identity-foundation's scope is defining the schema and contracts, not wiring enforcement infrastructure. F-078 is about an unwired `withProfileScope` helper — a security implementation task. The source audit's own workstream assignment (`security-pii-api`) is correct; no identity-foundation ADR addresses when or how to call the helper in API code.

### F-079 — SET LOCAL GUC built via sql.raw with string interpolation — mitigated but fragile

- **workstream:** security-pii-api · **domain:** Injection (SQL)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/security-pii-api::sec-L2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-api/security-reviewer.md` — evidence: packages/database/src/rls.ts:62
- **quote[0]:** packages/database/src/rls.ts:62 — sql.raw(`SET LOCAL app.current_profile_id = '${profileId}'`) ... profileId is interpolated directly into a raw SQL string because SET LOCAL does not accept bound parameters ($1). This is currently safe: line 51 rejects any profileId that doesn't match a strict UUID regex (UUID_RE) before the interpolation, so no injection payload can reach the raw string.
- **rationale:** F-079 concerns the fragile-but-safe `SET LOCAL` interpolation in `packages/database/src/rls.ts:62`. No canonical-set member governs RLS enforcement mechanisms or database-layer injection mitigations. The L1 docs cover entity/role contracts and target schema tables; the ADRs cover tenancy architecture, data-model realization, and routing/safety design. None address the SET-LOCAL GUC pattern or the UUID_RE guard. The finding's own workstream field already names `security-pii-api` as owner, which is the correct home for database-layer security hardening. No canonical-set citation is possible.

### F-080 — CORS reflects any localhost/127.0.0.1 origin with credentials:true in all environments including production

- **workstream:** security-pii-api · **domain:** Configuration / CORS
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/security-pii-api::sec-L3` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-api/security-reviewer.md` — evidence: apps/api/src/index.ts:165-191
- **quote[0]:** The CORS origin callback reflects any http(s)://localhost(:port) or 127.0.0.1(:port) origin and sends Access-Control-Allow-Credentials: true. Production origins are correctly a tight exact-match allowlist ... but the localhost branch is not gated by ENVIRONMENT, so it is live in production too. ... malware or a hostile app running on a victim's machine and serving from localhost could make credentialed cross-origin calls the policy would accept.
- **rationale:** F-080 is an API CORS policy defect — the localhost/127.0.0.1 origin branch is not environment-gated, so credentialed cross-origin requests from any localhost origin are accepted in production. None of the 20 canonical-set members (L1 domain docs, ADRs 0000-0016, compliance register, LLM model register) address CORS policy or HTTP origin whitelisting. The finding has no tie to identity entities, roles, tenancy, consent, the policy engine, or the LLM router. The corpus label workstream=security-pii-api is correct; that workstream owns this.

### F-081 — X-Maintenance-Secret and X-Test-Secret must not land in query strings (informational guardrail)

- **workstream:** security-pii-api · **domain:** Data Exposure
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** contested — quote-not-found: Quote omits parenthetical about /v1/maintenance/ and /v1/__test/ prefixes between 'reachable without Clerk auth' and 'If any future client'. Uses ellipsis but full source text spans these clauses without break.
- **provenance:**
  - `deep-review/security-pii-api::sec-L4` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-api/security-reviewer.md` — evidence: apps/api/src/routes/maintenance.ts:58, apps/api/src/routes/test-seed.ts:92
- **quote[0]:** Both privileged secrets are read from request headers (correct — headers don't leak into access logs/referrers the way query params do) and compared in constant time. No issue in the current code. Noting it as a guardrail: these endpoints are reachable without Clerk auth ... If any future client or doc is tempted to pass these as ?secret= query params (visible in CF logs / proxies), that would become a real exposure.
- **rationale:** F-081 is a guardrail about X-Maintenance-Secret and X-Test-Secret transport hygiene — risk of secrets appearing in query strings vs headers. None of the 20 canonical-set members (ontology, domain-model, data-model, prd, compliance-register, ADRs 0000–0002, 0007–0016, model register) covers HTTP request-parameter hygiene for maintenance/test secrets. No canonical-set member can be cited to bring this into identity-foundation scope. The finding belongs to the security-pii-api workstream, the natural owner of API secrets-handling guardrails.

### F-082 — Test routes reachable without secret in development environment (by-design, informational)

- **workstream:** security-pii-api · **domain:** Configuration
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Classifier overstates "none of 20 members cover this." The finding's quote names a "/__test/debug/:email account-enumeration endpoint" plus seed/RESET of accounts: that writes identity/profile/membership tables (data-model.md; ADR-0011/0015) and enumerates Person-to-Login plus children's PII, which the compliance register (L1 member: COPPA/GDPR) governs. So canonical_set_source="" is wrong by omission; both are citable tethers. Weakness: the finding is a config guard, by-design, fail-closed, no code change — deployment posture, not an identity invariant. But a wrong scope call costs more than a flag; this children's-data enumeration surface deserves a compliance-register cross-ref. \| quote-not-found: Quote not verbatim: removes backticks and markdown bold, truncates mid-sentence. Actual file continues with ', which would expose seeding/reset and...' but quote ends after 'ENVIRONMENT=development.'
- **provenance:**
  - `deep-review/security-pii-api::sec-L5` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-api/security-reviewer.md` — evidence: apps/api/src/routes/test-seed.ts:75-89
- **quote[0]:** On ENVIRONMENT === 'development', TEST_SEED_SECRET is optional and the seed/reset/debug endpoints run with no secret. This is intentional dev ergonomics and is fail-closed for production (undefined ENVIRONMENT → 403, and staging requires the secret). The residual risk is solely "a real database is ever run with ENVIRONMENT=development."
- **rationale:** F-082 concerns TEST_SEED_SECRET being optional when ENVIRONMENT=development — a dev-ergonomics decision with fail-closed production posture. None of the 20 canonical-set members cover dev-environment configuration or seed-endpoint access controls. No tether to identity/tenancy (MMT-ADR-0001/0007), consent/age/compliance (compliance register, MMT-ADR-0009/0015), data model (MMT-ADR-0011/0015), policy/routing engine (MMT-ADR-0013/0014), or safety/judge architecture (MMT-ADR-0016). Dev-tooling security posture is owned by security-pii-api; no canonical_set_source can be cited.

### F-083 — Minor's raw freeform 'ask' text placed in app/ask.classify_silently event payload

- **workstream:** security-pii-inngest · **domain:** PII / Third-Party Sharing (Inngest event-store persistence)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): REFUTE. Classifier read each register rule's "Realized by" pointer as a scope ceiling. The register (member #20) states obligations at requirement altitude; realization clauses name sites, not boundaries. C-1's basis is verbatim "the LLM call is a third-party disclosure of a child's data" (COPPA + GDPR Art 8). F-083 is the same class: minor raw text disclosed to a third party (Inngest vendor store). Classifier conceded the principle then defeated it via the LLM-endpoint pointer. C-3(a) basis is data-minimization over a child's verbatim text; F-083 is verbatim over-persistence, wrongly narrowed to guardian schema. C-1 and C-3 are citable IF members; source is wrongly empty. Flag in-IF-scope.
- **provenance:**
  - `deep-review/security-pii-inngest::pii-H1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/pii-leak-scanner.md` — evidence: apps/api/src/services/session/session-exchange.ts:1806-1818; apps/api/src/inngest/functions/ask-silent-classify.ts:37
- **quote[0]:** On the first exchange of a freeform session, `priorUserMessages` + `userMessage` (the learner's raw typed content) are joined and put directly into `inngest.send({ name: 'app/ask.classify_silently', data: { classifyInput: <raw learner text>, ... } })`. Inngest persists the event payload in its third-party state store. Anyone with Inngest console/vendor-support access can read the minor's question for the retention window.
- **rationale:** F-083 concerns raw minor text persisted in Inngest's third-party state store. Nearest canonical-set members are C-3 (OSA: no verbatim learner quote in guardian-visible schema) and C-1 (COPPA third-party-disclosure for LLM calls) — but C-3 is scoped to the guardian-visible schema and C-1 to LLM endpoint routing; neither covers the Inngest event-dispatch layer. Data minimization at the Inngest payload boundary is an application-layer infrastructure concern. No canonical-set member can be cited for identity-foundation scope; the finding's own workstream tag (security-pii-inngest) is correct.

### F-084 — Minor's raw topic-probe answer in app/topic-probe.requested event payload

- **workstream:** security-pii-inngest · **domain:** PII / Third-Party Sharing (Inngest event-store persistence)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Out-of-scope call is as contestable as defensible. (1) canonical_set_source="" while asserting OUT auto-flags per task rule. (2) Two L1 canon members plausibly own this datum: register C-3 (OSA: "never surfaces a child's verbatim message text; basis OSA + data-minimization") and C-1 ("the LLM call is a third-party disclosure of a child's data"). Ground truth (topic-probe-extract.ts:110,229) confirms the raw minor message rides into evaluateRecallQuality then the LLM call. Classifier's "register doesn't own Inngest hygiene" is real but unsettled (no ADR names event-store minimization). Excluding a COPPA/OSA minor-PII finding on open canon is the flag case. Recommend in-IF-scope or contested.
- **provenance:**
  - `deep-review/security-pii-inngest::pii-H2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/pii-leak-scanner.md` — evidence: apps/api/src/services/session/session-exchange.ts:1181,1196-1199; apps/api/src/inngest/functions/topic-probe-extract.ts:142,229-230
- **quote[0]:** `learnerMessageText` (the learner's raw message) is sent as `data.learnerMessage` in the `app/topic-probe.requested` event. Persisted in Inngest's event store. Inside `topic-probe-extract` it is consumed at `seedRetentionCard` (line 229) → `evaluateRecallQuality(learnerMessage, topicTitle)`.
- **rationale:** F-084 is a data-minimization/PII defect in the topic-probe Inngest pipeline — raw learner message text persisted in Inngest's event store. Identity-foundation canon governs the identity/tenancy graph, consent model, age-bracket rules, and compliance obligations (COPPA/GDPR via the J0-added compliance register). The register names COPPA as binding but does not own remediation of individual Inngest payload hygiene. No canonical-set ADR addresses Inngest event-payload data minimization. Remediation belongs to security-pii-inngest, which owns background-job PII hygiene.

### F-085 — Child names, struggle topics, and parent email memoized in weekly-progress-push prepare step

- **workstream:** security-pii-inngest · **domain:** PII / Third-Party Sharing (memoized step return)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(high): Wrong test: the lens asks "does a named member OWN the violated obligation?" not "does one name Inngest?" L1 compliance-register C-1 says verbatim "the LLM call is a third-party disclosure of a child's data" (COPPA + GDPR Art 8). Ground truth (weekly-progress-push.ts:756 pushes {childName,topics}, memoized into Inngest's store) is the SAME act: child PII to a third party. The LLM endpoint is just C-1's example; the basis IS the obligation, plus C-3/C-4 data-minimization. A named L1 member governs this -> in-IF-scope or contested, not out. The "security-pii-inngest" workstream is absent from the quote, so the out-target is unanchored; blank canonical_set_source is the auto-flag.
- **provenance:**
  - `deep-review/security-pii-inngest::pii-M6` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/pii-leak-scanner.md` — evidence: apps/api/src/inngest/functions/weekly-progress-push.ts:851-861
- **quote[0]:** The prepare step returns these for use by the later `send-weekly-progress-push` / `send-weekly-progress-email` steps. The return value is memoized into Inngest's third-party state store. This is the same M2 class as the known progress-summary issue, but broader: it adds parent email + struggle topics.
- **rationale:** F-085 concerns PII (child names, struggle topics, parent email) memoized into Inngest's third-party state store in the weekly-progress-push prepare step. No canonical-set member governs Inngest job data handling or state-store PII minimization. The compliance register establishes COPPA/GDPR obligations but does not specify Inngest memoization constraints. ADRs 0007–0016 cover identity/tenancy graph, guardianship, age/consent, and LLM routing — none touch background job data flows. Remediation belongs to the security-pii-inngest workstream that the finding's own metadata already names.

### F-086 — Child display name and struggle topics memoized in monthly-report-cron generate step

- **workstream:** security-pii-inngest · **domain:** PII / Third-Party Sharing (memoized step return)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Classifier asked "does a member govern Inngest memoization hygiene?" — none does. But scope is set at the OBLIGATION layer. Compliance-register C-1 ("the LLM call IS a third-party disclosure of a child's data") cites COPPA + GDPR Art 8 — data-flow-agnostic. Child name + struggle topics in Inngest's third-party state store is, by identical logic, minor-data disclosure to a processor; the LLM call is C-1's instance, not its full scope. So canonical_set_source is NOT empty — C-1 is a candidate owner, and empty is the auto-flag. The fallback "source tagged it security" is forbidden: clustering is evidence, not scope authority. Refuted.
- **provenance:**
  - `deep-review/security-pii-inngest::pii-M7` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/pii-leak-scanner.md` — evidence: apps/api/src/inngest/functions/monthly-report-cron.ts:475-481
- **quote[0]:** Step return memoized into Inngest state; `childDisplayName` re-used at line 561 (`'<Name>'s monthly report is ready'` push title).
- **rationale:** F-086 concerns PII leakage into Inngest durable step state: child names and struggle topics memoized in a monthly-report-cron step and reused in push-notification titles. No canonical-set member governs Inngest step memoization hygiene or PII scrubbing in background jobs. The compliance register covers binding COPPA/GDPR obligations but defines consent rules, not engineering PII-redaction patterns. The finding is already tagged security-pii-inngest by the source audit, which is the correct remediation owner.

### F-087 — Child name and knowledge inventory memoized in progress-summary gather-context step (known M2)

- **workstream:** security-pii-inngest · **domain:** PII / Third-Party Sharing (memoized step return)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): REFUTED. Classifier framed this as Inngest "memoization" with empty canonical_set_source (auto-flag tell). But the finding's quote is load-bearing: consumer "re-checks consent" = consent-WITHDRAWAL enforcement on child-PII egress, not job mechanics. Code confirms: [WI-82] comments frame it as a GDPR gate. Two NAMED IF members own it: domain-model §3 (consent "withdrawable") and compliance-register C-1 ("LLM call is a third-party disclosure of a child's data"). K.2 asks IF-scope, not which doc holds the fix; a citable IF member exists. Concession: mechanism is Inngest-specific, already-mitigated M2; but ownership = consent contract = IF canon.
- **provenance:**
  - `deep-review/security-pii-inngest::pii-M8` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/pii-leak-scanner.md` — evidence: apps/api/src/inngest/functions/progress-summary.ts:83-93
- **quote[0]:** `gather-context` step return memoized in Inngest state; consumed by `generate-summary` (line 105-118) which re-opens a DB connection anyway and re-checks consent.
- **rationale:** F-087 concerns memoization of child PII in an Inngest step's durable state — a background-job infrastructure concern, not an identity-model or consent-contract concern. The canonical set covers entity/role/consent contracts and ADRs 0000–0016; none governs Inngest memoization patterns. The compliance register (J0 member) sets COPPA/GDPR obligations but is not the owning spec for this implementation defect. No named brief member makes identity-foundation the remediation owner. The finding's own workstream tag (security-pii-inngest) correctly identifies the owner.

### F-088 — Minor's display name and birth year memoized in consent-revocation step state

- **workstream:** security-pii-inngest · **domain:** PII / Third-Party Sharing (memoized step return)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): IF scope tracks the obligation, not the mechanism — so "no member defines Inngest state-mgmt" proves too little. A minor's birth year (COPPA-relevant) is memoized to Inngest's third-party store ON the consent-revocation deletion flow whose age<=13 delete-vs-archive boundary (consent-revocation.ts:132-142) is IF-canon: data-model §6.1, ontology inv 21, ADR-0009 own the under-consent-age audited delete path. The compliance register (J0 member) makes data-minimization binding (C-3) and child third-party disclosure a COPPA duty (C-1); the scanner labels this "Third-Party Sharing" to Inngest's store — the class C-1 governs. Citable to C-1/C-4 + data-model §6.1. Flag.
- **provenance:**
  - `deep-review/security-pii-inngest::pii-M9` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/pii-leak-scanner.md` — evidence: apps/api/src/inngest/functions/consent-revocation.ts:112-115
- **quote[0]:** The whole child profile slice (name + birth year) is returned from `load-child-profile` and memoized in Inngest state. Particularly sensitive because this is a child-account-deletion flow and birth year drives the COPPA-boundary delete-vs-archive decision (line 139-142).
- **rationale:** F-088 is about PII minimization in Inngest durable state — a child-deletion flow memoizes the full child profile slice instead of only what steps need. The compliance register (J0 canonical-set member) establishes COPPA/GDPR obligations, but no canonical-set member defines Inngest state-management practices. The defect is an implementation concern about runtime job state payloads, not a gap in the identity model's contracts, consent model, or schema. The finding's own workstream label (security-pii-inngest) is the correct owner.

### F-089 — Minor's struggle topics round-trip through session-completed step state

- **workstream:** security-pii-inngest · **domain:** PII / Third-Party Sharing (memoized step return)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Real finding (session-completed.ts:1490 returns notifications[] with struggle topics into Inngest step state). Classifier left canonical_set_source="" — citing no member auto-flags as unverifiable; "no member assigns this to IF" cuts both ways. A live L1 member, the compliance-register (J0 #20), names the harm: C-1 = COPPA third-party-disclosure + GDPR Art 8; struggle topics in Inngest's third-party store are that same minor-PII disclosure. C-4 (GDPR Art 5(1)(e)) covers DB delete paths, but Inngest step-state sits outside them. A confident out-call with no citation should be contested. Caveat: corpus files it P2 under security-pii-inngest — hence medium.
- **provenance:**
  - `deep-review/security-pii-inngest::pii-M10` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/pii-leak-scanner.md` — evidence: apps/api/src/inngest/functions/session-completed.ts:1490
- **quote[0]:** The `analyze-learner-profile` step returns `notifications[]` (each carrying a struggle `topic` string) so the array survives Inngest replay (the comment at 1359-1361 explains the deliberate memoization). It is re-read at 1596 to drive the `notify-struggle` step. The struggle topics are thereby persisted in Inngest's third-party state store.
- **rationale:** F-089: struggle topics persist in Inngest durable step state via memoized notifications[]. The compliance register (J0 member) establishes COPPA/GDPR obligations making this a live concern, but defines the obligation only — not the remediation domain. Identity-foundation governs the identity/tenancy graph and consent-capacity model; it does not own Inngest step-payload PII minimization. Remediation requires restructuring analyze-learner-profile step exposure — squarely security-pii-inngest. No canonical-set member assigns Inngest step-state PII handling to identity-foundation.

### F-090 — User feedback free-text and support email in app/feedback.delivery_failed event payload

- **workstream:** security-pii-inngest · **domain:** PII / Third-Party Sharing (Inngest event-store persistence)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/security-pii-inngest::pii-L11` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/pii-leak-scanner.md` — evidence: apps/api/src/inngest/functions/feedback-delivery-failed.ts:26-31
- **quote[0]:** This is a *retry* of a failed support-email send; the original route already serialized the feedback `message` + `supportTo` into the `app/feedback.delivery_failed` event, which Inngest persists. Lower severity than learning data: user-initiated support content the user knows is being emailed to support.
- **rationale:** F-090 concerns user feedback free-text and support email serialized into the app/feedback.delivery_failed Inngest event payload. No canonical-set member covers feedback delivery or support-email routing: L1 docs define the identity/tenancy/consent graph and 8 target tables; the compliance register binds COPPA/GDPR/EU AI-Act obligations to identity data; ADRs 0001-0016 cover tenancy, age transitions, policy-engine, LLM routing, and safety. No member addresses Inngest event hygiene for the feedback/support flow. The finding's own workstream tag (security-pii-inngest) correctly places ownership.

### F-091 — Inferred learner signals memoized in topic-probe-extract extract-signals step

- **workstream:** security-pii-inngest · **domain:** PII / Third-Party Sharing (memoized step return)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/security-pii-inngest::pii-L12` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/pii-leak-scanner.md` — evidence: apps/api/src/inngest/functions/topic-probe-extract.ts:184-186
- **quote[0]:** Returned and memoized in Inngest state. These are LLM-derived summary signals (lower sensitivity than raw transcript), and the same data is durably written to session metadata by design.
- **rationale:** F-091 concerns LLM-derived learner signals memoized in Inngest step state and written to session metadata. No canonical-set member covers Inngest durable-state retention or LLM-signal memoization — the set addresses identity/tenancy ontology, domain/data model, consent/guardianship ADRs, policy-engine spine, LLM routing/judge architecture, and compliance obligations. Those govern the identity graph lifecycle, not the learning-session data pipeline. The finding's workstream label (security-pii-inngest) is the correct owner; no canonical-set member can be cited to bring it in-scope.

### F-092 — monthlyReportGenerate trusts (parentId, childId) event pair without re-verifying family link — cross-account child data emailed to wrong parent

- **workstream:** security-pii-inngest · **domain:** Authorization (cross-tenant defense-in-depth)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(high): Classifier: in-other-workstream, source="". I argue in-IF-scope, citable. Its "no member governs runtime enforcement in consuming handlers" is refuted by MMT-ADR-0008 (#9), which rules call-site discipline: "The authority check lives in exactly one named function ... no call site re-derives it ad hoc," and "A query, not a column, answers 'can this guardian act here?'." Derivation requires (G guardian-of C). F-092 IS such a call site — emailing a charge's data to a guardian without re-querying familyLinks: the "may this guardian SEE this charge" check skipped ad hoc. So canonical_set_source=MMT-ADR-0008 is citable, in_scope=true. The in-model-vs-runtime line ADR-0008's Consequences cross.
- **provenance:**
  - `deep-review/security-pii-inngest::sec-M2` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/security-reviewer.md` — evidence: apps/api/src/inngest/functions/monthly-report-cron.ts:256-449,532-643
- **quote[0]:** The per-pair handler reads `parentId`/`childId` from `app/monthly-report.generate` and proceeds to (a) generate a report over the child's snapshots/struggles and (b) **email the child's `displayName` + struggle topics to the parent's account email** (lines 598-643). It re-checks `isGdprProcessingAllowed(db, childId)` (good, line 271) and that both profiles exist/are unarchived, but it never re-confirms that `childId` is actually linked to `parentId` in `familyLinks`.
- **rationale:** F-092 is a runtime authorization gap in monthlyReportGenerate: the handler trusts the (parentId, childId) event pair without re-querying familyLinks before emailing child data. The IF canonical set (MMT-ADR-0001, MMT-ADR-0008, domain-model.md, data-model.md) owns the identity model and guardianship-edge semantics, but no member governs runtime enforcement in consuming Inngest handlers. The compliance register is a member but does not prescribe per-handler re-verification. No set member can be cited as owning remediation; the finding workstream tag is correct.

### F-093 — Consent-revocation delete branch lacks parent-chain account guard that archive branch has (BUG-662 asymmetry)

- **workstream:** security-pii-inngest · **domain:** Authorization (consistency / defense-in-depth)
- **scope_class:** in-IF-scope · **in_scope:** true · **target_workstream:** (none)
- **canonical_set_source:** MMT-ADR-0001 (own the identity/tenancy graph; account isolation first-class) + docs/canon/identity/domain-model.md (consent model + tenancy) + docs/canon/identity/data-model.md (account-scoped schema)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Verified REAL but REAL != IN-SCOPE. Classifier cites only target-model canon (ADR-0001, domain-model, data-model); none owns a defensive predicate in an EXISTING Inngest job. IF is a forward-looking target schema defining what the model IS, not which code-site hardening bugs belong to it. "Account isolation first-class" is should-language, not proof each enforcing site is IF-scope. The comment self-frames as defense-in-depth vs corrupted Inngest events: a security/Inngest bug from the security-pii audit, owned by consent-revocation.ts. Classifier never cites ADR-0009, the only consent-adjacent canon. Boundary-contestable; default to flag.
- **provenance:**
  - `deep-review/security-pii-inngest::sec-L3` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/security-reviewer.md` — evidence: apps/api/src/inngest/functions/consent-revocation.ts:280-289; apps/api/src/services/deletion.ts:283-313
- **quote[0]:** The archive branch (lines 168-183) added an explicit defense-in-depth guard after BUG-662: `AND account_id = (SELECT account_id FROM profiles WHERE id = parentProfileId)`, precisely so a "corrupted/replayed Inngest event with mismatched (childProfileId, parentProfileId)" cannot archive a profile that isn't in the event-parent's account. The **delete** branch calls `deleteProfileIfConsentWithdrawn(childProfileId, revokedAt)`, which scopes deletion only by the child's own `consent_states` (GDPR/WITHDRAWN + matching `responded_at`) — it does **not** carry the same `account_id = parent's account_id` predicate.
- **rationale:** F-093 is a tenancy-isolation defect in a consent-lifecycle operation: the delete branch lacks the account_id = parent's account_id guard the archive branch carries post-BUG-662. Both concerns — consent lifecycle and account isolation — are in the identity-foundation canonical surface: MMT-ADR-0001 establishes we own the identity/tenancy graph and account isolation is a first-class invariant; domain-model.md defines the consent model and tenancy; data-model.md defines the account-scoped schema the missing predicate would enforce. No other workstream is a more natural owner.

### F-094 — Env bindings stored in module-level singletons may bleed across concurrent function runs in one isolate

- **workstream:** security-pii-inngest · **domain:** Configuration (concurrency / state isolation)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** LOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `deep-review/security-pii-inngest::sec-L4` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/security-reviewer.md` — evidence: apps/api/src/inngest/helpers.ts:13,75-79,154,182-183,222-223; apps/api/src/inngest/client.ts:25-88
- **quote[0]:** `setDatabaseUrl`/`setVoyageApiKey`/`setResendApiKey`/`setEmailFrom`/`setAppUrl`/`setSupportEmail`/`setRetentionPurgeEnabled`/`setMemoryFactsDedupConfig` write to **module-level `let` variables**, set per-invocation by `onFunctionRun` middleware (`client.ts:33-73`). The DB *connection* is correctly request-isolated via `AsyncLocalStorage` (`stepDatabaseScope`), but the config *values* are plain module globals.
- **rationale:** F-094 concerns module-level singleton vars in Inngest middleware (`client.ts`) holding env config (DB URL, API keys, feature flags) that may bleed across concurrent isolate runs — a runtime isolation defect in background-job infrastructure. All 20 canonical-set members cover identity entity structure, consent capacity, tenancy, policy-engine shape, and LLM routing; none address Inngest worker isolation or per-invocation config management. No canonical-set citation is available. The finding's own workstream (security-pii-inngest) is the correct owner for async-infrastructure data-leakage risks.

### F-095 — Minor's transcript in event payload — routes/filing.ts (prior-run HIGH site cited in systemic cluster)

- **workstream:** security-pii-inngest · **domain:** PII / Third-Party Sharing (Inngest event-store persistence)
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Classifier's premise is false. The J0 compliance register (a named L1 canonical-set member) does not only cover identity/consent data — it governs minors' CONTENT: C-3 mandates data-minimization of "a child's verbatim message text"; C-1 frames the LLM call as "a third-party disclosure of a child's data." A minor's transcript in an Inngest payload to a third-party processor is both. The audit's own fix ("drop the PII field from the schema") is data minimization. A named member plausibly owns this, so canonical_set_source="" is unsupported. Caveat: C-3 literally targets the guardian-visible schema, not Inngest payloads, so the fit is by-principle — contest/flag, not a confident flip.
- **provenance:**
  - `deep-review/security-pii-inngest::summary-prior-run-filing-H1` — src: `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-security-pii-inngest/SUMMARY-prioritized.md` — evidence: apps/api/src/routes/filing.ts:175-180,244-249
- **quote[0]:** \| `routes/filing.ts:175-180,244-249` *(prior run)* \| event payload \| minor's transcript \|
- **rationale:** F-095 is a runtime PII-hygiene defect — minor's transcript leaking into an Inngest event payload at routes/filing.ts. No canonical-set member governs this: the compliance register (J0) covers COPPA/GDPR on identity/consent data, not content payloads in background jobs; the data-model canon defines 8 identity tables, not filing-route event shapes; ADRs 0009/0013/0014 address identity-lifecycle and LLM routing, not PII scrubbing in Inngest. No brief member supports an in-IF-scope call. The source audit already tags this security-pii-inngest, which is the correct owner.

### F-096 — Untested billing / quota / idempotency logic

- **workstream:** architecture · **domain:** Billing / Quota / Idempotency — Test Coverage
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** billing-and-quotas
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** RED · **normalized_priority:** P0
- **verify_status:** contested — scope-refuted(medium): A canonical member owns this seam, so source="" is wrong. data-model.md (#3) calls organization the "billing+consent+quota anchor", subscription the "Billing row, quota derived"; MMT-ADR-0002 (#7) scope = "Identity Foundation — Payer/billing capacity"; 0015 adds subscription_payers. The finding's quota/idempotency code realizes these ratified entities. The cited exclusion 0004 is itself OUT of the set (can't be cited per the lens); its text pulls the seam IN: "clean cut must keep shared-pool crediting expressible on the Organization seam (see 0002)." The brief excludes the IAP provider rail, not subscription/quota data integrity = in-IF-scope.
- **provenance:**
  - `root/architecture-audit::architecture-audit-F1` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/services/billing/metering.ts, apps/api/src/services/billing/subscription-core.ts:497, apps/api/src/services/billing/revenuecat.ts, apps/api/src/services/billing/trial.ts, apps/api/src/services/billing/quota-reconcile.ts, apps/api/src/services/webhook-idempotency.ts
- **quote[0]:** ~42 production service files lack a co-located *.test.ts; the 6 CRITICAL ones are all in billing/. 13 CRITICAL+HIGH untested files ≈ 3,294 lines of billing/quota/idempotency logic with 0 regression tests. A regression means users either can't chat (false quota exhaustion) or chat for free (quota bypass), or subscriptions silently downgrade/double-upgrade — none caught by the current suite.
- **rationale:** F-096 concerns missing test coverage for billing, quota-enforcement, and idempotency logic. None of the 20 canonical-set members covers these domains. CANONICAL-SET.md's correction note explicitly excludes billing: "MMT-ADR-0004 mobile-IAP rails remain out — billing mechanism, not core identity canon." Quota enforcement and subscription idempotency sit in the same excluded domain. No canonical-set member can be cited to bring this in-scope. The finding is real but its remediation owner is a billing/payments workstream.

### F-097 — IDOR ownership check in orchestrate-round.ts has no regression test

- **workstream:** architecture · **domain:** Test Coverage — Security Guards
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** YELLOW · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): REFUTE. Classifier excludes on file location (quiz service), but scope = which canonical invariant the defect threatens. The check (orchestrate-round.ts:75-88) blocks a profile writing/tagging under ANOTHER profile's subject — write-side cross-tenant IDOR. A NAMED member owns it: data-model.md §5.1 (#3): "person_id is the scope key for ALL learning data; migration enforces it" — subjects IS learning data. Backed by ADR-0001 (#6) edge-scoped authz and domain-model.md (#2) self-ownership/no-access-without-edge. Classifier's canonical_set_source="" auto-flags: claims no member covers it, yet one exists. Directory argument proves too much. Recommend in-IF-scope or flag-to-human.
- **provenance:**
  - `root/architecture-audit::architecture-audit-F5a` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/services/quiz/orchestrate-round.ts
- **quote[0]:** apps/api/src/services/quiz/orchestrate-round.ts — [SECURITY]-tagged IDOR ownership check, no regression test.
- **rationale:** F-097 is a missing regression test for an IDOR ownership check in apps/api/src/services/quiz/orchestrate-round.ts — a quiz-service authorization guard. None of the 20 canonical-set members covers quiz round orchestration: the L1 docs define identity/tenancy/consent/persona; ADRs 0000-0016 govern tenancy, guardianship, age transitions, LLM routing, and safety-judge architecture. An IDOR check in the quiz layer is a security-correctness concern for the workstream owning quiz/session services. The finding's own workstream tag "architecture" is the correct owner.

### F-098 — isClosePathAutoFileEligible guard in session-filing-dispatch.ts has no regression test

- **workstream:** architecture · **domain:** Test Coverage — Session Filing Guard
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** YELLOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `root/architecture-audit::architecture-audit-F5b` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/services/session/session-filing-dispatch.ts
- **quote[0]:** apps/api/src/services/session/session-filing-dispatch.ts — isClosePathAutoFileEligible guard; wrong eval = silent library data loss or duplicate filings.
- **rationale:** F-098 concerns the isClosePathAutoFileEligible guard in session-filing-dispatch.ts — a session filing eligibility and library data-integrity concern. None of the 20 locked canonical-set members covers session filing dispatch or auto-filing logic. The set is bounded to identity ontology/domain/data model/PRD, compliance register, ADRs 0000-0016 (tenancy, Payer, guardianship, consent transitions, family-join, policy-engine, LLM router, safety/judge), the model register, and the A-vs-B memo. No citation is possible. The finding's own workstream label "architecture" is the correct owner.

### F-099 — Retention cutoff math in webhook-idempotency-purge.ts (BUG-672) has no regression test

- **workstream:** architecture · **domain:** Test Coverage — Background Jobs / Retention
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** YELLOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `root/architecture-audit::architecture-audit-F5c` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/inngest/functions/webhook-idempotency-purge.ts
- **quote[0]:** apps/api/src/inngest/functions/webhook-idempotency-purge.ts — retention cutoff math (BUG-672); miscalc = unbounded table growth or over-pruning live replays.
- **rationale:** F-099 concerns retention cutoff math in webhook-idempotency-purge.ts (BUG-672) and a missing regression test. None of the 20 canonical-set members cover webhook idempotency or purge scheduling — the set covers identity ontology, tenancy/consent/guardianship model, target schema, compliance obligations, and LLM routing ADRs. No brief member can be cited to bring this in scope. The finding is already tagged "architecture" by its source; it is a durable-infrastructure concern owned by that workstream.

### F-100 — BUG-731 SQL cast in session-analytics.ts has no test for future event-type triggering cast error

- **workstream:** architecture · **domain:** Test Coverage — Session Analytics / SQL Cast
- **scope_class:** deferred · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** YELLOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `root/architecture-audit::architecture-audit-F5d` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/services/session/session-analytics.ts
- **quote[0]:** apps/api/src/services/session/session-analytics.ts — BUG-731 (metadata->>'escalationRung')::int SQL cast; safe only on ai_response rows, no test for a future event type triggering a cast error.
- **rationale:** F-100 is a SQL cast safety gap in session-analytics.ts, not identity-foundation. The 20 canonical-set members cover identity/tenancy/consent schema (L1 docs) and tenancy ownership, entity/role primitives, guardianship, age transitions, policy-engine, router runtime, and safety architecture (ADRs 0001/0002/0007-0016). None touches session analytics or learning-session metadata. The escalationRung field is LLM routing-rung telemetry in the session/analytics layer. No canonical-set member justifies in-IF-scope. Finding is real; architecture workstream owns session-service.

### F-101 — Mobile giant screens enumerated but not responsibility-analyzed (shelf, camera, sign-in, session-summary)

- **workstream:** architecture · **domain:** Module Complexity — Mobile Screens
- **scope_class:** deferred · **in_scope:** false · **target_workstream:** (none)
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** YELLOW · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `root/architecture-audit::architecture-audit-F5e` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/mobile/src/app/(app)/(tabs)/shelf/[subjectId]/book/[bookId].tsx, apps/mobile/src/app/(app)/homework/camera.tsx, apps/mobile/src/app/sign-in.tsx, apps/mobile/src/app/(app)/session-summary/[sessionId].tsx
- **quote[0]:** Mobile giants (not deep-analyzed this pass): shelf/[subjectId]/book/[bookId].tsx (2,110), homework/camera.tsx (1,705), sign-in.tsx (1,545), session-summary/[sessionId].tsx (1,481).
- **rationale:** F-101 flags four large mobile screens (shelf/book, camera, sign-in, session-summary) as not responsibility-analyzed. None of the 20 canonical-set members address mobile screen architecture or component decomposition — the set covers identity ontology, domain/data models, compliance, and LLM routing ADRs only. No canonical-set member can anchor an in-IF-scope call here. The finding is real but belongs to a mobile architecture/code-health workstream not yet formally stood up; no future owner is named in the corpus, so target_workstream is left empty.

### F-102 — Documentation / LLM-friendliness gap: JSDoc coverage ~46% on service exports

- **workstream:** architecture · **domain:** Documentation / LLM-Friendliness
- **scope_class:** deferred · **in_scope:** false · **target_workstream:** (none)
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** GREEN-YELLOW · **normalized_priority:** P2
- **verify_status:** contested — quote-not-found: Quote edited/spliced: removed 'Offsetting strengths...' middle section between lines 112–113, joining non-contiguous phrases. Not verbatim from source file.
- **provenance:**
  - `root/architecture-audit::architecture-audit-F6` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-architecture-audit.md` — evidence: apps/api/src/services/**
- **quote[0]:** JSDoc on services ≈ 46% (251 blocks / 543 exported decls, heuristic). Giants are under-documented relative to complexity. AI-assisted edits are hardest exactly in the giants, where per-module responsibility headers are missing.
- **rationale:** F-102 describes a codebase-wide JSDoc coverage deficit (~46% on service exports). None of the 20 canonical-set members — the four L1 domain docs, compliance register, or identity ADRs (MMT-ADR-0000–0016) — address documentation standards, JSDoc coverage, or LLM-editing ergonomics. The canonical set is scoped to identity/tenancy contracts, consent, compliance, and LLM-routing architecture; no brief member can be cited to bring this into identity-foundation scope. The finding is cross-cutting (all services, not identity-specific) with no ready owner among defined workstreams, so it is deferred.

### F-103 — Challenge Round mastery decision smeared across four modules

- **workstream:** architecture · **domain:** Challenge Round / mastery persistence / service architecture
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** learning-engine
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** unknown · **normalized_priority:** unknown
- **verify_status:** contested — scope-refuted(medium): Wrong question: a cohesion finding's scope turns on whether its remediation surface overlaps an IF-owned contract, not whether canon names "Challenge Round." The mastery decision IS the judge consumer — decideMasteryAndReview() parses judge output from llmResponseEnvelopeSchema. MMT-ADR-0016 (member #17) declares envelope integrity load-bearing for the state machine. The finding's "no type asserts they happen together" is a write-atomicity gap over a judge-driven transition 0016 owns; the assessments insert is also a profile-scoped write under data-model.md (#3). 0016 is a defensible cite wrongly marked uncitable. Per default-refuted under uncertainty: flag, don't route out.
- **provenance:**
  - `root/improve-codebase-architecture::improve-codebase-architecture-1` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-improve-codebase-architecture.md` — evidence: apps/api/src/services/challenge-round/evaluation.ts, challenge-round/state.ts, challenge-round/route-actions.ts, apps/api/src/services/session/session-exchange.ts:667-824
- **quote[0]:** Answering "how does a Challenge Round reach Mastery?" requires four files. The pure decision and the state transition live in `challenge-round/`, but the side effects that make mastery durable sit ~700 lines deep inside a different module. The mastery write and the state write are coupled only by file position — no type asserts they happen together.
- **rationale:** F-103 is about Challenge Round mastery decision cohesion — the mastery write and state transition are coupled only by file position across four modules, with no type guarantee of atomicity. Every canonical-set member addresses identity graph, person/role/consent/guardianship, tenancy, age transitions, LLM routing, or judge architecture. No member touches Challenge Round state machines or mastery writes. MMT-ADR-0013/0014 govern LLM routing policy, not learning-session persistence. No canonical-set member can be cited. This belongs to the learning-engine workstream.

### F-104 — session.completed dispatch stranded in the route, gated three ways (confirmed by two agents)

- **workstream:** architecture · **domain:** Session pipeline dispatch / route-service boundary
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** unknown · **normalized_priority:** unknown
- **verify_status:** confirmed
- **provenance:**
  - `root/improve-codebase-architecture::improve-codebase-architecture-2` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-improve-codebase-architecture.md` — evidence: apps/api/src/routes/sessions.ts:1547-1612, 1219-1244, 1366-1392, 1420-1442
- **quote[0]:** "Should we advance the pipeline?" is re-evaluated in three handlers with subtly different conditions. Adding a Session Summary status means auditing three closures. The dispatch owns the core-send protocol + Sentry capture but is invisible to the service layer and untestable without importing the route.
- **rationale:** F-104 concerns session.completed dispatch stranded in a route handler — triplication of conditional logic, core-send protocol visibility, testability. None of the 20 canonical-set members address learning-session event dispatch, route/service layer boundaries, or core-send protocol. The set covers identity/tenancy graph, persons/roles/consent data model, age transitions, family-join, LLM router/vetting, safety/judge — all identity-domain. Session dispatch placement is a backend architecture concern; the finding labels itself workstream "architecture" and that is the correct owner.

### F-105 — Retry-filing duplicated across two handlers — cap already drifted (live bug, confirmed by two agents)

- **workstream:** architecture · **domain:** Filing retry / route duplication / live bug
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** unknown · **normalized_priority:** unknown
- **verify_status:** confirmed
- **provenance:**
  - `root/improve-codebase-architecture::improve-codebase-architecture-3` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-improve-codebase-architecture.md` — evidence: apps/api/src/routes/sessions.ts:288-357, apps/api/src/routes/filing.ts:61-114 (hardcoded 3 at line 94 vs FILING_CONFIG.maxRetries)
- **quote[0]:** Two handlers re-implement the same three-phase Filing retry (ownership check → `claimSessionForFilingRetry` CAS → Inngest dispatch). The cap value has *already diverged* between the two — the deletion-test failure mode is in production.
- **rationale:** F-105 is about duplicated Filing-retry Inngest handlers with a diverged retry cap — a session-filing reliability defect. None of the 20 canonical-set members (ontology, domain-model, data-model, PRD, compliance register, MMT-ADR-0001/0002/0007–0016, model register, A-vs-B memo) cover Inngest handler deduplication or retry-cap governance. The canonical set is scoped to identity/tenancy, Person/Login, guardianship, age/consent, family-join, policy-engine, LLM routing/vetting, and safety/judge. Filing retries are a background-job reliability concern owned by the architecture workstream.

### F-106 — Profile-context resolution — leaky seam repeated ~20 times

- **workstream:** architecture · **domain:** Profile context / data access / conversation language
- **scope_class:** in-IF-scope · **in_scope:** true · **target_workstream:** (none)
- **canonical_set_source:** docs/canon/identity/data-model.md (target schema, 8 tables); MMT-ADR-0015 (data-model amendments — consent authority / data access / profile-management capability split)
- **source_severity:** unknown · **normalized_priority:** unknown
- **verify_status:** contested — scope-refuted(high): In-IF-scope rests on a word-collision. F-106 is code-deepening (audit: "no ADRs… route/service/schema seams"): ~20 callers re-implement inline db.select+parseConversationLanguage, fixed by accessor getProfileContext in services/profile.ts. Both anchors fail: (1) ADR-0015's "data access" = the Supporter person-EDGE capability ("visibility into the charge's learning data"), a consent concept, NOT a code accessor — two senses conflated. (2) data-model.md and ADR-0015 never mention conversation_language (grep: 0 hits), the field F-106 centers on; neither defines an accessor. The fix is a pure refactor owned by the architecture workstream; no named member owns it — uncitable.
- **provenance:**
  - `root/improve-codebase-architecture::improve-codebase-architecture-4` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-improve-codebase-architecture.md` — evidence: apps/api/src/inngest/functions/session-completed.ts:1017,1075,1167,1262,1690; apps/api/src/routes/sessions.ts, subjects.ts, assessments.ts, book-suggestions.ts, dictation.ts
- **quote[0]:** Every site needing a learner's `birthYear`, `displayName`, or Conversation Language must know which columns to read *and* remember the `string \| null → ConversationLanguage` parse. ~20 callers re-implement a data-access discipline.
- **rationale:** F-106 flags ~20 callers re-implementing the parse for identity-bearing fields (birthYear, displayName, conversationLanguage) because the identity layer publishes no clean accessor. The direct canonical anchors are data-model.md (defines these fields) and MMT-ADR-0015, which ratifies a "data access / profile-management capability split." The missing accessor is a gap in the identity-foundation's own published interface — remediation belongs to identity-foundation, not the general architecture workstream.

### F-107 — loadTopicTitle defined twice with divergent ownership joins — cross-profile data leak risk

- **workstream:** architecture · **domain:** Curriculum topic ownership / data access security
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** unknown · **normalized_priority:** unknown
- **verify_status:** contested — scope-refuted(medium): "No member governs this" is too literal. F-107's cross-Profile leak instantiates tenancy invariants in member #2 domain-model.md: inv7 self-ownership intrinsic to Person; inv8 access to another Person's data is edge-derived; Person = scoping key for every learning record. A topic title is a learning record; loadTopicTitle is the ownership predicate for inv7/8; the divergent copy returns another Profile's Topic = inv8 violation. ADR-0007 (member #8, learning data scoped to the human) is the same contract. CITABLE: domain-model inv7/8 + ADR-0007. Canon owns the invariant even if not the SQL. Classifier said none can be cited when one can; wrong out-call drops a leak fix from IF scope. \| quote-not-found: Quote missing markdown bold formatting: source has **Topic** and **Profile**, provided quote has unformatted text. Lines 121-123 of audit file.
- **provenance:**
  - `root/improve-codebase-architecture::improve-codebase-architecture-5` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-improve-codebase-architecture.md` — evidence: apps/api/src/inngest/functions/session-completed.ts:90-110, apps/api/src/services/assessments.ts:758-764, apps/api/src/services/curriculum-topic-ownership.ts
- **quote[0]:** Same name, same signature, *different* ownership semantics. The `session-completed` copy can return a Topic title that the canonical ownership check would reject — a cross-Profile leak hiding in a duplicate.
- **rationale:** F-107 is a duplicated `loadTopicTitle` with divergent ownership joins — a data-access correctness bug in the sessions/curriculum domain. None of the 20 canonical-set members (L1 identity docs, ADRs 0000–0016, compliance register, LLM-model register) govern curriculum-topic ownership-join semantics. The "cross-profile leak" is a query-scoping defect in learning-session code, not a violation of any identity-foundation contract (tenancy graph, person-entity model, consent model). No canonical-set member can be cited. Stays in the architecture workstream.

### F-108 — V0/V1 entry-gating copy-pasted across 8 screen layouts + progress

- **workstream:** architecture · **domain:** Mobile navigation / entry gating / navigation contract
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** navigation-contract
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** unknown · **normalized_priority:** unknown
- **verify_status:** contested — scope-refuted(medium): Classifier engaged only half the finding. The copy-paste-across-8-screens half is genuinely nav-contract workstream. But the second half — "V0 Parent Proxy edge case NOT represented in the contract interface" — is a proxy/guardianship MODELING gap, and MMT-ADR-0007 (set member #8) owns it: it dissolves the fused Owner/isOwner-as-proxy concept and names as root drift "a proxy-guard that mis-handles anyone outside the 2-party owner/child world." contract.isParentProxy IS that fossil, so "no set member covers this" is false. Citable anchor: docs/adr/MMT-ADR-0007. Split finding wrongly absorbed wholesale into nav; the proxy half is in-IF-scope. Flag to human. \| quote-not-found: Quote excludes markdown formatting from source: file has '**Parent Proxy**' but quote says 'Parent Proxy'
- **provenance:**
  - `root/improve-codebase-architecture::improve-codebase-architecture-6` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-improve-codebase-architecture.md` — evidence: apps/mobile/src/app/(app)/session/_layout.tsx:17-19, practice/index.tsx:444-446, topic/relearn.tsx:374-378, dictation/_layout.tsx:67-69, homework/_layout.tsx:12-14, mentor-memory.tsx:248-250, quiz/_layout.tsx:121-123, progress/index.tsx:77-85
- **quote[0]:** The same policy decision re-derived 8+ times; the V0 Parent Proxy edge case is not represented in the contract interface at all.
- **rationale:** F-108 concerns V0/V1 tab-shape gating logic duplicated across 8+ screen layouts and the V0 Parent Proxy edge case missing from the navigation contract interface. No canonical-set member covers UI tab-shape policy, resolveNavigationContract(), or screen-layout gating consolidation. The set covers identity ontology, domain model, data model, PRD, compliance register, and ADRs 0000-0016 — none bearing on navigation-contract duplication. This belongs to the navigation-contract workstream.

### F-109 — Home surface chosen in two places, kept correct only by a magic prop

- **workstream:** architecture · **domain:** Mobile navigation / home screen routing / navigation contract
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** navigation-contract
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** unknown · **normalized_priority:** unknown
- **verify_status:** contested — scope-refuted(high): REFUTED. Classifier: no member covers home-surface routing. False — member #4 prd.md owns it. Part 9 crosswalk line 311: "Guardian act-for \| proxy mode / isParentProxy (Parent Proxy warn) \| keep/retire PENDING." The home fork (home.tsx:161 home.screen==='FamilyHome'?ParentHomeScreen:LearnerScreen + showParentHome={false} magic prop) IS the guardian-act-for decision the PRD is mid-deciding. Lines 317-320 Two-vocabulary risk prescribe the clean cut "not leave both alive" — a two-site invariant on a magic prop is exactly that hazard. Remediation is gated by an unresolved IF canon decision, so in-IF-scope, source=prd.md, not in-other-workstream with empty source.
- **provenance:**
  - `root/improve-codebase-architecture::improve-codebase-architecture-7` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-improve-codebase-architecture.md` — evidence: apps/mobile/src/app/(app)/home.tsx:161-169, apps/mobile/src/components/home/LearnerScreen.tsx:492-493, apps/mobile/src/app/(app)/own-learning.tsx:39-44
- **quote[0]:** A caller must know an implementation secret to stop the child from overriding a decision already made. Two callers carry the invariant.
- **rationale:** F-109 is a UI rendering coupling: the home tab mounts LearnerScreen but the ParentHomeScreen vs learner-home decision happens inside it via a flag branch, creating a two-site invariant maintained by a magic prop. None of the 20 canonical-set members cover UI home-surface routing or navigation rendering — the set covers identity ontology, domain model, data-model schema, PRD personas/age model, compliance obligations, and the ADR trail for tenancy/guardianship/consent/policy-engine/LLM routing. This belongs to the navigation-contract workstream.

### F-110 — Error classification bypassed in 6 screens — violates UX-Resilience rule

- **workstream:** errors-api · **domain:** Mobile UX resilience / error classification
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** errors-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** unknown · **normalized_priority:** unknown
- **verify_status:** contested — scope-refuted(medium): Classifier's key premise is FALSE. It claims none of the 20 members address error classification. But member #4, docs/canon/identity/prd.md (L1 PRD), lines 171-173, explicitly cites "the repo's typed-error and classify at the API boundary rules" as authority for invariant 11 (the consent gate throws a typed error, never a crash) — the exact rule F-110 enforces. So a named member CAN be cited; canonical_set_source="" is wrong. Caveat: PRD invokes it only for the consent gate, and F-110's 6 screens (progress/dictation/session/create-subject) are learning surfaces with no consent contact, so errors-api ownership may still hold. But the stated justification is demonstrably false, so contest.
- **provenance:**
  - `root/improve-codebase-architecture::improve-codebase-architecture-8` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-improve-codebase-architecture.md` — evidence: apps/mobile/src/app/(app)/progress/index.tsx:235, progress/saved.tsx:137,225, dictation/complete.tsx:258,305, session/index.tsx:643, create-subject.tsx:94; apps/mobile/src/lib/format-api-error.ts:695-750
- **quote[0]:** Violates the stated UX-Resilience rule ("classify at the API-client boundary; screens never parse status/codes"). Raw technical messages can reach users.
- **rationale:** F-110 concerns screens bypassing the API-client-boundary error-classification rule (a UX-resilience constraint). None of the 20 canonical-set members — L1 domain docs (ontology, domain-model, data-model, prd), compliance register, ADRs 0000–0016, model register, or audit-trail memo — address error classification patterns or UX-resilience rules. Those rules are cross-cutting project engineering guidance, not identity-foundation canon. No canonical-set member can be cited to bring it in-scope. The finding is owned by the errors-api workstream, matching its source tag.

### F-111 — SSE stream route owns the quota-refund policy in five places

- **workstream:** architecture · **domain:** Quota refund / session exchange / streaming
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** unknown · **normalized_priority:** unknown
- **verify_status:** contested — scope-refuted(medium): Classifier says no canonical member covers refund — false. domain-model.md:188 + prd.md:420 explicitly rule refund ("store-delegated billing rules out a server-side refund," double-charge warning); MMT-ADR-0002 (Payer store-delegated) governs who may be charged; org owns billing+quota (inv18). So "never charge for a failed Exchange" touches canon the classifier called silent. Caveat: safeRefundQuota imports services/billing, credits per-Exchange usage quota on a stream-error path; canon's refund is subscription-payment at family-join — homonym, weaker overlap. But excluding a charge/refund finding when canon explicitly rules refund is the costly error; flag to human.
- **provenance:**
  - `root/improve-codebase-architecture::improve-codebase-architecture-9` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-improve-codebase-architecture.md` — evidence: apps/api/src/routes/sessions.ts: safeRefundQuota at ~514,800,895,1007,1162; processMessage reconstructions at ~727-769,940-947,1087-1131
- **quote[0]:** "Never charge for a failed Exchange" is a discipline the route re-implements per error path. Entangled with the streaming lifecycle.
- **rationale:** F-111 concerns quota-refund policy ("never charge for a failed Exchange") scattered across SSE stream-route error paths — a billing-logic placement and exchange-lifecycle concern. No canonical-set member covers runtime quota-charging or refund policy. MMT-ADR-0013/0014 address policy-engine shape and LLM router/vetting split. MMT-ADR-0015's "charge terminology" covers field naming only, not runtime refund semantics. The finding belongs to the architecture workstream that owns the exchange/streaming lifecycle and billing-logic placement.

### F-112 — createScopedRepository vs parent-chain joins — two adapters for one concern (revisits CLAUDE.md rule)

- **workstream:** architecture · **domain:** Data access patterns / scoped repository / authorized joins
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** unknown · **normalized_priority:** unknown
- **verify_status:** contested — scope-refuted(medium): Classifier's core claim — no canonical member covers data-access — is false. domain-model.md:44,59 + ADR-0015:134 define "data access" as an identity capability; ADR-0001 owns the identity/tenancy graph, and the profileId-scoping seam enforces it at runtime. Decisive: the finding's own reopen-trigger is "a tenant dimension beyond profileId" — data-model.md:39-41 adds exactly that (organization_id, memberships, org-scoped consent). IF org-scoping forces every createScopedRepository(profileId) join to become org-aware; that remediation is driven and owned by IF, citable to ADR-0001+data-model. "Anchors only to CLAUDE.md tier-4" conflates realness with scope. Flag-to-human. \| quote-not-found: Finding improve-codebase-architecture-11: provided quote omits '(e.g. a tenant dimension beyond `profileId`)' from lines 220-221 of source audit. Quote is partial, not verbatim.
- **provenance:**
  - `root/improve-codebase-architecture::improve-codebase-architecture-11` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-improve-codebase-architecture.md` — evidence: apps/api/src/services/retention-data.ts:251,351,492; services/session/session-topic.ts:21, session-book.ts:31-43, session-subject.ts:19-44
- **quote[0]:** "Authorized data access" has two interfaces and the choice is a per-author decision. A `createAuthorizedDataContext(db, profileId)` exposing both (`.scoped` / `.owned(topicId)`) would deepen it — **but this directly revisits the stated two-pattern rule in `CLAUDE.md`.** Worth reopening *only* if scoping must evolve; otherwise the split is deliberate and working. Record an ADR before touching it.
- **rationale:** F-112 concerns the data-access adapter pattern (createScopedRepository vs. parent-chain joins) — a cross-cutting API/repository concern. No canonical-set member (ADRs 0001/0002/0007-0016, docs/canon/identity/* docs, compliance register, model register) covers data-access adapter design. The finding anchors to CLAUDE.md's two-pattern rule, which is tier-4 evidence, not a canonical-set member. IF canon covers identity entities, tenancy, consent, schema, LLM routing, and compliance — not repository adapter unification. Remediation is owned by the architecture workstream.

### F-113 — No repo-local skill enforcing @eduagent/schemas as the API-facing type source and trust-boundary parse discipline

- **workstream:** agent-instructions · **domain:** Zod / Schema contracts
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** agent-instructions
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** unknown · **normalized_priority:** unknown
- **verify_status:** contested — scope-refuted(low): Counter (IN-IF-scope, wrongly excluded): @eduagent/schemas holds identity contract types canon fixes — data-model.md (#3): 8 tables, allowed_models, AgeBracket; ADR-0015 capability splits. A skill enforcing trust-boundary parse of identity DTOs is plausibly enforcement for those invariants, so exclusion is contestable. Decisive flag: canonical_set_source="" — NO member cited; empty cite auto-flags, uncitable scope call is unverifiable. CAVEAT: their merits are strong (0 hits for schema/zod/trust-boundary across all 4 L1 docs; skill is generic cross-DTO tooling). My in-IF case is weaker, but uncitable basis plus contract overlap clear the default-to-refuted-when-uncertain bar.
- **provenance:**
  - `root/agent-skills-recommendations::agent-skills-recommendations-1` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-agent-skills-recommendations.md` — evidence: packages/schemas/ (no specific file:line cited)
- **quote[0]:** `zod-shared-contracts`: enforce `@eduagent/schemas` as the API-facing type source, parse at trust boundaries, avoid duplicate DTOs, and use structured error contracts.
- **rationale:** F-113 concerns creating a repo-local agent skill enforcing `@eduagent/schemas` as the API-facing type source and trust-boundary parse discipline — a code-quality tooling concern. None of the 20 canonical-set members (four L1 domain docs, ADRs 0000/0001/0002/0007–0016, compliance register, model register, routing specs) address agent skill authoring or schema-contract enforcement tooling. The canonical set covers identity/tenancy model, ADR decisions, and LLM routing — not engineering-standards tooling. The finding's own stated workstream (agent-instructions) is its natural owner.

### F-114 — No repo-local skill covering Drizzle/Neon scoping rules, profileId safety, migration rollback requirements, and atomic-update patterns

- **workstream:** agent-instructions · **domain:** Drizzle / Neon / Database safety
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** agent-instructions
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** unknown · **normalized_priority:** unknown
- **verify_status:** contested — scope-refuted(medium): Counter (in-IF-scope, wrongly excluded): the skill's subject is the enforcement surface of named IF members, not generic tooling. createScopedRepository(profileId) and parent-chain ownership ARE the tenancy/profileId-safety invariants of ADR-0001 (own identity graph), 0007 (Person!=Login), 0008 (guardianship edge); migration rollback maps to ADR-0012 (baseline reset) + data-model.md cut strategy. The identity migration IS what this skill governs, so empty canonical_set_source understates the overlap. Classifier's letter-of-the-lens case is strong, but the content tie is real and scope is contestable; rule says flag when uncertain. Counter at least as strong — refute.
- **provenance:**
  - `root/agent-skills-recommendations::agent-skills-recommendations-2` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-agent-skills-recommendations.md` — evidence: apps/api/src/db/ (no specific file:line cited)
- **quote[0]:** `drizzle-neon-safety`: repo-specific scoping rules, `createScopedRepository(profileId)`, direct joins through owning ancestors, migration rollback requirements, Neon/serverless pooling, transaction and atomic-update patterns.
- **rationale:** F-114 is about a missing skill file covering Drizzle/Neon safety patterns (createScopedRepository, parent-chain joins, migration rollback, atomic updates). None of the 20 canonical-set members cover agent tooling or database-access conventions — the set is bounded to identity ontology, domain/data model, PRD, compliance register (L1), ADRs 0000–0016 (identity entities, tenancy, guardianship, schedulers, policy engine, LLM routing/safety), and the vetted-model register (L3). No canonical-set member is citeable. The finding's own workstream tag (agent-instructions) is the correct owner.

### F-115 — No repo-local skill encoding i18n key hygiene rules, JSX literal ratchet policy, and UI-vs-conversation language enum rules

- **workstream:** agent-instructions · **domain:** i18n / Localization
- **scope_class:** deferred · **in_scope:** false · **target_workstream:** (none)
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** unknown · **normalized_priority:** unknown
- **verify_status:** confirmed
- **provenance:**
  - `root/agent-skills-recommendations::agent-skills-recommendations-3` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-agent-skills-recommendations.md` — evidence: scripts/check-i18n-orphan-keys.ts, scripts/i18n-keep.ts (no specific line cited)
- **quote[0]:** `i18next-mobile-hygiene`: repo-specific translation key hygiene, `scripts/check-i18n-orphan-keys.ts`, `scripts/i18n-keep.ts`, JSX literal ratchet policy, interpolation fallback companion keys, and UI-vs-conversation language enum rules.
- **rationale:** F-115 covers i18n key hygiene rules, JSX literal ratchet policy, interpolation fallback conventions, and UI-vs-conversation language enum divergence. None of the 20 canonical-set members address i18n, translation tooling, or language enums. The set covers identity/tenancy, person/role/consent data model, compliance obligations, LLM routing/safety, and the documentation layer model. I18n hygiene is a mobile engineering / developer-experience concern outside the identity-foundation carve-out. No workstream is currently named as ready to own it, so it is deferred with no target_workstream.

### F-116 — No repo-local skill covering GitHub Actions security checklist (SHA pinning, pull_request_target, OIDC, secrets, cache poisoning, AI-agent prompt injection)

- **workstream:** agent-instructions · **domain:** GitHub Actions / CI security
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** platform-security / ci-cd-hardening
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** unknown · **normalized_priority:** unknown
- **verify_status:** confirmed
- **provenance:**
  - `root/agent-skills-recommendations::agent-skills-recommendations-4` — src: `docs/audit/2026-05-29-full-audit/2026-05-29-agent-skills-recommendations.md` — evidence: .github/workflows/ (no specific file:line cited)
- **quote[0]:** `github-actions-security-review`: repo-specific workflow review checklist built from GitHub secure-use docs plus Sentry's `gha-security-review`: SHA pinning, `pull_request_target`, `workflow_run`, OIDC, `permissions`, secrets, cache poisoning, and AI-agent workflow prompt injection.
- **rationale:** F-116 is about GHA security hygiene (SHA pinning, pull_request_target, OIDC, secrets, cache poisoning, AI-agent prompt injection). None of the 20 canonical-set members address CI/CD pipeline or workflow security. The four L1 docs and compliance register define the identity/tenancy model; ADRs 0000–0016 cover tenancy architecture, policy engine, LLM routing, and documentation governance. GHA hardening is a platform/infrastructure concern. No canonical-set member can justify IF scope; this belongs to a platform-security or CI/CD-hardening workstream.

### F-117 — Proxy-mode session write protection relies on a client-side redirect for non-metered writes

- **workstream:** security-pii-api · **domain:** acl-check
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(high): REFUTE. Classifier's premise — "no canonical member defines proxy write semantics; ADR-0007 is only historical" — is false. ADR-0008 (member #9) defines operate/manage/view(G,C): "a credentialed charge suppresses the guardian's operate" (L20,24). domain-model.md (#2) §4 splits "derived guardian view (Layer 2)" from operate via one named resolver; ADR-0007 (#8) dissolves isOwner as auth source. The finding IS the runtime violation: guardian gets WRITE(operate) where canon grants only view. CL-B's target seam is ADR-0008's resolver. "Lives in middleware" doesn't move scope. In-IF-scope, canonical_set_source=MMT-ADR-0008. Empty source on an out-call is itself the auto-flag. \| quote-not-found: Quote is incomplete. File includes 'Tracing the server routes used by the session flow shows' before 'assertNotProxyMode is applied'. The provided quote omits this introductory phrase.
- **provenance:**
  - `root/deepsec-handover::deepsec-HIGH-acl-check-336e2bca03` — src: `.deepsec/findings/HIGH/eduagent-build-acl-check-336e2bca03.md` — evidence: apps/mobile/src/app/(app)/session/_layout.tsx:9
- **quote[0]:** SessionLayout redirects parent-proxy users away from the session UI, but that is only a client-side navigation guard. assertNotProxyMode is applied to session creation, clear-continuation-depth, interleaved sessions, and metered LLM routes, but non-metered session writes such as close, system-prompt, events, input-mode, homework-state, flag, summary submit/skip, and parking-lot writes do not consistently call the server-side proxy guard.
- **rationale:** F-117 is a runtime API route enforcement gap: missing server-side assertNotProxyMode calls on non-metered session-write endpoints. None of the 20 canonical-set members define proxy-mode write semantics or session-route authorization. ADR-0007 mentions proxy-guard only as historical context motivating the entity/role redesign, not as a route-guard invariant. The audit corpus (CL-B, consolidated-triage.md:223-234) clusters this under Proxy-mode write authority as an API surface gap. Remediation belongs in API middleware, not identity-model code.

### F-118 — Consent request can target arbitrary same-account profiles

- **workstream:** security-pii-api · **domain:** acl-check
- **scope_class:** in-IF-scope · **in_scope:** true · **target_workstream:** (none)
- **canonical_set_source:** MMT-ADR-0015 (consent authority / data access / profile-management capability split); docs/canon/identity/domain-model.md (consent model, guardianship edges); docs/canon/identity/data-model.md (target schema)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): The finding is a runtime AUTHZ defect in a current consent-request endpoint (IDOR: checks only account membership, not initiator authority/target eligibility/direction). Cited members disclaim it: domain-model.md says "NOT behaviour" yet an authz check IS behaviour; ADR-0015 "fixes shape" only; data-model.md is target schema, not an API authz owner. The IF set is target-state DESIGN; no member owns a present route handler. Classifier conflated "canon describes the consent-authority concept" with "IF owns remediation of this bug." A security-workstream reading is at least as strong; absorbing a live destructive-authz hole into a design carve-out is the costly error — default refuted. \| quote-not-found: provenance[0]: Quote text omits phrase 'Because the emailed token can later be denied...' which appears in .deepsec/findings/HIGH/eduagent-build-acl-check-911b3664da.md line 13
- **provenance:**
  - `root/deepsec-handover::deepsec-HIGH-acl-check-911b3664da` — src: `.deepsec/findings/HIGH/eduagent-build-acl-check-911b3664da.md` — evidence: apps/mobile/src/app/consent.tsx:46-180
- **quote[0]:** The screen trusts the URL-provided profileId and sends it as childProfileId when creating or resending a consent request. The traced API path only verifies that childProfileId belongs to the authenticated account, not that the active profile is allowed to initiate consent for that target, that the target is a non-owner child, or that the target currently requires consent. A same-account non-owner profile could create a consent token for an owner/adult/sibling profile and cause destructive cross-profile data loss.
- **rationale:** F-118 describes missing enforcement of consent-authority rules: the API checks account-level ownership but not initiator authority, target eligibility (non-owner child needing consent), or directionality (guardian→child only). MMT-ADR-0015 explicitly ratified the "consent authority / data access / profile-management capability split"; domain-model.md owns the consent model and guardianship-edge semantics; data-model.md fixes the target schema. This is a gap in enforcing rules the identity-foundation workstream already ratified — unambiguously in-IF-scope.

### F-119 — Any @claude issue or comment can invoke a secret-backed agent

- **workstream:** security-pii-api · **domain:** missing-auth
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH · **normalized_priority:** P1
- **verify_status:** confirmed
- **provenance:**
  - `root/deepsec-handover::deepsec-HIGH-missing-auth-ee640e6ddf` — src: `.deepsec/findings/HIGH/eduagent-build-missing-auth-ee640e6ddf.md` — evidence: .github/workflows/claude.yml:20-45
- **quote[0]:** The job condition only checks whether issue, comment, or review text contains @claude. It does not verify author_association, team membership, labels, or maintainer approval before starting anthropics/claude-code-action with CLAUDE_CODE_OAUTH_TOKEN and id-token: write. On repos where untrusted users can open issues or comment, an attacker can consume the Claude OAuth quota and drive the agent with prompt content under their control.
- **rationale:** F-119 is a GitHub Actions CI/CD pipeline authorization gap — any commenter can trigger anthropics/claude-code-action with CLAUDE_CODE_OAUTH_TOKEN and id-token: write because the workflow omits author_association/team-membership checks. This is a DevSecOps/CI infrastructure finding. None of the 20 canonical-set members (L1 domain docs, compliance register, ADRs 0000–0016, LLM model register, A-vs-B memo) address CI workflow authorization or GitHub Actions OAuth token gating. No canonical-set citation is possible. The finding belongs to security-pii-api, which the source already assigned.

### F-120 — Same-day dictations in the same mode overwrite each other

- **workstream:** security-pii-api · **domain:** other-data-loss
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH_BUG · **normalized_priority:** P0
- **verify_status:** contested — scope-refuted(medium): CONTESTED. canonical_set_source="" yet a confident out-of-scope call - the empty citation IS the contest signal. The upsert keys on (profile_id,date,mode); profile_id is owned by data-model.md (#3): person "Replaces (legacy) profiles"; "person_id is the scope key for all learning data" (L358); blast radius "every FK into person", "all learning data". dictation_results.profile_id is a learning-data FK into the renamed entity; its constraint fix lands inside the MMT-ADR-0012 clean-cut reset where tables are "born in the shape they have", making #3 citable. Concession: bug is orthogonal to identity and dictation_results isn't a named baseline table. Net: wrong exclusion costs more than a flag. \| quote-not-found: Quote is truncated; actual file text includes middle sentence about practice ledger deduplication that is omitted in the provided verbatim_quote
- **provenance:**
  - `root/deepsec-handover::deepsec-HIGH_BUG-other-data-loss-e0853d1c31` — src: `.deepsec/findings/HIGH_BUG/eduagent-build-other-data-loss-e0853d1c31.md` — evidence: apps/api/src/services/dictation/result.ts:33-59
- **quote[0]:** recordDictationResult records only profile/date/mode identity when it calls repo.dictationResults.insert. The repository upserts on (profile_id, date, mode), so a legitimate second homework or surprise dictation on the same day overwrites the first result. The mobile flow exposes 'Try another dictation', so this is reachable as normal user behavior, not just retry behavior.
- **rationale:** F-120 is a data-integrity defect in dictation result recording: upsert on (profile_id, date, mode) silently overwrites a second same-day dictation. None of the 20 canonical-set members cover dictation result storage or assessment upsert semantics. The L1 docs and L2 ADRs address identity/tenancy, guardianship, age/consent, family-join, policy engine, and LLM routing — not assessment persistence. No canonical-set source can be cited. The finding belongs to the workstream that owns dictation/assessment data integrity, matching its own tagged workstream.

### F-121 — Trial-expiry cron can downgrade a just-converted paying subscriber (missing status='trial' guard)

- **workstream:** security-pii-api · **domain:** other-race-condition
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** billing-subscriptions
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH_BUG · **normalized_priority:** P0
- **verify_status:** contested — scope-refuted(medium): REFUTE. Classifier set canonical_set_source="" yet confidently said in-other-workstream — empty source auto-flags, not a clean hand-off. Two named members own this. data-model.md §4.5 makes subscription.status NOT NULL and org the quota anchor with quota "derived"; the blind UPDATE violates that by driving status/tier/quota incoherent. MMT-ADR-0002 store-delegation says store-completes = valid Payer, so a cron clobbering a just-converted PAID row to expired/free contradicts store-as-adjudicator and trips 0002's banned silent-billing-recovery. Caveat: canon models table structure, not transition ordering. But uncertain + citable owners + default-refuted = refuted. \| quote-not-found: Quote diverges from .deepsec/findings/.../eduagent-build-other-race-condition-4ebbd964c7.md:13 — omits file ref, says 'quota pool' not 'quota pool to extended-trial limit', truncates after 'webhook'.
- **provenance:**
  - `root/deepsec-handover::deepsec-HIGH_BUG-other-race-condition-4ebbd964c7` — src: `.deepsec/findings/HIGH_BUG/eduagent-build-other-race-condition-4ebbd964c7.md` — evidence: apps/api/src/services/billing/trial.ts:229-243
- **quote[0]:** transitionToExtendedTrial() is invoked by the daily trial-expiry cron for every row returned by findExpiredTrials() (WHERE status='trial' AND trialEndsAt <= now). The UPDATE unconditionally sets status='expired', tier='free' and rewrites the quota pool, guarded ONLY by eq(subscriptions.id, subscriptionId). Between the cron's SELECT and this UPDATE, the same subscription row can be converted to a paid plan by the RevenueCat RENEWAL/INITIAL_PURCHASE webhook.
- **rationale:** F-121 is a TOCTOU race in the subscription status machine: the trial-expiry cron unconditionally writes status='expired' without re-checking whether a RevenueCat webhook already converted the row to paid. No canonical-set member governs subscription state transitions or cron/webhook ordering. MMT-ADR-0002 (payer capacity store-delegated) decides adjudication authority, not lifecycle correctness. The finding lives entirely in the billing/subscription engine, not in the identity/tenancy graph or any surface the canonical set governs. Owner: billing-subscriptions workstream.

### F-122 — Deletion cancellation/restoration checks are not atomic with final deletes

- **workstream:** security-pii-api · **domain:** other-race-condition
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH_BUG · **normalized_priority:** P0
- **verify_status:** contested — scope-refuted(high): Classifier's key claim "no canonical-set member governs deletion atomicity" is FALSE. It checked only ADR-0009 + compliance register, missing MEMBER #3 data-model.md §6, the deletion-path design. §6.1 verbatim: "The re-home transaction is a single atomic step; a half-done delete is not a valid state." The finding violates this: restoreConsent() atomically clears archivedAt (consent transition, inv 12/27); the unconditional DELETE then cascade-deletes the restored profile, which inv 21 forbids. So it IS in-IF-scope, citable to data-model.md §6.1 + inv 21. Classifier inverted the hierarchy — let the raw security-pii-api tag pick workstream after wrongly finding no governing member.
- **provenance:**
  - `root/deepsec-handover::deepsec-HIGH_BUG-other-race-condition-a46e5673e1` — src: `.deepsec/findings/HIGH_BUG/eduagent-build-other-race-condition-a46e5673e1.md` — evidence: apps/api/src/services/deletion.ts:162-171
- **quote[0]:** executeDeletion() and deleteProfile() delete solely by primary key. Their production call sites check cancellation or consent/archive state in separate steps and then call these helpers. If account deletion is cancelled, or consent is restored/archive status cleared, after the check but before the unconditional DELETE, the account/profile can still be deleted and cascade child records.
- **rationale:** F-122 is a TOCTOU race in the deletion pipeline — cancellation/consent checks occur in separate steps from the unconditional DELETE, so a concurrent cancellation or consent restoration can still result in destructive data loss. This is an operational correctness defect in deletion execution. No canonical-set member governs deletion atomicity: the compliance register covers GDPR policy obligations; MMT-ADR-0009 covers durable scheduling of consent transitions, not deletion transaction design. The finding belongs to the source-tagged workstream: security-pii-api.

### F-123 — Dormant web ChatShell still exposes voice controls bound to stale session handlers

- **workstream:** l10n-a11y-mobile · **domain:** other-stale-instance-action
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH_BUG · **normalized_priority:** P0
- **verify_status:** contested — quote-not-found: Quote is truncated: missing 'Other interactive voice surfaces remain outside that dormant guard:' between 'isFocused.' and 'VoicePlaybackBar' from file line 13
- **provenance:**
  - `root/deepsec-handover::deepsec-HIGH_BUG-other-stale-instance-action-063502d673` — src: `.deepsec/findings/HIGH_BUG/eduagent-build-other-stale-instance-action-063502d673.md` — evidence: apps/mobile/src/components/session/ChatShell.tsx:199-919
- **quote[0]:** ChatShell explicitly handles RN Web keeping inactive Stack screens mounted by hiding only the input row and guarding handleSend with isFocused. VoicePlaybackBar, voice error retry, and VoiceTranscriptPreview still render, and handleVoiceSend calls onSend without checking focus. If an inactive session retains a pending voice transcript or voice controls overlap the active screen, a tap can send or replay content through the old session's handlers.
- **rationale:** F-123 is a ChatShell RN Web session-isolation bug: inactive screens stay mounted, VoicePlaybackBar/voice controls still render, and handleVoiceSend fires without focus-checking, allowing stale-session dispatch. This is a chat-UI/session-lifecycle concern. None of the 20 canonical-set members (ontology, domain-model, data-model, prd, compliance register, ADRs 0000-0016, model register, A-vs-B memo) address ChatShell mounting, voice control rendering guards, or session handler focus gating. No member can be cited. Finding belongs to l10n-a11y-mobile.

### F-124 — Top-up credits permanently stranded after upgrading from a shared-pool tier to a per-profile tier

- **workstream:** security-pii-api · **domain:** other-value-loss
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** billing-subscriptions
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** HIGH_BUG · **normalized_priority:** P0
- **verify_status:** contested — scope-refuted(medium): Classifier excludes F-124 but rests it on MMT-ADR-0002 (member #7), which ratifies the rule F-124 breaks: reconcile to entitlement with a metric/event; silent-recovery banned in billing. F-124 = paid credits silently lost, no metric. The defect is a scope-key (profileId) stamped at purchase, never re-derived on tier change — migration-shaped, in the domain IF governs. So a member plausibly owns the fix; in_scope arguably true. And canonical_set_source="" contradicts the rationale, which turns on 0002. Exclusion substance is real (no topUpCredits table in the 20 members), but per the uncertainty default this counter is at least as strong: flag, not silently exclude.
- **provenance:**
  - `root/deepsec-handover::deepsec-HIGH_BUG-other-value-loss-e9ddd7be3e` — src: `.deepsec/findings/HIGH_BUG/eduagent-build-other-value-loss-e9ddd7be3e.md` — evidence: apps/api/src/services/billing/top-up.ts:128-182
- **quote[0]:** purchaseTopUpCredits() stamps the credit row's profileId based on the subscription's CURRENT quotaModel at purchase time: shared-pool tiers (free/plus) store profileId=null, per-profile tiers (family/pro) store profileId=owner.id. The credit's profileId is never migrated when the tier later changes (handleTierChange / reconcileQuotaStateForEffectiveTier / RevenueCat PRODUCT_CHANGE all touch quota pools/profileQuotaUsage but not topUpCredits).
- **rationale:** F-124 is a billing/quota accounting bug: top-up credit rows stamped at purchase time are never migrated when tier changes, leaving credits stranded. The defect lives entirely in purchaseTopUpCredits(), handleTierChange(), reconcileQuotaStateForEffectiveTier(), and RevenueCat PRODUCT_CHANGE flows. None of the 20 canonical-set members cover topUpCredits table lifecycle or tier-transition credit reconciliation. MMT-ADR-0002 covers Payer capacity placement in the identity schema, not credit-row migration on tier change. No canonical-set member touches quota pools or billing data migration.

### F-125 — GET /account/deletion-status lacks the owner gate its three sibling routes enforce

- **workstream:** security-pii-api · **domain:** acl-check
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Canon states invariants, not route lists; mapping is by invariant, so "no member addresses route-gating" is too narrow. Citable members own this: domain-model.md (#2) inv 8 — access to another Person's data is edge-derived; Membership alone grants only existence-visibility — plus inv 7 self-ownership, inv 22 (Data visibility must never fuse). A non-owner reading getDeletionStatus(account.id) with no edge violates inv 8. ADR-0015 (#16) defines the data-access/profile-mgmt capability split. So canonical_set_source IS citable (domain-model inv 7/8), contradicting the empty string the schema auto-flags. Repo confirms the gap (account.ts L45-52 vs gated L63/87/178). At minimum contested. \| quote-not-found: Quote is paraphrased, not verbatim. Source text includes: '— POST /account/delete (L59), POST /account/cancel-deletion (L123), GET /account/export (L150) —' and '(e.g. a child on a parent's family account...)' and 'therefore', all absent from provided quote.
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-acl-check-18e8be58a2` — src: `.deepsec/findings/MEDIUM/eduagent-build-acl-check-18e8be58a2.md` — evidence: apps/api/src/routes/account.ts:38-44
- **quote[0]:** The three mutating/exporting account routes call assertOwnerProfile(c, ...) so only the account owner can use them. GET /account/deletion-status (L38-52) does NOT. Any non-owner profile active on the same account can read getDeletionStatus(db, account.id), which returns {scheduled, deletionScheduledAt, gracePeriodEnds}.
- **rationale:** F-125 is a runtime API authorization gap — missing `assertOwnerProfile` on `GET /account/deletion-status`. The canonical set (20 members) covers identity ontology, domain/data models, age/consent model, compliance register, and ADRs on tenancy (0001), guardianship (0008), transitions (0009), policy-engine (0013/0014), and safety (0016). None address which routes must enforce owner-gating at runtime. No canonical-set member can be cited to bring this in-IF-scope. The finding's own workstream tag (`security-pii-api`) is the correct owner.

### F-126 — Library-filing write endpoints missing proxy-mode guard

- **workstream:** security-pii-api · **domain:** acl-check
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Arguing in-IF-scope (classifier said in-other-workstream). Premise that no canonical member pulls route-guard audits into IF scope is false. MMT-ADR-0007 (member 8) Context names the proxy-guard as a root-cause drift the foundation exists to correct: quote, a proxy-guard that mis-handles anyone outside the 2-party owner/child world (RC-01, RC-02, PPA-R02, RC-07). Three Library endpoints inconsistently calling assertNotProxyMode IS that inconsistency. Anchor 2: prd.md (member 4) L311 lists proxy mode/isParentProxy as guardian-act-for, keep/retire pending, an open IF decision. So canonical_set_source=MMT-ADR-0007, not blank. Counter at least as strong. \| quote-not-found: Quote is a paraphrase, not verbatim. Provided quote omits line numbers (L441, L625, L1189, etc.) for endpoints and abbreviates the list. Actual file includes 'messages L441, stream L625, ..., summary L1401, and crucially' which the provided quote lacks.
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-acl-check-4669badcf7` — src: `.deepsec/findings/MEDIUM/eduagent-build-acl-check-4669badcf7.md` — evidence: apps/api/src/routes/sessions.ts:360-407
- **quote[0]:** The three Library-filing write endpoints — POST /sessions/:sessionId/library-filing/keep-out (L360), /add (L379), and /restore (L407) — do NOT call assertNotProxyMode(c), unlike every other write endpoint in this file (messages, stream, close, system-prompt, events, input-mode, homework-state, flag, summary/skip, and the sibling retry-filing endpoint at L291 which DOES have the guard).
- **rationale:** F-126 is a missing assertNotProxyMode() guard on three Library-filing write endpoints — an API security enforcement gap, not a defect in the identity model or contracts. The identity-foundation workstream owns the definition/contracts for proxy mode (MMT-ADR-0001, MMT-ADR-0007), but the sweep of every route handler for correct guard invocation belongs to security-pii-api. No canonical-set member pulls individual route-handler guard audits into identity-foundation scope. Source audit assignment (security-pii-api) is correct.

### F-127 — issues:write granted at workflow scope leaks to every deploy job that does not need it

- **workstream:** security-pii-api · **domain:** excessive-permissions
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-excessive-permissions-bbcd767d88` — src: `.deepsec/findings/MEDIUM/eduagent-build-excessive-permissions-bbcd767d88.md` — evidence: .github/workflows/deploy.yml:37-40
- **quote[0]:** The top-level permissions: block (L37-40) sets issues: write, which every job in the workflow inherits: api-quality-gate, api-confirm-production, api-deploy, mobile jobs, and smoke-test jobs. Only the two failure-notification steps that call actions/github-script to open an issue actually require it.
- **rationale:** F-127 is a CI/CD hardening finding — over-broad workflow-level issues:write permissions leaking to deploy jobs. None of the 20 canonical-set members cover GitHub Actions permission scoping: the L1 docs address identity ontology/domain/data model/PRD/compliance; the L2 ADRs cover tenancy, guardianship, age transitions, policy engine, and LLM routing/safety. No member can be cited to pull this into identity-foundation scope. The finding is real and already tagged workstream=security-pii-api, which is the correct owner for infrastructure/API security hardening.

### F-128 — Homework summary LLM call can run without quota

- **workstream:** security-pii-api · **domain:** expensive-api-abuse
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-expensive-api-abuse-ab0387d47f` — src: `.deepsec/findings/MEDIUM/eduagent-build-expensive-api-abuse-ab0387d47f.md` — evidence: apps/api/src/services/homework-summary.ts:176-222
- **quote[0]:** extractHomeworkSummary calls routeAndCall even when there is no transcript. The session-completed job invokes this for homework sessions, while starting and closing homework sessions are not metered LLM routes. An authenticated user can create and close skipped homework sessions to trigger background LLM summary calls without consuming visible question quota.
- **rationale:** F-128 is a quota-bypass/billing-integrity issue: skipped homework sessions trigger background LLM summary calls via extractHomeworkSummary without consuming visible question quota. No canonical-set member governs LLM quota enforcement on background jobs. MMT-ADR-0014 (router runtime/vetting split) covers routing architecture, not metering gates. MMT-ADR-0013 covers policy-engine spine, not cost-abuse prevention. The compliance register covers COPPA/GDPR, not API abuse. The finding names its home workstream (security-pii-api), which correctly owns quota-bypass and LLM cost-abuse remediation.

### F-129 — PR title/author/base interpolated into inline prompt without untrusted-data framing

- **workstream:** security-pii-api · **domain:** llm-prompt-injection
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — quote-not-found: Quote found in source but with formatting discrepancy: source has backticks around code elements (e.g., `prompt: ...`), provided quote omits backticks. Not verbatim.
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-llm-prompt-injection-65211969f0` — src: `.deepsec/findings/MEDIUM/eduagent-build-llm-prompt-injection-65211969f0.md` — evidence: .github/workflows/claude-code-review.yml:34-213
- **quote[0]:** The steps that actually run (L185-214) pass prompt: ${{ env.CLAUDE_REVIEW_PROMPT }}. That env-var prompt embeds attacker-controlled PR metadata directly and early: TITLE: ${{ github.event.pull_request.title }} (L39), AUTHOR: ${{ github.event.pull_request.user.login }} (L40), BASE: ${{ github.event.pull_request.base.ref }} (L41) — before the weaker inline 'treat PR files as untrusted' line.
- **rationale:** F-129 is a prompt-injection flaw in a GitHub Actions CI workflow: PR metadata (title, author, base ref) is interpolated into CLAUDE_REVIEW_PROMPT before any untrusted-data framing. This is a CI/DevSecOps finding with no connection to any canonical-set member. The set covers identity/tenancy, Clerk auth, payer capacity, guardianship, age/consent, data schema, policy-engine, LLM router/vetting, safety/judge architecture, and the compliance register (COPPA/GDPR/EU AI-Act/OSA/DPIA) — none address GitHub Actions workflow security or CI prompt-injection hygiene. Belongs to security-pii-api.

### F-130 — Minimum-age enforcement uses birth year instead of full birth date

- **workstream:** security-pii-api · **domain:** other-age-gate-bypass
- **scope_class:** in-IF-scope · **in_scope:** true · **target_workstream:** (none)
- **canonical_set_source:** docs/compliance/identity-compliance-register.md (COPPA/GDPR consent-capacity obligations); docs/canon/identity/prd.md (three-axis age model, 13+ floor, sub-13 built-but-gated); MMT-ADR-0015 (consent authority capability split)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-other-age-gate-bypass-01cad8dd03` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-age-gate-bypass-01cad8dd03.md` — evidence: apps/mobile/src/app/create-profile.tsx:157-163
- **quote[0]:** The UI collects a full birth date but sends only birthYear to the API. The server-side consent check uses currentYear - birthYear, so a child who is still 10 but turns 11 later in the calendar year is treated as 11 and can avoid the parental-consent flow.
- **rationale:** F-130 is a correctness defect in age-to-consent-capacity derivation: birthYear-only arithmetic lets a pre-threshold child bypass the parental-consent gate. The IF canonical set owns this: the compliance register (J0 member) codifies binding COPPA/GDPR rules and the 13+ floor; prd.md defines the three-axis age model; MMT-ADR-0015 defines the consent-authority capability split that makes the gate load-bearing. A truncated birth-date computation that can miscategorise a child's consent capacity is a direct gap in IF-owned consent rules, not a peripheral API security issue.

### F-131 — Streaming extractor can show a different reply than the one parsed and persisted

- **workstream:** security-pii-api · **domain:** other-audit-bypass
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): CONTESTED — plausibly in-IF-scope, citable to MMT-ADR-0016 (member 17), which classifier set source="". ADR-0016 sec2: "envelope integrity is load-bearing for the state machine." Judge emits the structured envelope; state machine acts on the parsed/persisted envelope. F-131 IS an envelope-integrity break: stream renders a nested reply while completion-time parse persists a DIFFERENT top-level reply (confirmed in code: first-match regex vs parse-at-close). What the human trusts diverges from what judge/record act on — the integrity ADR-0016 makes load-bearing. Exclusion rests on a thin mechanism/policy line. source="" auto-flags; brief says default-refuted when uncertain. Route to human.
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-other-audit-bypass-87ea29a0cc` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-audit-bypass-87ea29a0cc.md` — evidence: apps/api/src/services/llm/stream-envelope.ts:17-318
- **quote[0]:** streamEnvelopeReply finds the first regex match for a reply key anywhere in the raw stream, not specifically the top-level envelope reply. If an LLM response includes an unknown object before the real top-level reply, the stream can emit the nested reply and then discard the rest, while completion-time parsing accepts the top-level reply and persists different text.
- **rationale:** F-131 is a correctness defect in LLM streaming envelope extraction: streamEnvelopeReply regex-matches the first reply key in the raw stream, potentially emitting a nested reply while completion-time parsing persists the top-level reply — stream and storage diverge. None of the 20 canonical-set members address streaming envelope parsing or stream-vs-persist consistency. Identity-foundation scope covers identity/tenancy, payer, guardianship, age/consent, data model, policy-engine, and safety/judge architecture — no member is citable. Finding belongs to security-pii-api.

### F-132 — Review gate parses an unauthenticated PR comment as the source of truth — verdict is forgeable

- **workstream:** security-pii-api · **domain:** other-ci-gate-bypass
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — quote-not-found: Provided quote is paraphrased, not verbatim. Actual file text includes line references (L228-288, L235, etc.), mentions `gh api .../comments --paginate`, includes 'created_at' ordering, and references 'must/should-fix counts' — details omitted from the provided quote.
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-other-ci-gate-bypass-b391d49e68` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-ci-gate-bypass-b391d49e68.md` — evidence: .github/workflows/claude-code-review.yml:235-288
- **quote[0]:** The 'Evaluate review verdict' step determines whether the PR's review check passes by fetching ALL PR issue comments, filtering to comments after REVIEW_RUN_STARTED_AT whose body contains '## Claude Code Review:', taking the LAST such comment, and parsing the verdict from that comment body with sed. It never verifies the comment AUTHOR.
- **rationale:** F-132 is a CI/CD pipeline integrity issue: the GitHub Actions review-verdict step trusts any matching PR comment without verifying the author, making the gate forgeable. No canonical-set member addresses CI workflow security — the L1 docs cover identity/tenancy/consent/compliance; the L2 ADRs (0000–0016) cover tenancy ownership, payer capacity, person/role/guardianship, data-model, LLM routing/safety; L3 covers vetted models. No member speaks to PR gate integrity. The finding is real but owned by the security-pii-api workstream, not identity-foundation.

### F-133 — Only 'SAFETY' block reason treated as safety filter; other Gemini block reasons trigger cross-provider failover

- **workstream:** security-pii-api · **domain:** other-content-safety-fallback
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Classifier ruled out with canonical_set_source="", framing it as provider-integration parsing. Counter: the defect is a path where a policy/safety-blocked Gemini response FAILS OVER to OpenAI/Anthropic — a direct violation of MMT-ADR-0014 §4 (member #15), which calls fail-closed-on-policy-block "a structural property of the router mechanism," names getFallbackConfig, and states a compliance-ineligible model is never a fallback target. Finding's own words: weakens "the safety guarantee the app is built around" for a minors-only app — core of MMT-ADR-0016 (#16). Scope follows the invariant violated, not the bug's layer. A citable member exists; the empty source is itself the auto-flag. \| quote-not-found: Quote is paraphrased, not verbatim. File adds 'for this minors-only app (SAFETY_SETTINGS_FOR_MINORS)', details about extractResponseText/SafetyFilterError, backticks around Error string, and line numbers. Starts with 'Gemini's safety enforcement is only honored...' but diverges mid-sentence.
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-other-content-safety-fallback-a34899eb0a` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-content-safety-fallback-a34899eb0a.md` — evidence: apps/api/src/services/llm/providers/gemini.ts:175-301
- **quote[0]:** Gemini's safety enforcement is only honored when the block reason is the exact literal 'SAFETY'. The Gemini API also returns the distinct, content-blocking reasons PROHIBITED_CONTENT, BLOCKLIST, SPII, and RECITATION. When Gemini blocks for one of those, the non-streaming path falls through to throw new Error('Gemini returned empty response') and the streaming path simply yields zero text chunks.
- **rationale:** F-133 is a correctness bug in the Gemini API client: only 'SAFETY' triggers safety-filter treatment; PROHIBITED_CONTENT, BLOCKLIST, SPII, RECITATION fall through to generic error paths. MMT-ADR-0014 (router runtime/fail-closed) and MMT-ADR-0016 (safety/judge architecture) are in the canonical set but govern architectural shape, not the parsing of provider-specific block reason codes. No canonical-set member scopes this into identity-foundation. The finding belongs to the LLM provider integration layer, owned by its source workstream.

### F-134 — RevenueCat identity-sync race can cache another account's entitlement snapshot under the new user's key

- **workstream:** security-pii-api · **domain:** other-cross-account-entitlement-race
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Classifier excludes via ADR-0004 (mobile-IAP, correctly out) — a strawman the finding never needed. Two in-set members own it: ADR-0002 (#7, scoped "Identity Foundation — Payer/billing capacity"), whose amendment names RevenueCat our Payer processor and whose open E3 is "which Person we RECORD as Payer" — the binding this race corrupts; and ADR-0001 (#6, own the identity/tenancy graph), since the trigger is a shared-device account switch leaking A's entitlement across B's tenancy boundary — core IF isolation. Plus canonical_set_source="" auto-flags. Concession: store_customer_ref is a link not authority, so a billing reading is defensible — but cross-account leak is at least as strong. \| quote-not-found: Quote is paraphrased, not verbatim. Source has backticks, parentheticals, and different phrasing. Found in .deepsec/findings/MEDIUM/.../520de4c9fa.md line 13.
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-other-cross-account-entitlement-race-520de4c9fa` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-cross-account-entitlement-race-520de4c9fa.md` — evidence: apps/mobile/src/hooks/use-revenuecat.ts:70-164
- **quote[0]:** useRevenueCatIdentity() syncs Clerk identity to RevenueCat via Purchases.logIn(userId)/logOut() inside an async effect. Separately, useCustomerInfo() runs Purchases.getCustomerInfo() in a TanStack query keyed by userId. The two are not ordered: when account A signs out and account B signs in on a shared device, the Clerk userId flips to B and the customerInfo query immediately refetches under key B, but Purchases.logIn(B) may not have completed yet.
- **rationale:** F-134 is a race between Purchases.logIn and getCustomerInfo in the RevenueCat SDK layer. MMT-ADR-0002 (Payer capacity store-delegated) governs the architectural delegation decision, not SDK implementation correctness. The canonical set explicitly excludes MMT-ADR-0004 (mobile-IAP rails) as billing mechanism, not core identity canon. Entitlement-snapshot cache pollution is a billing/IAP runtime concern; identity-foundation owns the identity/tenancy graph and Clerk-as-auth-only boundary, not RevenueCat subscription state. Real and security-class but owned by security-pii-api.

### F-135 — Owner's top-up credit balance leaked to a child profile in quota-exceeded responses

- **workstream:** security-pii-api · **domain:** other-cross-profile-disclosure
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(low): F-135's trigger is a role check (owner vs child) — a cross-profile data-isolation failure, not just quota math. MMT-ADR-0015 splits a "data-access capability" axis; a child getting the owner's subscription-wide credit total is data-access-by-role, which IF roles/data-model arguably own. Why only LOW: MMT-ADR-0002 rules billing access-inert, "NOT a security boundary," pre-excluding credit balances; no member names credit/quota/balance; register rules protect the minor's PII while this leak runs opposite. Classifier largely sound. Still refuted: the 0015 reframe needs human review, and empty canonical_set_source auto-flags — an out-call on absence is unverifiable, wrong exclusion costlier.
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-other-cross-profile-disclosure-753ec3916c` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-cross-profile-disclosure-753ec3916c.md` — evidence: apps/api/src/services/billing/top-up.ts:65-71
- **quote[0]:** getTopUpCreditsRemaining() sums ALL unexpired credits for a subscription when the optional profileId argument is omitted. In the metering middleware the profileId argument is only passed when quotaModel === 'per-profile' && profileRole === 'owner'; for a child profile it is passed as undefined, so the call returns the SUBSCRIPTION-WIDE credit total — which for a per-profile tier is the owner's purchased credits.
- **rationale:** F-135 is a quota-metering bug: getTopUpCreditsRemaining() omits profileId for child callers, leaking the owner's subscription-wide credit total. No canonical-set member covers quota accounting, credit-balance APIs, or metering middleware. MMT-ADR-0002 governs who adjudicates payment capacity (store-delegated), not credit arithmetic. The compliance register covers COPPA/GDPR/OSA/DPIA, not billing-data leakage. The data-model covers identity entities and roles, not credit-balance scoping. This is a billing/quota authorization defect owned by security-pii-api, which already carries it.

### F-136 — Read projector leaks raw LLM envelope (private_sources/signals) when reply is empty or non-string

- **workstream:** security-pii-api · **domain:** other-envelope-projection-bypass
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): canonical_set_source="" but named members plausibly own this. ADR-0014 §5 (#15) anchors post-generation concerns to envelope.ts; ADR-0016 §1-2 (#17) makes the envelope load-bearing and defines private_sources/signals as judge-written provenance "never rendered to the learner". projectAiResponseContent is the read-side dual enforcing that invariant; its rawContent fallback breaks the contract those ADRs own. The worst sink, export.ts GDPR export, is governed by the compliance-register (#20). Empty-cite is itself an auto-flag. The "0016=safety not projection" defeater is too narrow. Uncertain if IF owns projector correctness or only constrains it — flag-to-human. \| quote-not-found: Provided quote is paraphrased, not verbatim. Audit file line 13 has "is supposed to reduce", "sessionEvents.ai_response.content", "`reply` text on every read path", "Step 4", line references, schema citations, backticks, and em-dashes. Quote omits these specifics and condenses across sentences.
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-other-envelope-projection-bypass-2268d070ec` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-envelope-projection-bypass-2268d070ec.md` — evidence: apps/api/src/services/llm/project-response.ts:80-98
- **quote[0]:** projectAiResponseContent() is the defense-in-depth read projector that reduces a stored envelope down to only the learner-visible reply text. However, in the schema-invalid fallback, if the content is a structurally-valid envelope object whose reply is missing, empty, or non-string, the guard fails and the function returns the ORIGINAL rawContent verbatim — the full envelope JSON including signals and private_sources.
- **rationale:** F-136 concerns projectAiResponseContent() leaking raw LLM envelope fields (private_sources, signals) when reply is empty/non-string. None of the 20 canonical-set members cover this: L1 domain docs address person/role/consent/tenancy; MMT-ADR-0013/0014 define policy-engine spine and router shape; MMT-ADR-0016 covers judgment-based safety, not the read-projection layer. The compliance register governs COPPA/GDPR but not projector correctness. This defect sits in the LLM-response-pipeline/API-security layer; the finding's workstream tag (security-pii-api) correctly identifies its owner.

### F-137 — Envelope key-allowlist fails open: unrecognized top-level key renders raw (leaks signals/private_sources)

- **workstream:** security-pii-api · **domain:** other-info-disclosure
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Classifier's claim "no member governs envelope correctness; ADR-0016 doesn't address envelope stripping" overstates. MMT-ADR-0016 makes the envelope its subject: "judge emits the structured response envelope," "envelope integrity is load-bearing," "gating-mode per age — envelope spec," tying gating to AGE (minor protection). Leaked private_sources ("never rendered to learner") reaches the GDPR export per a sibling corpus finding; register C-1 binds LLM disclosure-to-minors (COPPA/GDPR). A citable in-scope path exists, refuting "no canonical_set_source." Residual: code is in mobile/packages, not identity members. Contestable, not cleanly out — flag to human.
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-other-info-disclosure-c07bafbc70` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-info-disclosure-c07bafbc70.md` — evidence: apps/mobile/src/lib/strip-envelope.ts:35-134
- **quote[0]:** stripEnvelopeJson() requires Object.keys(parsed).every(k => KNOWN_ENVELOPE_KEYS.has(k)) — every top-level key must be in the hardcoded set {reply, signals, ui_hints, private_sources, confidence}. If any key is NOT recognized, the whole condition is false and the function returns rawContent verbatim — the ENTIRE envelope JSON, including signals and private_sources, is rendered into the chat bubble.
- **rationale:** F-137 is a logic defect in stripEnvelopeJson(): unrecognized top-level keys cause the raw envelope — including signals and private_sources — to be returned verbatim to the client. This is a security bug in the LLM response pipeline, not in the identity/tenancy/consent domain. None of the 20 canonical-set members govern envelope key-allowlist correctness. MMT-ADR-0016 covers safety/judge architecture but was re-scoped to judgment-based safety — it does not address envelope stripping logic. No canonical_set_source can be cited. Ownership sits with the security-pii-api workstream.

### F-138 — Clerk session/JWT tokens persisted to web localStorage via secure-storage fallback

- **workstream:** security-pii-api · **domain:** other-insecure-token-storage
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): REFUTE. "IF owns server model only" is too narrow. MMT-ADR-0001 (set member #6) IS the Clerk auth-boundary seam and names the client artifacts it governs: sessions, edge JWT verification, the Expo SDK, JWT-as-transport. F-138 is exactly that — Clerk's Expo SDK persisting session/JWT to web localStorage; a leaked token fails the seam 0001 defines. So 0001 is a plausible canonical_set_source the classifier wrongly left empty. The compliance register (C-4) also governs child PII / GDPR Art 5(1)(f), which the cached token unlocks. Weak point: security-pii-api is a legit owner — but overlap isn't out-of-scope, and a confident out-call with source="" is the uncitable case the lens says to flag. \| quote-not-found: Quote is paraphrased, not verbatim. Actual file text includes backticks around code identifiers and (L58-63), (or an in-memory map), and fuller context that are absent from the provided quote.
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-other-insecure-token-storage-c072f16985` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-insecure-token-storage-c072f16985.md` — evidence: apps/mobile/src/app/_layout.tsx:58-63
- **quote[0]:** On web, tokenCache is set to webTokenCache, whose saveToken/getToken delegate to SecureStore.setItemAsync/getItemAsync. Per lib/secure-storage.ts, on web those functions fall back to plain localStorage. The cached values are Clerk's session/JWT tokens — confirmed by sign-out-cleanup.ts:168 and by api-client.ts:193 reading them via getToken() for every authenticated request.
- **rationale:** F-138 concerns client-side token caching: Clerk session/JWT tokens landing in plain localStorage via SecureStore's web fallback. No canonical-set member covers client-side token persistence or browser-storage security. MMT-ADR-0001 governs graph ownership (Clerk is auth only), not how auth tokens are cached on the client. The compliance register covers COPPA/GDPR obligations, not browser-storage hygiene. The finding belongs to security-pii-api, which owns runtime security on the API/client boundary. Identity-foundation owns the server-side identity model and schema only.

### F-139 — Learner-controlled library context interpolated into LLM system prompt without data fencing

- **workstream:** security-pii-api · **domain:** other-llm-prompt-injection
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — quote-not-found: Quote truncated: file has 'rather than data. buildResumeContext in the same file uses sanitizeXmlValue()/escapeXml()...' but provided quote ends at 'same-priority system guidance.' Missing final sentence.
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-other-llm-prompt-injection-9c469d204c` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-llm-prompt-injection-9c469d204c.md` — evidence: apps/api/src/services/session/session-context-builders.ts:192-261
- **quote[0]:** buildBookLearningHistoryContext builds prompt text from subject names, book titles/descriptions, chapter names, topic titles, and recent topic note content without sanitizeXmlValue() or escapeXml(). buildHomeworkLibraryContext similarly inserts topic titles directly. This context is later pushed into buildSystemPrompt as system-prompt text, so a learner-controlled note or generated curriculum/title containing newline-delimited instructions can be interpreted as same-priority system guidance.
- **rationale:** F-139 is a prompt-injection vulnerability in LLM prompt-building (buildBookLearningHistoryContext, buildHomeworkLibraryContext, buildSystemPrompt) — learner-controlled strings interpolated without XML/newline sanitization. No canonical-set member covers prompt-construction hygiene. MMT-ADR-0014 governs the routing runtime, not sanitization contracts for prompt content. MMT-ADR-0016 covers judgment-based safety via a judge model, not input fencing at the context-builder layer. The finding's own assigned workstream is security-pii-api, which is correct.

### F-140 — Raw learner subject input forwarded to Sentry in fallback catch block

- **workstream:** security-pii-api · **domain:** other-pii-in-traces
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): REFUTE. Classifier narrowed C-1/C-3 to realizations (allowed_models endpoint; guardian schema) and ignored their stated BASES in the compliance register (an L1 canonical-set member). C-1 basis: "COPPA third-party-disclosure + GDPR Art 8; the LLM call is a third-party disclosure of a child's data." The finding IS disclosure of a child's subject text (rawInput) to a sub-processor (Sentry); the LLM endpoint is one instance, not the boundary. C-3 basis: "OSA + data-minimization" — a verbatim-learner-text leak. A citable member exists, so canonical_set_source="" is wrong; excluding a minor-PII-egress defect favors flag-to-human. Confirmed real in code.
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-other-pii-in-traces-d5a95497c6` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-pii-in-traces-d5a95497c6.md` — evidence: apps/api/src/services/language-detect.ts:87-89
- **quote[0]:** In detectLanguageSubject(), the catch block calls captureException(err, { extra: { context: 'language-detect.fallback', rawInput } }) (L87-89), shipping the verbatim learner-typed subject text to the Sentry sub-processor on every LLM failure. This directly contradicts the codebase's own learner-data-egress standard (AC 337).
- **rationale:** F-140 is an observability-pipeline PII egress defect (raw learner text shipped to Sentry). No canonical-set member covers Sentry scrubbing or error-reporting tooling. Compliance register C-1 (LLM third-party disclosure for minors) and C-3 (OSA no-verbatim-quote guard) are narrowly scoped to LLM routing and guardian-visible schema — not the error-reporting sub-processor pipeline. Identity-foundation governs identity/tenancy, consent, age-gating, LLM routing, and deletion/retention. No canonical-set member can be cited; the finding's own label (security-pii-api) is correct.

### F-141 — Preformatted learner context blocks appended to system prompt without enforced escaping

- **workstream:** security-pii-api · **domain:** other-prompt-injection
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Refute. Classifier excluded from IF-scope with EMPTY canonical_set_source — schema auto-flags; uncitable=unverifiable. Its claim 0016 (scope: all LLM safety calls) is output-only is contradicted by 0016 line 34 verbatim: "Safety lives in the prompt-layer safety preamble + the judge." The defect — unescaped learner text into buildSystemPrompt as instruction-like content — is an integrity hole in that preamble; 0016 arguably owns it, classifier skipped it. ADR-0013 (policy engine, IF-scoped) enforces gating that self-injection subverts. Honest counter: no IF canon has escape/sanitize terms except that 0016 phrase. But a confident exclusion on an empty cite meets the default-refuted bar.
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-other-prompt-injection-cc7702a6d7` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-prompt-injection-cc7702a6d7.md` — evidence: apps/api/src/services/exchange-prompts.ts:660-719
- **quote[0]:** buildSystemPrompt directly appends multiple preformatted context strings. Traced sources include learner-authored summaries, topic notes, retrieved memory content, communication notes, and parked questions; some builders escape their fields, but several do not and this function has no typed safe-block boundary. Crafted stored text can therefore enter a future system prompt as persistent instruction-like content rather than data.
- **rationale:** F-141 is prompt-injection risk: learner-authored content appended to buildSystemPrompt without enforced escaping or typed safe-block boundary. No canonical-set member governs this. MMT-ADR-0016 covers judgment-based output classification at response time, not input-side escaping of stored content. MMT-ADR-0013/0014 define policy-engine shape and router/vetting split — neither specifies escaping contracts for user-authored data entering prompt construction. This is LLM input-security hygiene; its owner is the workstream that originally tagged it: security-pii-api.

### F-142 — Unbounded attempt accumulation and unbounded answerGiven on /quiz/rounds/:id/check (no rate limit, no size cap)

- **workstream:** security-pii-api · **domain:** other-resource-exhaustion
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** contested — quote-not-found: Verbatim_quote is a paraphrased condensation, not a direct extraction from source. The actual text in the file (line 13) includes technical details (SQL syntax, L222-267, appendRecordedAttempt references) and more verbose gap explanations that are omitted from the provided quote.
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-other-resource-exhaustion-836fcc397f` — src: `.deepsec/findings/MEDIUM/eduagent-build-other-resource-exhaustion-836fcc397f.md` — evidence: apps/api/src/services/quiz/complete-round.ts:105-259
- **quote[0]:** checkQuizAnswerWithCorrect() appends to the round's results JSONB on every call. Three compounding gaps: (1) answerGiven has NO maximum length; (2) there is no per-round cap on recorded attempts; (3) POST /quiz/rounds/:id/check has NO rate limit and is intentionally excluded from meteringMiddleware. An authenticated user can create one round and issue unlimited /check calls carrying large answerGiven payloads, growing a single quiz_rounds.results JSONB row without bound.
- **rationale:** F-142 concerns unbounded JSONB accumulation and missing rate-limiting on /quiz/rounds/:id/check — a quiz-domain API security issue. None of the 20 canonical-set members cover quiz round mechanics, answerGiven field sizing, or /check endpoint rate limiting. The L1 docs cover identity/tenancy/consent/age; L2 ADRs (0000–0016) cover identity graph, Payer capacity, guardianship, consent, family-join, data model, policy engine, LLM routing, safety/judge. L3 covers vetted LLM models. No brief member is applicable. The finding's own workstream label (security-pii-api) is the correct remediation owner.

### F-143 — Hardcoded default password used as fallback for seed-created Clerk users

- **workstream:** security-pii-api · **domain:** secret-in-fallback
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** MEDIUM · **normalized_priority:** P2
- **verify_status:** confirmed
- **provenance:**
  - `root/deepsec-handover::deepsec-MEDIUM-secret-in-fallback-2f5778d3f6` — src: `.deepsec/findings/MEDIUM/eduagent-build-secret-in-fallback-2f5778d3f6.md` — evidence: apps/api/src/services/test-seed.ts:62-252
- **quote[0]:** DEFAULT_SEED_PASSWORD = 'Mentomate2026xK' (L62) is used at L252 as const password = env.SEED_PASSWORD ?? DEFAULT_SEED_PASSWORD; and applied to real Clerk users created via the seed flow with skip_password_checks: true. The accompanying comment confirms it is a genuine, sign-in-capable credential.
- **rationale:** F-143 is a security hygiene issue in dev/test seed infrastructure — hardcoded Clerk password with skip_password_checks. No canonical-set member governs seed scripts or dev-tooling credentials. The set covers ontology, domain/data model, tenancy ADRs (0001/0002/0007-0016), consent/age/compliance, and LLM routing — none apply here. The finding's own workstream tag (security-pii-api) is correct and owns remediation. canonical_set_source left empty — no member is applicable.

### F-144 — Parent proxy sessions can mutate child progress state

- **workstream:** security-pii-api · **domain:** acl-check
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): canonical_set_source="" claims no member governs this — wrong. Classifier conflates the enforcement mechanism (route guard, maybe other-workstream) with the authority invariant violated (IF canon). Finding: a parent proxy can MUTATE child-owned progress data. Two L1 members own that: ontology/domain-model inv 7/8 ("self-ownership intrinsic: a Person reads+writes OWN data; access to ANOTHER's data is edge-derived") and the three-concerns matrix (guardian = "derived view / visibility / Layer 2"; Supportership = "data access only"). No canon grants a proxy parent WRITE over a child's data. So the empty citation is itself an error = the auto-flag condition; in/out is contestable. \| quote-not-found: Quote truncated at '...state.' Missing final clause: 'despite proxy-mode write guards used on other write routes.'
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-acl-check-1c83ea657a` — src: `.deepsec/findings/BUG/eduagent-build-acl-check-1c83ea657a.md` — evidence: apps/api/src/services/snapshot-aggregation.ts:973-1221
- **quote[0]:** refreshProgressSnapshot() writes progress snapshots, stores milestones, and queues celebrations. listRecentMilestones() can also backfill milestone rows. The route call sites use requireProfileId(), but do not apply assertNotProxyMode(); since profileScopeMiddleware permits a parent to resolve a linked child via X-Profile-Id, a parent proxy request can mutate child-owned progress/milestone/celebration state.
- **rationale:** F-144 is about missing assertNotProxyMode() guards on progress/milestone/celebration mutation routes. No canonical-set member governs route-level proxy-mode enforcement on learning-progress data. MMT-ADR-0015's "consent authority / data access / profile-management capability split" covers profile-management operations, not application-domain write guards. The identity-foundation carve-out defines the identity/tenancy/consent model; enforcement of proxy-mode restrictions on progress/milestone routes belongs to the security-pii-api workstream, which is already the finding's assigned workstream.

### F-145 — Pronouns age gate fails open when profile birthYear is missing

- **workstream:** security-pii-api · **domain:** other-age-gate-fail-open
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** docs/canon/identity/prd.md — three-axis age model, 13+ launch floor, sub-13 built-but-gated; docs/compliance/identity-compliance-register.md — COPPA binding rules
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(high): In-IF-scope; classifier wrong. Two named L1 members own this. prd.md L170: "One central consent gate, not per-screen checks" — the finding IS a rogue per-screen age gate that fails open, a conformance defect vs an IF invariant. Compliance-register C-1: "AI-training consent toggle must not render for minor profiles ... Realized by: purpose-scope gating (ontology inv27)" — structurally identical (sensitive UI control must not render sub-13); canon owns it down to the mechanism, refuting "IF scope ends at the contract." PRD inv29/30 make fail-open-on-unknown-age a strict-default violation. The finding self-tagging security-pii-api is not scope authority — the brief is. \| quote-not-found: The quote is not verbatim. Source file contains the concepts but rephrased across multiple sentences. The exact phrase with 'but the gate fails open rather than closed on missing data' does not appear in the file.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-age-gate-fail-open-9802a84a7b` — src: `.deepsec/findings/BUG/eduagent-build-other-age-gate-fail-open-9802a84a7b.md` — evidence: apps/mobile/src/app/(app)/onboarding/pronouns.tsx:62-193
- **quote[0]:** The age computation fails open: learnerAge is null whenever activeProfile.birthYear is falsy (null/0/undefined), and ageGated = profileResolved && learnerAge !== null && learnerAge < PRONOUNS_PROMPT_MIN_AGE is therefore false when age is unknown. Learners below PRONOUNS_PROMPT_MIN_AGE (13) must NEVER be shown the pronouns field, but the gate fails open rather than closed on missing data.
- **rationale:** The canonical set defines the constraint (prd.md: sub-13 built-but-gated; compliance register: COPPA prohibition on sensitive child data), but does not own the feature-level enforcement of that constraint in specific product screens. The pronouns-field age gate is a downstream implementation of the age model, belonging to the workstream that owns the feature and gating logic. The finding itself labels that workstream security-pii-api. Identity-foundation scope ends at the contract; per-field UI gate correctness is remediated by the implementing workstream.

### F-146 — App-help early-return on /assessments/:id/answer consumes quota without an LLM call

- **workstream:** security-pii-api · **domain:** other-billing-overcharge
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Provided quote is paraphrased/condensed. File contains more detailed version with specific line references (middleware/metering.ts:219-222, etc.) omitted in provided verbatim_quote. Exact string does not appear verbatim in .deepsec/findings/BUG/eduagent-build-other-billing-overcharge-5b66c31673.md.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-billing-overcharge-5b66c31673` — src: `.deepsec/findings/BUG/eduagent-build-other-billing-overcharge-5b66c31673.md` — evidence: apps/api/src/routes/assessments.ts:108-119
- **quote[0]:** POST /assessments/:assessmentId/answer IS metered (middleware decrements quota BEFORE the handler runs). Inside the handler, buildAssessmentAppHelpEvaluation returns a canned non-LLM 'app help' reply and the handler returns 200 immediately — without ever calling the LLM. Because the response status is < 400, the metering middleware's post-handler refund path does not fire, so the user is charged one quota credit for a deflection that never consumed an LLM exchange.
- **rationale:** F-146 is a quota-metering correctness bug: pre-handler middleware decrements a credit before the handler runs, but the post-handler refund never fires when the app-help path short-circuits (no LLM call, 200 response). No canonical-set member — the four L1 domain docs, the compliance register, or MMT-ADR-0000 through 0016 — addresses quota accounting or assessment-endpoint metering. Identity-foundation owns identity/tenancy/consent/age/policy-engine/LLM-routing; quota billing logic is outside that boundary. The finding's own workstream label (security-pii-api) names the correct owner.

### F-147 — HALF_OPEN probeInFlight can leak on the lazy streaming path and wedge a provider circuit

- **workstream:** architecture · **domain:** other-circuit-breaker-liveness
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** MMT-ADR-0014 — router runtime / vetting split (names CircuitOpenError as the fail-closed mechanism; governs router contract, not circuit-breaker implementation correctness)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote not found verbatim. File text differs: contains '(line 721), and in HALF_OPEN' and line numbers omitted from provided quote. Actual file is more detailed.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-circuit-breaker-liveness-74f270f3ed` — src: `.deepsec/findings/BUG/eduagent-build-other-circuit-breaker-liveness-74f270f3ed.md` — evidence: apps/api/src/services/llm/router.ts:721-1411
- **quote[0]:** canAttempt() has a synchronous side effect: on an OPEN->HALF_OPEN transition it sets probeInFlight=true. The paired reset (recordSuccess/recordFailure, which clear probeInFlight) only runs during stream ITERATION inside wrapStreamWithCircuitBreaker. routeAndStream() returns a lazy StreamResult without awaiting it. If the returned stream is never iterated, probeInFlight stays true indefinitely, preventing any future probe for that provider.
- **rationale:** F-147 is a correctness bug in the circuit-breaker state machine: probeInFlight leaks when a lazy StreamResult is never iterated. The nearest canonical-set member is MMT-ADR-0014, which governs the router's fail-closed contract and CircuitOpenError semantics — not internal circuit-breaker implementation. Identity-foundation owns the router at the contract level; implementation-level reliability of the circuit breaker belongs to the architecture/LLM-infrastructure workstream, which the source audit already labels this finding under.

### F-148 — Outbox-spillover rate-limit rows silently consume the daily push-notification cap

- **workstream:** security-pii-api · **domain:** other-cross-feature-interaction
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote simplified/paraphrased: file has detailed version with code references, task quote is abstracted. Audit file contains the concept but not this exact wording.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-cross-feature-interaction-2140f28ef5` — src: `.deepsec/findings/BUG/eduagent-build-other-cross-feature-interaction-2140f28ef5.md` — evidence: apps/api/src/routes/support.ts:69-75
- **quote[0]:** POST /support/outbox-spillover calls checkAndLogRateLimit(db, profileId, account.id, 'support_outbox_spillover', ...) which inserts a row into the shared notification_log table. The push-notification daily cap is enforced by sendPushNotification which calls getDailyNotificationCount(db, profileId). That function counts ALL notification_log rows for the profile since start-of-day, filtering ONLY on profileId + sentAt — it does NOT filter by type.
- **rationale:** F-148 is a notification infrastructure bug: checkAndLogRateLimit for support_outbox_spillover inserts into notification_log, and getDailyNotificationCount counts all rows by profileId without type-filtering, so outbox rows drain the push-notification daily cap. None of the 20 canonical-set members govern push-notification delivery, daily cap accounting, or outbox-spillover. Canonical set covers identity, tenancy, auth, guardianship, consent, LLM routing, compliance - not notification rate limiting. No member can be cited. Source audit assigns it to security-pii-api.

### F-149 — Duplicate accepted-aliases where diacritic variants were flattened to ASCII

- **workstream:** architecture · **domain:** other-data-correctness
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** content / curriculum data quality
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote is paraphrased/truncated. File contains full detailed version with line numbers (L143, L164, L186, L494, L516) and continues beyond 'Brazil and Colombia similarly.' Task quote does not match verbatim.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-data-correctness-0bde1bb5d3` — src: `.deepsec/findings/BUG/eduagent-build-other-data-correctness-0bde1bb5d3.md` — evidence: apps/api/src/services/quiz/capitals-data.ts:143-516
- **quote[0]:** Several CapitalEntry.acceptedAliases arrays contain the same ASCII string twice, where the intent was clearly to list a diacritic/native variant alongside the ASCII form, but the accented characters were flattened to ASCII — producing a useless duplicate instead of the variant. Examples: Iceland ['Reykjavik', 'Reykjavik'] (intended 'Reykjavik' with macron), Latvia ['Riga', 'Riga'] (intended with macron), Moldova (intended 'Chisinau' with cedilla), Brazil and Colombia similarly.
- **rationale:** F-149 is a data-quality defect in a geography/capitals dataset (CapitalEntry.acceptedAliases duplicate ASCII strings where diacritics were intended). The IF canonical set (20 members: ontology, domain-model, data-model, PRD, compliance register, ADRs 0000–0016, LLM model register) covers person/login/tenancy, guardianship, consent, age, policy engine, LLM routing, and safety. No member references CapitalEntry, acceptedAliases, geographic data, or diacritic normalization. No brief member can be cited. Defect belongs to content/curriculum data quality.

### F-150 — Redundant if/else in fallbackAnalysis — both branches identical (harmless dead code)

- **workstream:** architecture · **domain:** other-dead-branch
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** confirmed
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-dead-branch-04fba40f0d` — src: `.deepsec/findings/BUG/eduagent-build-other-dead-branch-04fba40f0d.md` — evidence: apps/api/src/services/learner-input.ts:78-88
- **quote[0]:** In fallbackAnalysis (lines 78-88), the conditional if (lowered.includes('prefer') \|\| lowered.includes('helps me') \|\| lowered.includes('best when')) { notes.push(trimmed); } else { notes.push(trimmed); } executes the identical statement in both branches, so the keyword test has no effect. Output is correct either way (the note is always pushed), so there is no functional or security impact.
- **rationale:** F-150 is dead code in fallbackAnalysis — a harmless if/else with identical branches, no functional or security impact. None of the 20 canonical-set members (docs/canon/identity/*, compliance register, MMT-ADR-0000–0016, L3 registers) cover general code quality or this function. The finding does not touch identity entities, roles, consent, tenancy, the policy engine, or the LLM router. No canonical-set source can be cited. Belongs to the general architecture/code-quality workstream.

### F-151 — Unreachable analyze-step branch contains a latent script-injection sink (base.ref interpolated into shell)

- **workstream:** security-pii-api · **domain:** other-dead-code-latent-injection
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** ci-cd-hardening
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote not found verbatim in audit file. Audit file line 13 uses different phrasing: 'This is inside the `if [ ... ]` block (lines 65-72). That block is UNREACHABLE: the earlier guard...' vs. task quote 'This is inside a block that is UNREACHABLE due to earlier exit-0 guards...'
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-dead-code-latent-injection-823b408561` — src: `.deepsec/findings/BUG/eduagent-build-other-dead-code-latent-injection-823b408561.md` — evidence: .github/workflows/e2e-ci.yml:49-68
- **quote[0]:** In the check-changes job's analyze step, line 66 builds PR_BASE="${{ github.event.workflow_run.pull_requests[0].base.ref }}" by interpolating a PR base branch name directly into the shell. This is inside a block that is UNREACHABLE due to earlier exit-0 guards, but the latent shell-injection sink exists in the source.
- **rationale:** F-151 is a latent shell-injection sink in a GitHub Actions CI workflow file (PR base-ref interpolated into shell in the check-changes job). None of the 20 canonical-set members — docs/canon/identity/, ADRs 0000-0016, the compliance register, the LLM model register, or the A-vs-B memo — concern CI/CD pipeline security or GHA workflow hardening. No specific brief member can be cited. This is a CI/CD hardening concern; the repo's tech-gha-hardening skill confirms that workstream exists and is the natural owner.

### F-152 — Dead childProfileId field in tellMentorInputSchema is a latent cross-profile IDOR footgun

- **workstream:** security-pii-api · **domain:** other-dead-field-latent-idor
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Classifier's split (ADRs = architecture, not handler enforcement) is the weak link. The dead childProfileId is a non-edge-derived cross-Person write into mentor-memory. MMT-ADR-0007 scopes learning data to person_id with edge-derived supervisory access; domain-model inv7-9: a Person writes only OWN data, access to another's is edge-derived. Mentor-memory IS person_id-scoped data; if wired the field bypasses the edge-derived check — a latent breach of the IF tenancy invariant. So canonical_set_source="" is wrong and in_scope=false contestable. Scope tracks which canon owns it, not severity. Default-to-refuted applies. \| quote-not-found: Quote not found verbatim in .deepsec/findings/BUG/eduagent-build-other-dead-field-latent-idor-7c0b8c2fc1.md. Finding section discusses the issue but with different wording and backticks.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-dead-field-latent-idor-7c0b8c2fc1` — src: `.deepsec/findings/BUG/eduagent-build-other-dead-field-latent-idor-7c0b8c2fc1.md` — evidence: packages/schemas/src/learning-profiles.ts:284-290
- **quote[0]:** tellMentorInputSchema declares childProfileId: z.string().uuid().optional(), but the consuming handler POST /learner-profile/tell destructures only { text } and calls parseLearnerInput using the SERVER-verified profileId. The body childProfileId is never read today — it is dead schema surface that could become an IDOR footgun if a future handler starts consuming it.
- **rationale:** F-152 is about a dead `childProfileId` input field in `tellMentorInputSchema` — API-layer schema hygiene and a latent IDOR risk if a future handler activates it. No canonical-set member covers API request-parsing security or IDOR prevention. MMT-ADR-0001/0007-0015 address identity/tenancy graph architecture, not handler-level profileId enforcement. The compliance register covers COPPA/GDPR/OSA, not schema linting. The `security-pii-api` workstream — which the source audit already assigned — is the correct owner. No brief member can be cited to pull this into identity-foundation scope.

### F-153 — Two different useRestoreConsent hooks with incompatible signatures

- **workstream:** architecture · **domain:** other-divergent-duplicate
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Real defect, excluded too confidently. Not just a hook-convention clash: a CONTRACT divergence at the consent-restore boundary. consentActionResultSchema is the documented contract for PUT /consent/:id/restore; restore is COPPA/GDPR-binding, tied to consent_grant (data-model §4.8 + compliance register). use-restore-consent.ts uses the shared schema; use-consent.ts:250 redefines RestoreConsentResult locally — the "don't redefine API types locally" violation, on the IF surface. Decisive: classifier set canonical_set_source="", an auto-flag. Lens says uncitable means flag, not route to architecture; default-to-flag favors not excluding a consent-contract divergence. As strong, so refuted. \| quote-not-found: Quote incomplete: provided text ends at 'opposite calling conventions.' but actual audit file (line 13) includes consumer detail: 'The use-consent.ts variant is consumed by app/(app)/child/[profileId]/index.tsx; the use-restore-consent.ts variant by components/family/WithdrawalCountdownBanner.tsx.'
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-divergent-duplicate-29eeebcdd6` — src: `.deepsec/findings/BUG/eduagent-build-other-divergent-duplicate-29eeebcdd6.md` — evidence: apps/mobile/src/hooks/use-consent.ts:250
- **quote[0]:** useRestoreConsent is defined twice with divergent APIs. In use-consent.ts:250 it takes childProfileId as a hook argument and returns UseMutationResult<RestoreConsentResult, Error, void>. In use-restore-consent.ts:15 it takes no hook argument and accepts { childProfileId } as the mutation variable, returning UseMutationResult<ConsentActionResult, Error, RestoreConsentVariables>. Same name, same domain action, opposite calling conventions.
- **rationale:** Confirmed real: use-consent.ts:250 and use-restore-consent.ts:15 both export useRestoreConsent with incompatible signatures (hook-arg vs mutation-variable convention, RestoreConsentResult vs ConsentActionResult). No canonical-set member governs mobile hook calling conventions. MMT-ADR-0015 and the domain/data-model docs define consent-authority semantics and schema — not how React Query hooks expose that operation. The defect is a mobile-layer code-quality issue (one copy is stale/divergent); remediation is a mobile-side consolidation owned by the architecture workstream.

### F-154 — mobile-maestro (secret-bearing, executes checked-out code) gates only on a job output with no independent trigger guard

- **workstream:** security-pii-api · **domain:** other-fragile-single-layer-gate
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote is a paraphrase of line 13, not verbatim. File includes parenthetical citations and backticks absent from provided quote.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-fragile-single-layer-gate-8a3944ff24` — src: `.deepsec/findings/BUG/eduagent-build-other-fragile-single-layer-gate-8a3944ff24.md` — evidence: .github/workflows/e2e-ci.yml:183-279
- **quote[0]:** The mobile-maestro job checks out github.event.workflow_run.head_sha and then executes code from that tree while holding secrets EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY_PREVIEW and TEST_SEED_SECRET. Its only gate is if: needs.check-changes.outputs.run-mobile-e2e == 'true'. Security is therefore fully delegated to the check-changes analyze step.
- **rationale:** F-154 is a CI/CD pipeline security finding: mobile-maestro checks out an arbitrary workflow_run SHA, executes it while holding secrets, gated only by a single job-output value. No canonical-set member covers GitHub Actions workflow security or CI secret handling. MMT-ADR-0001 governs Clerk's architectural role in the identity graph, not CI hygiene. The compliance register covers COPPA/GDPR/OSA runtime obligations, not CI/CD infrastructure. No brief member can be cited, so an in-IF-scope call is unverifiable. Remediation owner is the CI/CD security workstream that originally filed it.

### F-155 — IS_E2E_BUILD gate omits the __DEV__ guard its sibling screen uses

- **workstream:** security-pii-api · **domain:** other-gating-inconsistency
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** mobile-testing-infra
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Provided quote omits backticks around IS_E2E_BUILD definitions, omits (L21-24) line reference after second definition, and omits 'therefore' before 'use'. Not verbatim with source line 13.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-gating-inconsistency-db4f60235d` — src: `.deepsec/findings/BUG/eduagent-build-other-gating-inconsistency-db4f60235d.md` — evidence: apps/mobile/src/app/dev-only/seed-pending-redirect.tsx:38-40
- **quote[0]:** seed-pending-redirect.tsx defines IS_E2E_BUILD = process.env.NODE_ENV !== 'production' && process.env.EXPO_PUBLIC_E2E === 'true' (L38-40), but the sibling seed-preview-state.tsx defines it as __DEV__ && process.env.NODE_ENV !== 'production' && process.env.EXPO_PUBLIC_E2E === 'true'. The two dev-only seed screens use different activation gates.
- **rationale:** F-155 is a mobile build-hygiene / E2E tooling issue: `seed-pending-redirect.tsx` omits the `__DEV__` guard that `seed-preview-state.tsx` includes, meaning one seed screen has a looser activation gate. None of the 20 canonical-set members (ontology, domain-model, data-model, prd, compliance-register, MMT-ADR-0000–0016, LLM model register, A-vs-B memo) address E2E seed screen activation guards or mobile testing infrastructure. No canonical-set member can be cited. The finding is real but owned by the mobile-testing-infra workstream.

### F-156 — GC1 mock guard misses multiline jest.mock calls

- **workstream:** architecture · **domain:** other-guard-bypass
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** confirmed
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-guard-bypass-1451746c8d` — src: `.deepsec/findings/BUG/eduagent-build-other-guard-bypass-1451746c8d.md` — evidence: scripts/check-gc1-pattern-a.ts:35-105
- **quote[0]:** The detector only applies MOCK_LINE to each added diff line independently, so a new internal mock written as a multiline call such as jest.mock(\n  './services/foo', ...) has no single added line matching the regex and is not checked for Pattern A or gc1-allow. This weakens the CI/pre-commit ratchet and can allow broad internal mocks to land.
- **rationale:** F-156 is a defect in the GC1 pre-commit ratchet: the regex operates line-by-line on diff hunks and misses multiline jest.mock() calls. None of the 20 canonical-set members (docs/canon/identity/* L1 docs, MMT-ADR-0000–0016, compliance register, LLM model register, A-vs-B memo) address CI tooling, pre-commit hooks, or code-quality ratchets. The set covers identity/tenancy ontology, data model, compliance, and LLM routing/safety — not repo-wide engineering guards. GC1 is orthogonal to identity-foundation. Owning workstream is architecture, which covers CI and engineering-process enforcement.

### F-157 — Required 'smoke' status check is a structural no-op on every pull_request (always green via 'skipped')

- **workstream:** security-pii-api · **domain:** other-ineffective-required-check
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** platform-infra
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Classifier scoped by artifact type (Actions YAML), not by the invariant the no-op gate breaks — the lens scopes by subject-matter, not file location. Repo-verified: test:e2e:web:smoke runs smoke-auth/smoke-learner/smoke-parent, mapped in playwright.config.ts to auth/sign-up-flow and journeys j01 (learner)/j03 (parent). The always-green gate is the only regression net over auth and learner+guardian onboarding — load-bearing for named members prd.md (personas+13 gate), ADR-0007 (role model), ADR-0001 (own tenancy graph). So canonical_set_source="" is false; the call is citable. "No member mentions Actions" would let every test-infra defect escape every domain. Contested; flag human. \| quote-not-found: Quote does not match verbatim. File text includes backticks around code (e.g., `should-run=false`, `failure`/`cancelled`) and additional detail about lines 213-232, fork vs same-repo PRs, and Playwright context not in the provided quote.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-ineffective-required-check-86b5df2474` — src: `.deepsec/findings/BUG/eduagent-build-other-ineffective-required-check-86b5df2474.md` — evidence: .github/workflows/e2e-web.yml:45-229
- **quote[0]:** The changes job short-circuits should-run=false for ALL pull_request events at lines 45-49, before any file-diff logic. run-smoke is always SKIPPED on PRs. The smoke gate job only fails on run-smoke result failure/cancelled; a skipped result falls through and exits 0. Net effect: if smoke is a required check, it is GREEN for every PR regardless of changed files.
- **rationale:** F-157 is a GitHub Actions CI pipeline defect: the changes job unconditionally sets should-run=false for all pull_request events, causing run-smoke to always be skipped and the required status check to exit green. This is a CI/CD configuration issue — pipeline YAML logic, required-status-check semantics, branch-protection gate integrity. None of the 20 canonical-set members (L1 identity domain docs, compliance register, ADRs 0000-0016, LLM model register, A-vs-B memo) touch GitHub Actions or smoke-test gating. No brief member justifies in-IF-scope. Owner: platform-infra workstream.

### F-158 — Untrusted deep-link homeworkProblems JSON parsed without schema validation

- **workstream:** security-pii-api · **domain:** other-input-validation
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** confirmed
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-input-validation-329d5c6874` — src: `.deepsec/findings/BUG/eduagent-build-other-input-validation-329d5c6874.md` — evidence: apps/mobile/src/app/(app)/session/_view-models/session-route-params.ts:73-75
- **quote[0]:** getSessionRouteParams() feeds the raw homeworkProblems route param into parseHomeworkProblems(), which does JSON.parse(rawValue) as HomeworkProblem[] and returns parsed.map((problem) => ({ ...problem, selectedMode: problem.selectedMode ?? null })) with no validation that each element is an object containing a string text.
- **rationale:** F-158 is a missing schema-validation defect in getSessionRouteParams()/parseHomeworkProblems() — a deep-link route param is JSON.parse'd with no structural check. None of the 20 canonical-set members (identity ontology, domain model, data model, PRD, compliance register, ADRs 0000–0016) concern deep-link parsing, session routing, or HomeworkProblem shape. The canonical set covers identity/tenancy graph, person-login separation, guardianship, age/consent, the 8-table schema, policy-engine spine, LLM routing/judge, and compliance obligations — none touched here. Owned by security-pii-api.

### F-159 — staleMs parsed without a finite-number guard, unlike its sibling screen

- **workstream:** security-pii-api · **domain:** other-input-validation
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** test-infrastructure
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote is paraphrased, not verbatim. Source has more specifics (pending-auth-redirect.ts:134, line 32, line 94, ?staleMs=abc example) that the condensed quote omits.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-input-validation-ee84a692f4` — src: `.deepsec/findings/BUG/eduagent-build-other-input-validation-ee84a692f4.md` — evidence: apps/mobile/src/app/dev-only/seed-pending-redirect.tsx:76-85
- **quote[0]:** L76 computes const staleMsNum = parseInt(staleMs ?? '0', 10) and passes it straight to seedPendingAuthRedirectForTesting at L85. A non-numeric query value yields NaN, and the downstream isFreshRecord evaluates Date.now() - NaN < TTL => NaN < TTL => false, so the seeded record is silently treated as already-expired. The sibling seed-preview-state.tsx guards exactly this with Number.isFinite.
- **rationale:** F-159 is a NaN-guard omission in apps/mobile/src/app/dev-only/seed-pending-redirect.tsx — a dev-only/E2E seed helper, not production code. No canonical-set member governs dev-only test infrastructure or input-validation in seed helpers. MMT-ADR-0001 covers the production auth architecture, not E2E seeding utilities. The finding is a confirmed true-positive (deepsec revalidation) but is a test-infrastructure/code-quality matter with no production identity impact. Belongs to test-infrastructure workstream.

### F-160 — Sample-lesson buttons can stay permanently disabled after returning to the screen (missing submitting reset)

- **workstream:** l10n-a11y-mobile · **domain:** other-logic-bug
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote lacks backticks present in source. Source has `submitting`, `disabled={submitting}`, `router.push('/preview/value-prop')`, `useFocusEffect()`. Provided quote removes all backticks. Line 13 of cited file contains the content but with different markdown formatting.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-logic-bug-2517efb7ac` — src: `.deepsec/findings/BUG/eduagent-build-other-logic-bug-2517efb7ac.md` — evidence: apps/mobile/src/app/preview/topic.tsx:48-110
- **quote[0]:** PreviewTopicScreen gates its sample-lesson buttons on a submitting flag. onSelect sets setSubmitting(true) and then router.push('/preview/value-prop') but never resets the flag. Unlike the sibling screens both.tsx and intent.tsx, this screen has no useFocusEffect(() => setSubmitting(false)).
- **rationale:** F-160 is a mobile screen interaction bug — PreviewTopicScreen's submitting flag is never reset on re-focus, leaving buttons permanently disabled after navigation. None of the 20 canonical-set members (ontology, domain model, data model, PRD, compliance register, ADRs 0000/0001/0002/0007–0016, model register) address mobile screen state lifecycle, button guards, or useFocusEffect patterns. No identity, tenancy, consent, or LLM-routing surface is touched. Already tagged l10n-a11y-mobile by the source audit — that workstream is the correct owner.

### F-161 — Non-answer substring matching misclassifies substantive answers as non-answers (locale false positives)

- **workstream:** l10n-a11y-mobile · **domain:** other-logic-bug
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote altered: says 'non-substantive' but source says 'non-answer like idk' (line 13 of Finding section)
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-logic-bug-2b8ccbc2c4` — src: `.deepsec/findings/BUG/eduagent-build-other-logic-bug-2b8ccbc2c4.md` — evidence: apps/api/src/services/session/review-calibration.ts:74-91
- **quote[0]:** matchesNonAnswerPhrase uses normalized.includes(token) for any non-answer token longer than 2 characters. Tokens of length 3-4 in the locale lists are still matched as substrings of legitimate words, causing isSubstantiveCalibrationAnswer to return false (treat the answer as non-substantive) for genuine, substantive answers that merely contain a short non-answer token inside a longer word.
- **rationale:** F-161 is a locale substring-matching bug in `matchesNonAnswerPhrase`/`isSubstantiveCalibrationAnswer`: short locale tokens (3-4 chars) match inside legitimate words, misclassifying genuine calibration answers. None of the 20 canonical-set members (ontology, domain-model, data-model, prd, compliance register, ADRs 0000/0001/0002/0007-0016, model register, A-vs-B memo) address locale token matching or calibration answer scoring. No canonical-set citation is possible. The finding belongs to l10n-a11y-mobile as already tagged.

### F-162 — Self-reinvoke cursor advances past profiles that errored mid-run, silently skipping them

- **workstream:** security-pii-inngest · **domain:** other-logic-bug
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Classifier's "no member covers it" is overstated. Two named members govern per-profile sweep completeness: compliance register C-4 (scheduler at profile granularity, per child profile) and MMT-ADR-0009, which canonizes the wired-but-untriggered trap and per-Person fan-out isolation. Code (memory-facts-backfill.ts:208-222): capped self-reinvoke sets cursor to the LAST slice row regardless of success, so errored profiles (marker IS NULL) are permanently skipped, the inverse of what 0009 guards, on learningProfiles (identity Person). Weakness: memory_facts is learning content not consent data; members name the transition sweep, not this backfill. Flag to human. \| quote-not-found: Quote is paraphrased, not verbatim. Actual file (line 13) includes 'processes a slice of up to MAX_PROFILES_PER_RUN profiles, and' plus code refs omitted from the provided quote. Text differs in detail and completeness.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-logic-bug-6b1e72d468` — src: `.deepsec/findings/BUG/eduagent-build-other-logic-bug-6b1e72d468.md` — evidence: apps/api/src/inngest/functions/memory-facts-backfill.ts:64-220
- **quote[0]:** The function paginates with a composite (createdAt, profileId) cursor. Each run sets the next cursor to the LAST profile of the slice regardless of whether individual profiles succeeded. Per-profile failures are caught and counted but the marker (memoryFactsBackfilledAt) is NOT set, so those rows remain backfilledAt IS NULL yet are silently skipped by future runs.
- **rationale:** F-162 is a pagination cursor bug in a memory-facts backfill Inngest function — profiles that error mid-run never get `memoryFactsBackfilledAt` set and are silently skipped. No canonical-set member covers memory-facts backfill pipelines or general Inngest job pagination correctness. MMT-ADR-0009 covers age/consent-transition scheduling only, not PII backfill reliability. The finding's own workstream tag (`security-pii-inngest`) names the correct owner; it is a data-completeness/PII-processing concern, not identity-graph or tenancy. No brief member can be cited.

### F-163 — Child-mode learning preferences screen previews the parent's accommodation, not the child's

- **workstream:** l10n-a11y-mobile · **domain:** other-logic-bug
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): REFUTE. Empty canonical_set_source is the tell: no member named to exclude, yet one owns this. Defect = guardian's `view` of a charge resolving to SELF at a call site, which identity canon governs. MMT-ADR-0008 makes `view` a derived capability; lockstep domain-model.md L65 "Access to another Person's data is edge-derived", L119-125 the check "lives in one named resolver, never re-derived at call sites." This IS a call site self-falling-back — the ADR's named no-self-fallback anti-pattern. Repo: learning-preferences.tsx:33 useLearnerProfile() unconditional; correct sibling accommodation.tsx:51-52 uses both hooks. Which-hook IS the access decision. Flag in-IF-scope, src=MMT-ADR-0008.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-logic-bug-6bededf179` — src: `.deepsec/findings/BUG/eduagent-build-other-logic-bug-6bededf179.md` — evidence: apps/mobile/src/app/(app)/more/learning-preferences.tsx:33-89
- **quote[0]:** When the screen is opened in child mode, the headings switch to the child's name, but the displayed accommodation option is derived from the SELF learner profile. Line 33 unconditionally calls useLearnerProfile() (the self profile), and lines 35-37 compute activeOption from learnerProfile?.accommodationMode. The screen never calls useChildLearnerProfile(childProfileId).
- **rationale:** F-163 is a mobile hook-selection bug: the screen calls useLearnerProfile() (self) unconditionally in child mode instead of useChildLearnerProfile(childProfileId). None of the 20 canonical-set members govern which React hook a screen uses to resolve accommodation preferences. Identity-foundation ADRs (0007/0008/0011/0015) define the entity graph and schema at the domain layer, not mobile presentation. The defect is fully in mobile UI implementation — already tagged l10n-a11y-mobile — and has no footprint in the identity canon.

### F-164 — updateInterestsContext bumps the optimistic-concurrency version but never checks it (non-CAS)

- **workstream:** security-pii-api · **domain:** other-lost-update-race
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Table-membership logic holds: learning_profiles isn't one of the 8 identity tables; no canonical member covers learning-profile concurrency. But exclusion is unsafe. (1) Unverifiable both ways: learningProfiles/updateInterestsContext/version-CAS appear nowhere in repo or audit corpus; F-164 unfindable. A scope call on code that doesn't resolve is no better-founded than its opposite; "owned by security-pii-api" is asserted, uncited (source=""). (2) data-model 5.1 names person_id THE scope key for ALL learning data, an identity-owned RLS duty; a concurrency defect on a learning write is arguably identity scope-enforcement. Unverifiable finding, flag cheap, default refuted.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-lost-update-race-748976e6d6` — src: `.deepsec/findings/BUG/eduagent-build-other-lost-update-race-748976e6d6.md` — evidence: apps/api/src/services/onboarding/index.ts:156-190
- **quote[0]:** updateInterestsContext() verifies ownership with a SELECT on profiles, then performs a wholesale UPDATE of learningProfiles.interests with version: sql`${learningProfiles.version} + 1` and WHERE eq(learningProfiles.profileId, profileId). The version is INCREMENTED but never used as a guard in the WHERE clause, so this is not a true compare-and-swap.
- **rationale:** F-164 targets learningProfiles.interests/version — a learning-domain table. The identity-foundation canonical set (CANONICAL-SET.md, locked 2026-06-08) defines 8 identity tables (person, login, organization, membership, subscription, guardianship, supportership, consent_grant) plus amendment tables. learning_profiles is absent from all of them. No L1/L2/L3 canonical-set member covers learning-profile concurrency semantics. The finding is a real non-CAS defect owned by the security-pii-api workstream that already claims it.

### F-165 — masteryScore query param not guarded against NaN (incomplete sweep of BUG-813 fix)

- **workstream:** l10n-a11y-mobile · **domain:** other-malformed-input-handling
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote is paraphrased, not verbatim. Source uses backticks and line references (L119-123, L190, L209, L213) which the provided quote strips. Quote also truncates mid-sentence before parenthetical clarifications. HARD CONSTRAINT VIOLATION: quote is not verbatim from cited source.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-malformed-input-handling-875b04425f` — src: `.deepsec/findings/BUG/eduagent-build-other-malformed-input-handling-875b04425f.md` — evidence: apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx:119-213
- **quote[0]:** The screen reads masteryScore from useLocalSearchParams and parses it with Number(masteryScore) and no Number.isFinite guard. For a malformed value like ?masteryScore=abc, mastery becomes NaN and masteryPercent = Math.round(NaN*100) is NaN. Because masteryPercent !== null is true for NaN, the Understanding card renders with style={{ width: 'NaN%' }} and the caption displays literal 'NaN%'.
- **rationale:** F-165 is a query-param sanitization bug in a mobile learning/progress screen — `Number(masteryScore)` without a `Number.isFinite` guard causes NaN in a CSS width style and caption. None of the 20 canonical-set members govern query-param parsing, mastery-score display, or UI rendering. The canonical set covers identity/tenancy, person/role, guardianship, age-consent, LLM routing, compliance, and the identity data model. No tie to any of those areas. The source finding already tags it `l10n-a11y-mobile`, which is the correct owner.

### F-166 — Missing UUID validation on subjectId path param causes unhandled 500s on malformed input

- **workstream:** security-pii-api · **domain:** other-missing-input-validation
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Merits favor the classifier: /subjects/:subjectId hits the curriculum subjects table, NOT one of the 8 identity tables; finding is raw subjectId UUID validation, not Person/Login/consent. No brief member governs generic input-validation, so in-IF-scope is genuinely unsupportable. Refuted on procedure: (1) classifier asserts target=security-pii-api, but the lens adjudicates only IF in/out, not other-workstream ownership — that reroute is unverifiable here; (2) in-other-workstream + canonical_set_source="" is exactly the auto-flag case. Repo confirms the bug (language-progress.ts:19-26 reads param raw), so flag-to-human beats a confident bare reroute. \| quote-not-found: Quote paraphrased/condensed: provided quote says 'runs a Postgres query on a uuid column' but actual audit file contains 'runs db.query.subjects.findFirst({...})' — semantically equivalent but not verbatim.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-missing-input-validation-2a905de60a` — src: `.deepsec/findings/BUG/eduagent-build-other-missing-input-validation-2a905de60a.md` — evidence: apps/api/src/routes/language-progress.ts:18-26
- **quote[0]:** The GET '/subjects/:subjectId/cefr-progress' handler reads the path param raw via c.req.param('subjectId') and passes it straight into getCurrentLanguageProgress, which runs a Postgres query on a uuid column. Passing a non-UUID string (e.g. /subjects/foo/cefr-progress) makes Postgres raise error 22P02 'invalid input syntax for type uuid'.
- **rationale:** F-166 is missing UUID validation on `subjects/:subjectId/cefr-progress` — a curriculum endpoint unrelated to identity. The canonical set (locked 2026-06-08) covers identity/tenancy graph, role model, guardianship, age/consent, LLM routing, and compliance (ADRs 0001/0002/0007-0016 + four L1 docs + compliance register). None govern URL param validation or CEFR-progress. No brief member can be cited. Finding routes to security-pii-api, which owns API-layer input validation.

### F-167 — Non-transactional regenerate: ownership-check -> delete-all -> insert can race a concurrent same-user request

- **workstream:** security-pii-api · **domain:** other-non-atomic-write
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Source file has backticks around code (e.g., `regenerateLanguageCurriculum`, `version: 1`), provided quote strips them. File line 13 starts with backtick-delimited text; quote removes backticks and reformats punctuation.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-non-atomic-write-0b7526a752` — src: `.deepsec/findings/BUG/eduagent-build-other-non-atomic-write-0b7526a752.md` — evidence: apps/api/src/services/language-curriculum.ts:358-372
- **quote[0]:** regenerateLanguageCurriculum verifies subject ownership (line 358), then deletes ALL curricula for the subject (line 370), then inserts a fresh curriculum with hardcoded version: 1 (lines 372-378) — all outside a transaction. Two near-simultaneous requests can interleave: both pass the ownership check, both delete, both insert, producing duplicate version: 1 curricula or a unique-constraint failure.
- **rationale:** F-167 is a TOCTOU race in regenerateLanguageCurriculum — ownership-check, bulk-delete, and insert outside a transaction. This is a curriculum-content-service concurrency defect. No canonical-set member (docs/canon/identity/* docs, compliance register, ADRs 0000/0001/0002/0007-0016) governs curriculum regeneration or content-service transaction safety. The canonical set covers identity/tenancy graph, person-login split, guardianship, age-bracket consent, and LLM routing — none implicated here. Real finding; owner is security-pii-api.

### F-168 — subjectId route param not normalized for array case (inconsistent with sibling screen)

- **workstream:** l10n-a11y-mobile · **domain:** other-param-handling
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote is paraphrased, not verbatim. Source includes additional details: useVocabulary/useDeleteVocabulary/find() usage, line refs, 'or a path+query name collision', goBack/render paths.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-param-handling-9dc7ae203b` — src: `.deepsec/findings/BUG/eduagent-build-other-param-handling-9dc7ae203b.md` — evidence: apps/mobile/src/app/(app)/vocabulary/[subjectId].tsx:125-131
- **quote[0]:** subjectId is read via useLocalSearchParams and used directly as a string. Expo Router can surface a query/route param as string[] (e.g. a crafted deep link with duplicate ?subjectId=a&subjectId=b). The sibling screen child/[profileId]/subjects/[subjectId].tsx explicitly guards this with Array.isArray(rawSubjectId) ? rawSubjectId[0] : rawSubjectId, but this screen does not.
- **rationale:** F-168 is about Expo Router route-param array normalization on a mobile screen — a mobile navigation robustness issue. None of the 20 canonical-set members (ontology, domain-model, data-model, prd, compliance register, ADRs 0000/0001/0002/0007–0016, LLM register) address URL/route-param handling or deep-link coercion. The finding has no surface in identity, tenancy, consent, or LLM-routing domains. No canonical-set member can be cited to bring this into IF scope; the source corpus already places it in l10n-a11y-mobile, which is the correct owner.

### F-169 — Lost-update race in reviewVocabulary SM-2 read-compute-write (transaction does not provide claimed isolation)

- **workstream:** security-pii-api · **domain:** other-race-condition
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** learning-engine
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote 0: Found in file but NOT verbatim. File has backticks around `db.transaction()` and parenthetical `(card + vocab)` after 'UPDATEs' that are missing from provided quote. File version has formatting; provided version stripped it.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-race-condition-103549719e` — src: `.deepsec/findings/BUG/eduagent-build-other-race-condition-103549719e.md` — evidence: apps/api/src/services/vocabulary.ts:271-299
- **quote[0]:** reviewVocabulary wraps the retention-card read-compute-write in db.transaction() and comments that this 'prevent[s] SM-2 race conditions: concurrent reviews reading the same consecutiveSuccesses would silently overwrite each other's SM-2 parameters without serialization.' This is incorrect. A bare Drizzle/Postgres transaction runs at READ COMMITTED isolation; it makes the two UPDATEs atomic together but does NOT serialize the read-compute-write.
- **rationale:** F-169 is a transaction-isolation bug in the SM-2 spaced-repetition read-compute-write inside reviewVocabulary. SM-2 scheduling and vocabulary retention are a learning-engine concern with no connection to identity, tenancy, consent, guardianship, age-bracketing, the policy engine, or LLM routing. None of the 20 canonical-set members address spaced-repetition concurrency. No cite is possible — the domain is entirely outside identity-foundation. The finding is real but owned by the workstream responsible for the learning/study-session domain.

### F-170 — Pending celebration writes can still lose concurrent updates

- **workstream:** security-pii-api · **domain:** other-race-condition
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** mobile-cache-data-fetching
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Provided quote omits 'The exported writeHomeSurfacePendingCelebrations helper only accepts a fully materialized array, so' and says 'call writeHomeSurfacePendingCelebrations' instead of 'call this helper'
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-race-condition-438202c1ef` — src: `.deepsec/findings/BUG/eduagent-build-other-race-condition-438202c1ef.md` — evidence: apps/api/src/services/home-surface-cache.ts:224-245
- **quote[0]:** mergeHomeSurfaceCacheData locks the row for cardData merges, but pendingCelebrations is replaced wholesale from options.pendingCelebrations. Callers that read the current pending list, append/prune outside the lock, and then call writeHomeSurfacePendingCelebrations can race: two concurrent writers can both read the same old list and the last update drops the other's celebration.
- **rationale:** F-170 is a client-side concurrency race in the home-surface cache layer: pendingCelebrations is replaced wholesale outside the lock protecting cardData merges, so concurrent callers can read the same stale list and drop each other's writes. No canonical-set member (ontology, domain-model, data-model, PRD, compliance register, ADRs 0000–0016) addresses home-surface cache merging or mobile client-side write concurrency. The finding is real but owned by the mobile caching/data-fetching workstream, not identity-foundation.

### F-171 — Lost-update race in celebration writes: read happens outside the SELECT FOR UPDATE lock

- **workstream:** security-pii-api · **domain:** other-race-condition
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** reliability-and-correctness
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Provided quote is a paraphrase, not verbatim. File contains additional details: 'at line 83', 'pendingCelebrations = [...existing, nextEntry]', delegation to mergeHomeSurfaceCacheData, and '(home-surface-cache.ts:204-208)'. These details are omitted from the supplied quote.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-race-condition-7bc421eb7e` — src: `.deepsec/findings/BUG/eduagent-build-other-race-condition-7bc421eb7e.md` — evidence: apps/api/src/services/celebrations.ts:83-174
- **quote[0]:** queueCelebration() reads the existing pending-celebrations array via findHomeSurfaceCache(db, profileId) OUTSIDE any transaction/lock. It then computes the full next array and, inside db.transaction(), calls writeHomeSurfacePendingCelebrations. mergeHomeSurfaceCacheDataInTx does acquire a row lock with SELECT FOR UPDATE, but it then OVERWRITES pendingCelebrations with the caller's stale, out-of-lock array instead of appending under the lock.
- **rationale:** F-171 is a lost-update race in queueCelebration(): pendingCelebrations is read outside the SELECT FOR UPDATE lock and written back stale inside the transaction. None of the 20 canonical-set members (identity ontology, domain model, data model for the 8 identity tables, PRD, compliance register, or ADRs 0000-0016) concern home-surface cache or celebration queuing. No canonical-set member can be cited. The source label security-pii-api is a misclassification — this is a feature-layer concurrency bug, not auth/PII/identity. Remediation belongs to the workstream owning home-surface reliability.

### F-172 — Recall-test submit and 'don't remember' use independent in-flight guards, allowing a double-submit

- **workstream:** l10n-a11y-mobile · **domain:** other-race-condition
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote is paraphrased, not verbatim. File has backticks around code identifiers and includes line numbers (L111/L207) that are not in the provided quote. The core content exists but formatting and minor wording differ.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-race-condition-9c88182698` — src: `.deepsec/findings/BUG/eduagent-build-other-race-condition-9c88182698.md` — evidence: apps/mobile/src/app/(app)/topic/recall-test.tsx:111-207
- **quote[0]:** handleSend() guards on submissionInFlightRef.current \|\| isStreaming while handleDontRemember() guards on dontRememberPendingRef.current \|\| isStreaming. These two refs are independent, and isStreaming is only set to true later, inside animateResponse() within the mutation's onSuccess callback. During the network round-trip, the other handler's ref is still false, so a fast user can trigger two concurrent POST /retention/recall-test calls.
- **rationale:** F-172 is a mobile UI concurrency bug: handleSend() and handleDontRemember() use independent React refs as in-flight guards, allowing two concurrent POST /retention/recall-test calls. This has no connection to any canonical-set member. The 20-member set covers identity/tenancy (MMT-ADR-0001), person/role model (0007/0008/0011/0015), age-consent transitions (0009), LLM-routing engine (0013/0014), and safety architecture (0016) — none address UI submission guards or client-side in-flight state. The finding's assigned workstream (l10n-a11y-mobile) is the correct owner.

### F-173 — downgradeQuotaPool can reset an upgraded account's quota pool to free limits (day-28 transition race)

- **workstream:** security-pii-api · **domain:** other-race-condition
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** billing-subscriptions
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote is paraphrased, not verbatim. Audit file says 'If, during the extended-trial window, the user re-subscribes...'; provided quote rewords it and omits parenthetical context about RevenueCat and reconcileQuotaStateForSubscription.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-race-condition-d9af95b461` — src: `.deepsec/findings/BUG/eduagent-build-other-race-condition-d9af95b461.md` — evidence: apps/api/src/services/billing/trial.ts:52-75
- **quote[0]:** downgradeQuotaPool() is called by the trial-expiry cron for rows from findExpiredTrialsByDaysSinceEnd(). Its only safety is an idempotency check that skips when currentPool.monthlyLimit === monthlyLimit. If the user re-subscribes to a paid tier during the extended-trial window, the equality check no longer matches the free limit, so the cron proceeds to overwrite the pool with free monthlyLimit/dailyLimit.
- **rationale:** F-173 is a race in downgradeQuotaPool() where the trial-expiry cron overwrites a re-subscribed user's quota pool with free-tier limits because the idempotency check uses monthlyLimit equality rather than checking current subscription state. This is a billing/subscription quota management defect. None of the 20 canonical-set members govern quota pool arithmetic or trial-expiry cron logic. MMT-ADR-0002 covers who *is* the Payer (store-delegated), not quota pool updates post-resubscription. No canonical-set member is citable; the finding belongs to the billing-subscriptions workstream.

### F-174 — LLM recall-quality grade computed before cooldown claim, allowing wasted paid LLM call

- **workstream:** security-pii-inngest · **domain:** other-redundant-llm-call
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-inngest
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote contains paraphrased text instead of verbatim. File has backticks around evaluateRecallQuality(), line refs (L95-97), guard clause details, and '[WI-234], L835-884' context. Provided quote omits these and paraphrases 'team deliberately structured...to claim' as 'deliberately claims'.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-redundant-llm-call-487bac52e7` — src: `.deepsec/findings/BUG/eduagent-build-other-redundant-llm-call-487bac52e7.md` — evidence: apps/api/src/inngest/functions/review-calibration-grade.ts:95-131
- **quote[0]:** handleReviewCalibrationGrade calls the LLM grader evaluateRecallQuality() in the 'grade-recall-quality' step BEFORE the cooldown is atomically claimed by the persist UPDATE. This is the opposite order from the sibling user-facing path processRecallTest(), which deliberately claims the cooldown window with an atomic UPDATE BEFORE the LLM call 'to make exactly one request reach the LLM'.
- **rationale:** F-174 is about cooldown-claim ordering vs LLM call in handleReviewCalibrationGrade — a session/recall calibration flow. No canonical-set member governs this. MMT-ADR-0013/0014 cover the policy-engine shape and router/vetting split, not per-call cooldown atomicity in learning-session jobs. The defect is a backend race-condition in a non-identity Inngest function; it belongs to the workstream already assigned in the finding: security-pii-inngest.

### F-175 — Impure side effect (sessionStorage write) executed unconditionally during render

- **workstream:** l10n-a11y-mobile · **domain:** other-render-phase-side-effect
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Refute. Classifier's anchor is fabricated: it says the source tagged this l10n-a11y-mobile. Verified: F-175 is a .deepsec BUG, slug other-render-phase-side-effect, owner-by-last-committer, NO domain tag; l10n-a11y-mobile is a different corpus that never names it. Scope tracks SURFACE not mechanism. Bug is in (auth)/_layout.tsx rememberPendingAuthRedirect, preserving the deep-link target across the signed-in transition — the Clerk-to-owned-graph handoff governed by MMT-ADR-0001 and the PRD login flow. A citable IF member owns it; empty canonical_set_source self-flags. At least as strong -> flag-to-human.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-render-phase-side-effect-dc16fb7b5e` — src: `.deepsec/findings/BUG/eduagent-build-other-render-phase-side-effect-dc16fb7b5e.md` — evidence: apps/mobile/src/app/(auth)/_layout.tsx:64-74
- **quote[0]:** In the component body (render phase), whenever redirectTarget is truthy, rememberPendingAuthRedirect(resolvedRedirectTarget) is called on every render. That function mutates module-level state and writes to sessionStorage with a fresh savedAt = Date.now(). Writing to storage and stamping a timestamp during render violates React's render-purity contract.
- **rationale:** F-175 is a React render-purity defect: rememberPendingAuthRedirect() fires on every render, writing to sessionStorage with a fresh timestamp. This is a mobile engineering quality issue — none of the 20 canonical-set members (L1 domain docs, ADRs 0000–0016, compliance register, model register) concern React rendering discipline or sessionStorage hygiene. The finding is about side-effect placement in the render cycle, not identity/tenancy contracts. The source audit already tagged it l10n-a11y-mobile, the correct mobile-engineering owner.

### F-176 — Proxy mode not cleared when saved profile is removed server-side (sticky contradictory state)

- **workstream:** security-pii-api · **domain:** other-state-inconsistency
- **scope_class:** in-IF-scope · **in_scope:** true · **target_workstream:** (none)
- **canonical_set_source:** docs/canon/identity/domain-model.md; MMT-ADR-0007 (core identity entity and role model); MMT-ADR-0008 (guardianship as a global edge)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(high): REFUTED. Cited members are silent on this defect. ADR-0007: zero proxy/client/session. domain-model.md: zero proxy/client/sticky/cleared. Ontology: zero proxy/operate. ADR-0008 governs a SERVER guardianship edge + derived authority query, not a client proxy session or SecureStore key. F-176's quote is pure client state: a React effect that never clears PARENT_PROXY_KEY/setProxyMode. The real identity invariant is server-enforced (corpus CL-B fixes it at a requireWritableProfile server seam, separate from client gaps); a sticky flag is confusing-UI, not a write. Belongs to navigation/audience-matrix (isParentProxy), not identity canon. No named member owns clearing the client proxy flag. \| quote-not-found: Quote is not verbatim: removes line references (L293-313, L305-311), omits detail '(via consent denial/auto-delete)', removes backticks from `profileWasRemoved`. Violates hard constraint: every row must anchor to verbatim quote from cited source.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-state-inconsistency-184499b672` — src: `.deepsec/findings/BUG/eduagent-build-other-state-inconsistency-184499b672.md` — evidence: apps/mobile/src/lib/profile.ts:279-311
- **quote[0]:** The validation effect checks whether the saved id still exists; if not (child profile removed server-side), it sets profileWasRemoved and falls back to the owner profile — but it never clears the proxy flag, PARENT_PROXY_KEY, or calls setProxyMode(false)/setIsExplicitProxyMode(false).
- **rationale:** F-176 is a proxy-session lifecycle bug: PARENT_PROXY_KEY and proxy flags are not cleared when a child profile is removed server-side. The proxy-switching concept (guardian operating as a child profile) is defined by identity canon — MMT-ADR-0008 (guardianship as a global edge) and MMT-ADR-0007 (role/entity model) define what a proxy session is; docs/canon/identity/domain-model.md governs profile lifecycle. The defect is failure to invalidate client proxy state when the proxied profile is gone — violating a domain-model invariant. Identity-foundation workstream owns remediation.

### F-177 — localDate computed in UTC (toISOString) despite name/intent of device-local date

- **workstream:** l10n-a11y-mobile · **domain:** other-timezone-day-bucketing
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** confirmed
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-timezone-day-bucketing-af7c3e6e39` — src: `.deepsec/findings/BUG/eduagent-build-other-timezone-day-bucketing-af7c3e6e39.md` — evidence: apps/mobile/src/app/(app)/dictation/review.tsx:56
- **quote[0]:** In handleDone (line 56) the result is recorded with const localDate = new Date().toISOString().slice(0, 10). Date.prototype.toISOString() always renders the date in UTC, not the device's local timezone, so the value sent as localDate is the UTC calendar day. The server persists this verbatim into the dictation_results.date column, which is the basis for the consecutive-day streak.
- **rationale:** F-177 is a UTC-vs-local-date bug: `toISOString().slice(0,10)` records the UTC calendar day, not the device-local date, corrupting streak counting. None of the 20 canonical-set members govern streak date computation or `dictation_results.date` semantics — the set covers identity entities/roles/consent, guardianship, age brackets, compliance obligations, policy-engine spine, LLM routing, and the vetted-model register. This is a timezone/localisation defect; the `l10n-a11y-mobile` workstream already owns it and is the correct remediator.

### F-178 — Quiz-history date grouping/labeling mixes UTC and local time bases (off-by-one labels)

- **workstream:** l10n-a11y-mobile · **domain:** other-timezone-logic-bug
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote is paraphrased, not verbatim. Source uses backticks and schema details; quote omits both. Quote removes line references (L221, L17, L18-19) and simplifies 'strict ISO UTC datetime (schema isoDateField)' to just 'a UTC datetime'.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-timezone-logic-bug-828ff02d9b` — src: `.deepsec/findings/BUG/eduagent-build-other-timezone-logic-bug-828ff02d9b.md` — evidence: apps/mobile/src/app/(app)/quiz/history.tsx:16-221
- **quote[0]:** Rounds are grouped by round.completedAt.slice(0, 10) — a UTC datetime — yielding the round's UTC calendar date. formatDateHeader then parses that date as new Date(`${isoDate}T00:00:00`) with NO timezone suffix, which JS interprets as local midnight, and compares it against today built from local getFullYear/Month/Date(). The two time bases disagree for any user not at UTC.
- **rationale:** F-178 is a timezone/date-display bug: UTC-sliced completedAt dates compared against local-calendar getFullYear/Month/Date() values produce off-by-one grouping labels for non-UTC users. No canonical-set member covers this — the set addresses identity ontology, tenancy/consent domain model, 8-table schema, age/consent PRD, COPPA/GDPR compliance, and ADRs 0000–0016 (tenancy graph, guardianship, durable scheduler, policy engine, LLM routing, safety). None has bearing on quiz-round timestamp rendering. This is a pure l10n/timezone correctness defect; l10n-a11y-mobile is the correct and ready owner.

### F-179 — Server-side grading input answerGiven has no maximum length before O(m*n) Levenshtein routine

- **workstream:** security-pii-api · **domain:** other-unbounded-input
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote is a paraphrased abstraction of the finding text. File has additional line citations (L117, L158) and uses O(m·n) vs O(m*n). Exact string does not appear verbatim.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-unbounded-input-7f16ac38e9` — src: `.deepsec/findings/BUG/eduagent-build-other-unbounded-input-7f16ac38e9.md` — evidence: packages/schemas/src/quiz-utils.ts:5-56
- **quote[0]:** isGuessWhoFuzzyMatch()/levenshteinDistance() in quiz-utils.ts run the Wagner-Fischer edit-distance algorithm (O(m*n) time) over user-supplied input. The corresponding wire schema validates answerGiven only as z.string() / z.string().min(1) — there is no .max() bound.
- **rationale:** F-179 is a DoS/resource-exhaustion hardening issue in the quiz/learning layer (`quiz-utils.ts` Levenshtein, `answerGiven` wire schema). None of the 20 canonical-set members covers quiz-answer grading or input validation on learning-activity schemas. The canonical set is bounded to person/role/guardianship/consent, tenancy ADRs (0001, 0002, 0007–0016), family-join, policy engine, vetted-model register, and the compliance register — none of which speaks to quiz scoring. No canonical-set member is citeable. The finding is real but owned by `security-pii-api`.

### F-180 — Uncapped chunks/chunksWithPunctuation arrays in dictation review input DTO

- **workstream:** security-pii-api · **domain:** other-unbounded-input
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — quote-not-found: Quote provided omits backticks and line citations (L29, L31) present in source. Source includes text about dictationReviewInputSchema.sentences. The provided quote is paraphrased, not verbatim from line 13 of the audit file.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-other-unbounded-input-ea02cf931f` — src: `.deepsec/findings/BUG/eduagent-build-other-unbounded-input-ea02cf931f.md` — evidence: packages/schemas/src/dictation.ts:29-31
- **quote[0]:** dictationSentenceSchema declares chunks: z.array(z.string()).optional() and chunksWithPunctuation: z.array(z.string()).optional() with no cap on either the array length or per-element string length. Every other field in this module is deliberately bounded, and the module header comment states caps exist explicitly to bound attacker-controlled payload.
- **rationale:** F-180 concerns missing array-length and string caps on chunks/chunksWithPunctuation in dictationSentenceSchema — an API input-DTO gap in the learning/session flow. None of the 20 canonical-set members covers dictation or session schemas: L1 docs define identity/tenancy/consent entities; the compliance register covers COPPA/GDPR/EU-AI-Act; ADRs 0000-0016 address identity graph, guardianship, age transitions, policy engine, and LLM routing. No brief member touches API input-size bounding for learning payloads. Finding is real; owned by security-pii-api.

### F-181 — Unauthenticated forced JWKS re-fetch with no negative cache or cooldown (DoS amplification)

- **workstream:** security-pii-api · **domain:** rate-limit-bypass
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** security-pii-api
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** BUG · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): Counter to in-other-workstream: plausibly in-IF-scope. Defect is in apps/api/src/middleware/jwt.ts, the Clerk JWT verification seam. MMT-ADR-0001 (named member) explicitly lists "edge JWT verification" as an auth capability IF owns the design of; lookupJWKByKid->fetchJWKSForced IS that path, so the gap is inside the seam, not adjacent. Classifier conceded ADR-0001 is "closest" then narrowed too far. IF clean-cut re-platforms this exact path (ADR-0012), so jwt.ts defects belong to that team; splitting fractures one file across streams. Decisive: cite="" auto-flags, yet they issued an EXCLUSION with no anchor; "security-pii-api" is not a brief member, ADR-0001 is. Flag-to-human is cheap. \| quote-not-found: Quote is sanitized paraphrase, not verbatim. Source includes code refs like '(fetchJWKSForced, L134-159)' stripped from provided quote.
- **provenance:**
  - `root/deepsec-handover::deepsec-BUG-rate-limit-bypass-372b9592f9` — src: `.deepsec/findings/BUG/eduagent-build-rate-limit-bypass-372b9592f9.md` — evidence: apps/api/src/middleware/jwt.ts:134-190
- **quote[0]:** lookupJWKByKid() forces a TTL-ignoring upstream JWKS fetch whenever a token's header.kid is absent from the cached JWKS. The kid is fully attacker-controlled and the signature is NEVER checked before this lookup. An UNAUTHENTICATED attacker who sends well-formed JWTs with random/unknown kids forces an outbound fetch to the Clerk JWKS endpoint on the lookup path.
- **rationale:** F-181 is a DoS amplification defect in auth middleware: lookupJWKByKid() forces an unconditional upstream Clerk JWKS fetch on unknown kids with no negative-cache or cooldown, exploitable unauthenticated. MMT-ADR-0001 (Clerk-for-auth-only) is the closest canonical-set member but governs Clerk's architectural role, not JWKS fetch caching. No other canonical-set member (domain-model, data-model, ontology, prd, compliance register, ADRs 0007-0016) addresses JWKS caching or outbound rate-limiting. Remediation lives in the security-pii-api workstream's auth-middleware layer.

### INV-1 — Hardcoded user-visible JSX strings bypass i18n (no automated guard)

- **workstream:** l10n-a11y-mobile · **domain:** i18n / mobile UI strings
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** l10n-a11y-mobile
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** H (primary visible copy) · **normalized_priority:** P1
- **verify_status:** contested — scope-refuted(medium): "No canonical member addresses UI copy" is false. Member #20, the L1 compliance-register (docs/compliance/identity-compliance-register.md), binds user-visible copy via CI guards: functional-only internal-state vocabulary (real guard scripts/no-clinical-copy-baseline.json), profiling disclosure, minor AI-training-toggle gating. Those guards only see copy through t()/i18n. A hardcoded JSX string bypasses that layer — the route by which prohibited vocabulary ships unseen. Finding names it: "no automated guard." So it is a compliance gap tied to a named member, citable. Classifier left source empty. Scope contestable.
- **provenance:**
  - `workflow-1/findings::workflow-1-i18n` — src: `docs/audit/2026-05-29-full-audit/workflow-1/findings.md` — evidence: docs/audit/2026-05-29-full-audit/workflow-1/findings.md
- **quote[0]:** 960 confirmed hardcoded user-visible strings, grouped by file (most-affected first). Generated 2026-05-30. Severity legend: **H**igh = primary visible copy; **M**edium = placeholder/helper/a11y; **L**ow = edge/possibly-dynamic.
- **rationale:** INV-1 is a localization hygiene defect: 960 hardcoded JSX strings bypassing i18n, no automated guard. The identity-foundation canonical set (all 20 members: ontology, domain-model, data-model, prd, compliance-register, ADRs 0000/0001/0002/0007–0016, model register, A-vs-B memo) covers identity entities, tenancy, consent, age modelling, guardianship, policy-engine, LLM routing/vetting, and safety. None address UI string management, i18n coverage, or JSX literal guards. No canonical-set member can be cited; the finding belongs to l10n-a11y-mobile.

### INV-2 — Internal jest.mock() backlog (GC6 burn-down class)

- **workstream:** architecture · **domain:** Code Quality / Test Infrastructure
- **scope_class:** in-other-workstream · **in_scope:** false · **target_workstream:** architecture
- **canonical_set_source:** (none — out-of-IF by absence)
- **source_severity:** GC6 (backlog, not acceptable state) · **normalized_priority:** P2
- **verify_status:** contested — scope-refuted(medium): Two defects. (1) "INV-2" appears NOWHERE in corpus (grep=0); it is filed as "Backlog, not blocker" (evidence-ledger:139). A scope call on an invented artifact is unverifiable. (2) Many of the 153 sites mock IF surface — services/consent, services/deletion (deleteProfile), services/profile (resolveProfileRole, getFamilyOwnerProfileId), @eduagent/database for consentStates/profiles/familyLinks (catalog.csv 4-86). Maps to consent model (domain-model.md), guardianship (ADR-0008), data-model.md. M/N/O rewrites those tables, so these conversions are a verification dependency of the IF migration, not orthogonal cleanup. Fabricated cite + IF overlap = at least as strong; default-to-refuted.
- **provenance:**
  - `workflow-2/findings::workflow-2-mocks` — src: `docs/audit/2026-05-29-full-audit/workflow-2/findings.md` — evidence: docs/audit/2026-05-29-full-audit/workflow-2/findings.md
- **quote[0]:** **153 genuine unescaped internal violations** (API 103, mobile 50), of which **101 are trivial/S** and 52 need wiring (50 M, 2 L). That's the number to track.
- **rationale:** INV-2 covers the GC6 jest.mock() burn-down class — 153 internal mock violations across API (103) and mobile (50). None of the 20 identity-foundation canonical-set members (docs/canon/identity/ domain docs, MMT-ADR-0000–0016, compliance register, model register) address test infrastructure or mock hygiene. This is a cross-cutting codebase-quality concern orthogonal to identity-foundation scope. It already maps to the "architecture" workstream in the corpus and no canonical-set member creates any obligation around it.

## Inventory classes

### Hardcoded user-visible JSX strings bypass i18n (no automated guard)

- **workstream:** l10n-a11y-mobile · **severity:** H (primary visible copy) · **instances:** ~960 across 92 files
- **source:** `docs/audit/2026-05-29-full-audit/workflow-1/findings.md`
- **quote:** 960 confirmed hardcoded user-visible strings, grouped by file (most-affected first). Generated 2026-05-30. Severity legend: **H**igh = primary visible copy; **M**edium = placeholder/helper/a11y; **L**ow = edge/possibly-dynamic.

### Internal jest.mock() backlog (GC6 burn-down class)

- **workstream:** architecture · **severity:** GC6 (backlog, not acceptable state) · **instances:** 153 violations across 164 files (API 103, mobile 50); 101 trivial/S, 52 need wiring
- **source:** `docs/audit/2026-05-29-full-audit/workflow-2/findings.md`
- **quote:** **153 genuine unescaped internal violations** (API 103, mobile 50), of which **101 are trivial/S** and 52 need wiring (50 M, 2 L). That's the number to track.

