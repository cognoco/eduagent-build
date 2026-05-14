# Graph Report - /Users/vetinari/_dev/eduagent-build-graphify-spike  (2026-05-13)

## Corpus Check
- Large corpus: 2004 files · ~2,589,563 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 11680 nodes · 21077 edges · 45 communities
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 465 edges (avg confidence: 0.8)
- Token cost: 1,429,071 input · 66,206 output

## Community Hubs (Navigation)
- [[_COMMUNITY_API Services & Middleware|API Services & Middleware]]
- [[_COMMUNITY_Mobile Library & Retention|Mobile Library & Retention]]
- [[_COMMUNITY_API Routes & Handlers|API Routes & Handlers]]
- [[_COMMUNITY_API Route Tests|API Route Tests]]
- [[_COMMUNITY_Mobile Session Screens|Mobile Session Screens]]
- [[_COMMUNITY_Mobile Onboarding & Components|Mobile Onboarding & Components]]
- [[_COMMUNITY_Inngest Background Functions|Inngest Background Functions]]
- [[_COMMUNITY_Notifications & Scheduling|Notifications & Scheduling]]
- [[_COMMUNITY_Integration Tests|Integration Tests]]
- [[_COMMUNITY_Mobile Progress Tests|Mobile Progress Tests]]
- [[_COMMUNITY_Progress & Coaching Schemas|Progress & Coaching Schemas]]
- [[_COMMUNITY_Database Schema Layer|Database Schema Layer]]
- [[_COMMUNITY_LLM Eval Harness|LLM Eval Harness]]
- [[_COMMUNITY_Consent & Profile Onboarding|Consent & Profile Onboarding]]
- [[_COMMUNITY_Book & Topic UI|Book & Topic UI]]
- [[_COMMUNITY_Billing & Subscriptions|Billing & Subscriptions]]
- [[_COMMUNITY_Quiz Generation Engine|Quiz Generation Engine]]
- [[_COMMUNITY_Subject & Book Schemas|Subject & Book Schemas]]
- [[_COMMUNITY_Mobile Shelf & Suggestions|Mobile Shelf & Suggestions]]
- [[_COMMUNITY_Retention & Review Calibration|Retention & Review Calibration]]
- [[_COMMUNITY_Memory Facts & Relevance|Memory Facts & Relevance]]
- [[_COMMUNITY_Snapshot Aggregation & Milestones|Snapshot Aggregation & Milestones]]
- [[_COMMUNITY_Account & Settings UI|Account & Settings UI]]
- [[_COMMUNITY_Integration Test Helpers|Integration Test Helpers]]
- [[_COMMUNITY_Session & Engagement Schemas|Session & Engagement Schemas]]
- [[_COMMUNITY_Learner Profile & Analysis|Learner Profile & Analysis]]
- [[_COMMUNITY_Books & Curriculum Routes|Books & Curriculum Routes]]
- [[_COMMUNITY_Mentor Memory UI|Mentor Memory UI]]
- [[_COMMUNITY_Assessment Schemas|Assessment Schemas]]
- [[_COMMUNITY_Test Seed Utilities|Test Seed Utilities]]
- [[_COMMUNITY_Account Deletion & Consent Tests|Account Deletion & Consent Tests]]
- [[_COMMUNITY_Dashboard & Orchestration|Dashboard & Orchestration]]
- [[_COMMUNITY_Session Interaction Schemas|Session Interaction Schemas]]
- [[_COMMUNITY_Consent Web Routes|Consent Web Routes]]
- [[_COMMUNITY_CI & Config Files|CI & Config Files]]
- [[_COMMUNITY_Mobile Progress Screens|Mobile Progress Screens]]
- [[_COMMUNITY_Memory Dedup Pipeline|Memory Dedup Pipeline]]
- [[_COMMUNITY_Session Completion Tests|Session Completion Tests]]
- [[_COMMUNITY_Quiz & Round Schemas|Quiz & Round Schemas]]
- [[_COMMUNITY_Session CRUD & Lifecycle|Session CRUD & Lifecycle]]
- [[_COMMUNITY_Language Setup Tests|Language Setup Tests]]
- [[_COMMUNITY_Parent Retention UI|Parent Retention UI]]
- [[_COMMUNITY_Progress Computation Service|Progress Computation Service]]
- [[_COMMUNITY_Billing & Checkout Schemas|Billing & Checkout Schemas]]
- [[_COMMUNITY_Uncategorized & Isolates|Uncategorized & Isolates]]

## God Nodes (most connected - your core abstractions)
1. `useApiClient()` - 245 edges
2. `useThemeColors()` - 212 edges
3. `captureException()` - 120 edges
4. `createScopedRepository()` - 93 edges
5. `createLogger()` - 82 edges
6. `Seed and Sign In Setup` - 82 edges
7. `inngest` - 74 edges
8. `generateUUIDv7()` - 69 edges
9. `useProfile()` - 67 edges
10. `desc` - 58 edges

## Surprising Connections (you probably didn't know these)
- `factRow()` --calls--> `generateUUIDv7()`  [INFERRED]
  tests/integration/memory-facts-delete-cascade.integration.test.ts → packages/database/src/utils/uuid.ts
- `executeChain()` --calls--> `handler`  [INFERRED]
  tests/integration/session-completed-pipeline.integration.test.ts → apps/api/src/inngest/functions/filing-timed-out-observer.integration.test.ts
- `executeChain()` --calls--> `handler`  [INFERRED]
  tests/integration/session-completed-chain.integration.test.ts → apps/api/src/inngest/functions/filing-timed-out-observer.integration.test.ts
- `resetDailyQuotas()` --calls--> `sql`  [INFERRED]
  apps/api/src/services/billing/trial.ts → packages/database/scripts/baseline-migrations.mjs
- `claimSessionForFilingRetry()` --calls--> `sql`  [INFERRED]
  apps/api/src/services/session/session-crud.ts → packages/database/scripts/baseline-migrations.mjs

## Communities (45 total, 0 thin omitted)

### Community 0 - "API Services & Middleware"
Cohesion: 0.0
Nodes (867): learnerRecapRegenerate, regenerateLearnerRecapForSession(), SummaryEventPayload, IdempotencyEnv, idempotencyPreflight(), logger, app, createApp() (+859 more)

### Community 1 - "Mobile Library & Retention"
Cohesion: 0.0
Nodes (683): computeShelfRetention(), LibraryRetentionResponse, SUBJECT_STATUS_ORDER, SubjectRetentionResponse, SubjectRetentionTopic, BAR_COLORS, UsageMeterProps, EnrichedBook (+675 more)

### Community 2 - "API Routes & Handlers"
Cohesion: 0.0
Nodes (554): AuthUser, logger, PUBLIC_PATHS, DatabaseEnv, databaseMiddleware, logger, requireAccount(), requireProfileId() (+546 more)

### Community 3 - "API Route Tests"
Cohesion: 0.0
Nodes (579): clearJWKSCache(), kvReadWarns, kvWriteWarns, mockDatabaseModule, mockDecrementQuota, mockEnsureFreeSubscription, mockGetQuotaPool, mockGetTopUpCreditsRemaining (+571 more)

### Community 4 - "Mobile Session Screens"
Cohesion: 0.0
Nodes (452): PrivacyPolicyScreen(), OfflineBanner(), { getByTestId }, { getByText }, PasswordInput(), PasswordInputProps, { getByTestId }, hint (+444 more)

### Community 5 - "Mobile Onboarding & Components"
Cohesion: 0.01
Nodes (463): CreateSubjectScreen(), LibraryScreen(), CameraScreen(), FlashMode, getHomeworkProblemText(), useAllBooks(), useCreateBookmark(), useDeleteBookmark() (+455 more)

### Community 6 - "Inngest Background Functions"
Cohesion: 0.01
Nodes (356): scheduledDeletion, archiveCleanup, bookPreGeneration, dailyReminderScan, dailyReminderSend, dailySnapshotCron, dailySnapshotRefresh, filingCompletedObserve (+348 more)

### Community 7 - "Notifications & Scheduling"
Cohesion: 0.01
Nodes (250): consentReminder, eventDataSchema, feedbackDeliveryFailed, logger, filingTimedOutObserve, logger, monthlyReportCron, monthlyReportGenerate (+242 more)

### Community 8 - "Integration Tests"
Cohesion: 0.01
Nodes (180): ASSESSMENTS_USER, childProfile, createOwnerProfile(), db, mockChat, priorHistory, TEST_ENV, CONSENT_WEB_USER (+172 more)

### Community 9 - "Mobile Progress Tests"
Cohesion: 0.01
Nodes (199): Index(), baseGlobal, count, focusCallback, fullSubject, mockUseActiveProfileRole, mockUseSubjects, push (+191 more)

### Community 10 - "Progress & Coaching Schemas"
Cohesion: 0.01
Nodes (262): ActiveSessionResponse, activeSessionResponseSchema, baseCoachingCardFields, BookSuggestionCard, bookSuggestionCardSchema, CelebrationLevel, CelebrationLevelQuery, celebrationLevelQuerySchema (+254 more)

### Community 11 - "Database Schema Layer"
Cohesion: 0.01
Nodes (193): analogyDomainEnum, assessments, assessmentStatusEnum, needsDeepeningStatusEnum, needsDeepeningTopics, retentionCards, teachingMethodEnum, teachingPreferences (+185 more)

### Community 12 - "LLM Eval Harness"
Cohesion: 0.02
Nodes (196): BASELINE_PATH, FLOWS, main(), readBaseline(), writeBaseline(), PROFILES, bookSuggestionRegenerationFlow, dictationGenerateFlow (+188 more)

### Community 13 - "Consent & Profile Onboarding"
Cohesion: 0.01
Nodes (183): ConsentScreen(), DeliveryState, Phase, CreateProfileScreen(), formatDateForDisplay(), MAX_DATE, MIN_DATE, ResolveState (+175 more)

### Community 14 - "Book & Topic UI"
Cohesion: 0.01
Nodes (164): BookScreen(), GenerationPhase, GroupedChapter, GroupedTopicChapter, ShimmerSkeleton(), ShimmerSkeletonProps, styles, BookSession (+156 more)

### Community 15 - "Billing & Subscriptions"
Cohesion: 0.02
Nodes (141): addProfileToSubscription(), buildUsageDateLabels(), canAddProfile(), downgradeAllFamilyProfiles(), formatDateLabel(), getFamilyPoolStatus(), getProfileCountForSubscription(), getSubscriptionForProfile() (+133 more)

### Community 16 - "Quiz Generation Engine"
Cohesion: 0.02
Nodes (149): describeAgeBracket(), AssembledRound, assembleRound(), buildVocabularyDiscoveryQuestions(), extractJsonObject(), GenerateParams, generateQuizRound(), injectAtRandomPositions() (+141 more)

### Community 17 - "Subject & Book Schemas"
Cohesion: 0.01
Nodes (163): BookGenerationResult, bookGenerationResultSchema, BookProgressStatus, bookProgressStatusSchema, BookSession, bookSessionSchema, BookSuggestion, BookSuggestionCategory (+155 more)

### Community 18 - "Mobile Shelf & Suggestions"
Cohesion: 0.02
Nodes (131): useBookSuggestions(), useBooks(), useSubjectSessions(), useConfigureLanguageSubject(), classifyApiError(), DEFAULT_MESSAGE(), ForbiddenLike, formatApiError() (+123 more)

### Community 19 - "Retention & Review Calibration"
Cohesion: 0.02
Nodes (140): handleReviewCalibrationGrade(), logger, parseEventData(), reviewCalibrationGrade, syncXpBestEffort(), executeHandler(), buildRetentionSeed(), seedRetentionCard() (+132 more)

### Community 20 - "Memory Facts & Relevance"
Cohesion: 0.02
Nodes (133): coerceConfidence(), appendMemoryFactToSnapshot(), asStringArray(), buildProjectionFromMergedState(), emptyMemorySnapshot(), hasMemoryFactsBackfillMarker(), MemoryFactSnapshotRow, MemoryFactsWriter (+125 more)

### Community 21 - "Snapshot Aggregation & Milestones"
Cohesion: 0.02
Nodes (130): AssessmentRow, cachedMetrics, completedTopicA, completedTopicB, connectionError, createdAt, db, detectedMilestone (+122 more)

### Community 22 - "Account & Settings UI"
Cohesion: 0.02
Nodes (116): DeleteAccountScreen(), Stage, ProfilesScreen(), useFeedbackContext(), buildSingleChildPrompts(), buildTonightPrompts(), ChildActionButton(), ChildCommandCard() (+108 more)

### Community 23 - "Integration Test Helpers"
Cohesion: 0.02
Nodes (84): createOwnerProfile(), createOwnerProfileRecord(), db, grace, now, TEST_ENV, AllMockHandles, createMockHandle() (+76 more)

### Community 24 - "Session & Engagement Schemas"
Cohesion: 0.02
Nodes (120): celebrationReasonSchema, pendingCelebrationSchema, AnalogyFraming, analogyFramingSchema, ContentFlagInput, contentFlagSchema, ENGAGEMENT_SIGNALS, EngagementSignal (+112 more)

### Community 25 - "Learner Profile & Analysis"
Cohesion: 0.03
Nodes (109): cascadeDeleteFactWithAncestry(), LearnerProfileRouteEnv, learnerProfileRoutes, sql, main(), ACCOMMODATION_PREAMBLES, ApplyAnalysisResult, archiveStaleStruggles() (+101 more)

### Community 26 - "Books & Curriculum Routes"
Cohesion: 0.03
Nodes (101): bookParamSchema, BooksRouteEnv, subjectParamSchema, CurriculumRouteEnv, adaptCurriculumFromPerformance(), addCurriculumTopic(), areEquivalentBookTitles(), BookProgress (+93 more)

### Community 27 - "Mentor Memory UI"
Cohesion: 0.03
Nodes (85): MentorMemoryScreen(), MemoryConsentPrompt(), MemoryConsentPromptProps, CollapsibleMemorySection(), getLearningStyleRows(), getSourceBadgeLabel(), getStruggleProgress(), INTEREST_CONTEXT_LABEL_KEYS (+77 more)

### Community 28 - "Assessment Schemas"
Cohesion: 0.02
Nodes (99): AnalogyDomain, AnalogyDomainResponse, analogyDomainResponseSchema, analogyDomainSchema, AnalogyDomainUpdateInput, analogyDomainUpdateSchema, Assessment, AssessmentAnswerInput (+91 more)

### Community 29 - "Test Seed Utilities"
Cohesion: 0.07
Nodes (92): ClerkUser, createBaseAccount(), createBaseProfile(), createClerkTestUser(), createSubjectWithCurriculum(), DebugAccountChain, DebugSubjectsResult, findClerkUserByEmail() (+84 more)

### Community 30 - "Account Deletion & Consent Tests"
Cohesion: 0.03
Nodes (80): executeArchiveCleanup(), mockDeleteProfile, mockGetConsentStatus, mockGetProfileForConsentRevocation, mockInngestSend, MockStep, realInstance, actual (+72 more)

### Community 31 - "Dashboard & Orchestration"
Cohesion: 0.04
Nodes (81): invoke(), DashboardStepResult, logger, runCritical(), runIsolated(), StepOutcome, UNATTENDED_REASONS, getStepMemoryFactsDedupConfig() (+73 more)

### Community 32 - "Session Interaction Schemas"
Cohesion: 0.02
Nodes (91): AccommodationMode, accommodationModeSchema, ChallengeResponse, challengeResponseSchema, ConfidenceLevel, confidenceLevelSchema, DeleteMemoryItemInput, deleteMemoryItemSchema (+83 more)

### Community 33 - "Consent Web Routes"
Cohesion: 0.03
Nodes (67): ConsentWebEnv, consentWebRoutes, calculateAge(), checkConsentRequired(), ConsentAlreadyProcessedError, ConsentNotAuthorizedError, ConsentRecordNotFoundError, ConsentRequestResult (+59 more)

### Community 34 - "CI & Config Files"
Cohesion: 0.03
Nodes (91): Add-First-Child Gate Flow, All-Caught-Up Flow, Book Detail Flow, Bug 233 Chat Classifier Easter Regression, Bug 234 Chat Subject Picker Regression, Bug 238 Tab Bar Route Leak Regression, Bug 239 Parent Add Child Regression, Camera OCR Pipeline Flow (+83 more)

### Community 35 - "Mobile Progress Screens"
Cohesion: 0.03
Nodes (64): ChildQuotaLine(), mockUseOverallProgress, { queryByTestId }, EarlyAdopterCard(), iconWrapper, { Text }, CREATE_SUBJECT_FROM_HOME_HREF, HOME_INTENT_ACTIONS (+56 more)

### Community 36 - "Memory Dedup Pipeline"
Cohesion: 0.04
Nodes (60): DedupDecisionInput, FIXTURES, memoryDedupDecisionsFlow, bId, cId, EMBEDDING_A, EMBEDDING_B, EMBEDDING_FAR (+52 more)

### Community 37 - "Session Completion Tests"
Cohesion: 0.03
Nodes (67): capturedWhereArg, cardOutcome, consoleSpy, consoleWarnSpy, dialect, embeddingOutcome, embeddingOutcome1, embeddingOutcome2 (+59 more)

### Community 38 - "Quiz & Round Schemas"
Cohesion: 0.03
Nodes (68): ActiveRoundDetailResponse, activeRoundDetailResponseSchema, CapitalsLlmOutput, capitalsLlmQuestionSchema, CapitalsQuestion, clientCapitalsQuestionSchema, clientGuessWhoQuestionSchema, ClientQuizQuestion (+60 more)

### Community 39 - "Session CRUD & Lifecycle"
Cohesion: 0.05
Nodes (56): clearSessionStaticContext(), buildTopicIntentMatcherMessages(), claimSessionForFilingRetry(), clearContinuationDepth(), closeSession(), closeStaleSessions(), collectEscalationRungs(), CurriculumSessionNotReadyError (+48 more)

### Community 40 - "Language Setup Tests"
Cohesion: 0.05
Nodes (48): actual, configureLanguageSubjectMock, createApp(), languageSetupRequest(), TestEnv, SubjectRouteEnv, subjectRoutes, getProfileAge() (+40 more)

### Community 41 - "Parent Retention UI"
Cohesion: 0.05
Nodes (43): getParentRetentionInfo(), getReconciliationLine(), getUnderstandingLabel(), ParentMetricTooltip, ParentRetentionInfo, retentionInfo, AccordionTopicList(), AccordionTopicListProps (+35 more)

### Community 42 - "Progress Computation Service"
Cohesion: 0.05
Nodes (44): computeAggregateRetentionStatus(), computeCompletionStatus(), computeRetentionStatus(), getActiveSessionForTopic(), getContinueSuggestion(), getLearningResumeTarget(), getOverallProgress(), getSubjectProgress() (+36 more)

### Community 43 - "Billing & Checkout Schemas"
Cohesion: 0.04
Nodes (49): ByokWaitlistInput, ByokWaitlistResponse, byokWaitlistResponseSchema, byokWaitlistSchema, CancelResponse, cancelResponseSchema, CheckoutRequest, checkoutRequestSchema (+41 more)

### Community 44 - "Uncategorized & Isolates"
Cohesion: 0.0
Nodes (1060): AppNotificationSuppressedEvent, appNotificationSuppressedEventSchema, ClassificationCompletedEvent, classificationCompletedEventSchema, ClassificationFailedEvent, classificationFailedEventSchema, ClassificationSkippedEvent, classificationSkippedEventSchema (+1052 more)

## Knowledge Gaps
- **6401 isolated node(s):** `reactConfigFiltered`, `govPlugin`, `root`, `appPath`, `workspaceDeps` (+6396 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `computeAgeBracket()` connect `Mobile Library & Retention` to `API Services & Middleware`, `Mobile Onboarding & Components`, `Consent & Profile Onboarding`, `Quiz Generation Engine`, `Mentor Memory UI`?**
  _High betweenness centrality (0.255) - this node is a cross-community bridge._
- **Why does `generateQuizRound()` connect `Quiz Generation Engine` to `API Services & Middleware`, `Mobile Library & Retention`, `Books & Curriculum Routes`, `Memory Facts & Relevance`?**
  _High betweenness centrality (0.152) - this node is a cross-community bridge._
- **Why does `useThemeColors()` connect `Mobile Session Screens` to `Mobile Library & Retention`, `Mobile Progress Screens`, `Mobile Onboarding & Components`, `Mobile Progress Tests`, `Parent Retention UI`, `Consent & Profile Onboarding`, `Book & Topic UI`, `Mobile Shelf & Suggestions`, `Account & Settings UI`, `Mentor Memory UI`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Are the 88 inferred relationships involving `createScopedRepository()` (e.g. with `getSubjectRetention()` and `getAllSubjectsRetention()`) actually correct?**
  _`createScopedRepository()` has 88 INFERRED edges - model-reasoned connections that need verification._
- **What connects `reactConfigFiltered`, `govPlugin`, `root` to the rest of the system?**
  _6401 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API Services & Middleware` be split into smaller, more focused modules?**
  _Cohesion score 0.0 - nodes in this community are weakly interconnected._
- **Should `Mobile Library & Retention` be split into smaller, more focused modules?**
  _Cohesion score 0.0 - nodes in this community are weakly interconnected._