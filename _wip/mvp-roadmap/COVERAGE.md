# Coverage matrix — Phase 3 (inventory → MVP-DEFINITION nodes)

**Generated:** 2026-07-09 · **Input:** `inventory.jsonl` (201 WIs) × `MVP-DEFINITION.md` v0.2 (draft, pre-ratification).
Mappings to unratified nodes inherit the draft's rulings; a flipped ruling at ratification flips the affected rows, not the structure.

**Status legend:** **gate** = GATE — launch-gating (IN) · **ratify** = RATIFY — needs Phase-4 ruling · **quarantine** = QUARANTINE — decision-pack fate stands; execute Phase 5 · **out** = OUT — ruled out/killed/deferred · **hygiene** = HYGIENE — not launch-gating · **docs** = DOCS — doc-hygiene pass (Phase 5) · **machinery** = MACHINERY — not product

## Summary

| Status | Count |
|---|---|
| GATE — launch-gating (IN) | 73 |
| RATIFY — needs Phase-4 ruling | 59 |
| QUARANTINE — decision-pack fate stands; execute Phase 5 | 14 |
| OUT — ruled out/killed/deferred | 17 |
| HYGIENE — not launch-gating | 24 |
| DOCS — doc-hygiene pass (Phase 5) | 3 |
| MACHINERY — not product | 11 |
| **Total** | **201** |


## Node 1: Audiences & identity

### RATIFY — needs Phase-4 ruling

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-787 | Ready | P2 | Guardian-write suppression for credentialed (has_own_account) charges — policy-authority gap | guardian-write suppression for credentialed charges — Q10; policy-authority gap |
| WI-1121 | Ready | P2 | S0: wire 5 unproduced ledger kinds + descope reward_receipt | supporter ledger kinds — Q10 (WS-32 on hold) |
| WI-1127 | Ready | P1 | S4: add GET /scopes/coldstart route | coldstart route — Q10 |
| WI-1134 | Ready | P3 | S3: reconcile structural deviations (milestone key namespace + component split) | S3 structural reconcile — Q10 |
| WI-1135 | Ready | P1 | S4: build SupporterColdStart + SupporterSelfLearningDoorway mobile surfaces (T17) | P1 supporter coldstart surfaces — Q10 |
| WI-1136 | Ready | P3 | S4: build supporter-co-learning service + CoLearningDoorway (T19) | co-learning doorway — Q10 |
| WI-1137 | Ready | P2 | S5: build linking-ceremony mobile screens (link/*) | linking-ceremony screens — join-my-family v1 likely needs a subset; Q10 |
| WI-1259 | Captured | P3 | Mirror exact-birth-date age gating into 3 mobile call sites | exact-birth-date gating mirror on mobile — safety-adjacent; propose IN |
| WI-1580 | Backlog | P2 | Cross-account supporter invite/identify flow into /link/new (new person not on account) | cross-account supporter invite — Q10 decides launch need |
| WI-1620 | Ready | P1 | Unify learner and supporter core learning surfaces around shared components | P1 unify learner/supporter surfaces — Q10 decides |


## Node 2: Onboarding & consent

### GATE — launch-gating (IN)

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-747 | Captured | P1 | Configure real production RESEND_WEBHOOK_SECRET before launch (replace placeholder) | Resend prod secret — part of WI-1340 email chain |
| WI-1340 | Executing | P1 | Transactional email production configuration (incl. P0 consent-withdrawal path) | transactional email prod config incl. P0 consent-withdrawal (finalization queue) |
| WI-1496 | Captured | P2 | Tutor-prose conversation-language settings picker (parent-created child stranded on English tutor) | tutor-language picker — IN, ratified-13 (def §2) |

### RATIFY — needs Phase-4 ruling

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1458 | Ready | P3 | Re-spec the trial-onboarding Phase 4 parent-clarity pass against the V2 shell | trial-onboarding parent-clarity re-spec — premise changed by preview-lesson OUT |

### OUT — ruled out/killed/deferred

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1457 | Ready | P2 | Design + build the constrained preview lesson for the 'Me' trial intent path (needs product decision) | preview lesson — OUT (Item 1); still Ready, execute fate Phase 5 |


## Node 3: Learner loop

### GATE — launch-gating (IN)

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1438 | Ready | P1 | Run T10 challenge-grader model bake-off + file vetting/ entry (reconcile GRADER_MODEL with register/ADR) | challenge-grader bake-off — ruled gate for the flip (def §3) |
| WI-1445 | Ready | P3 | Correctness-chain #7: write retention_cards.nextReviewAt on Challenge-Round mastery verification | narrow nextReviewAt fix — eligible per ratified-13 (def §3) |
| WI-1446 | Ready | P2 | Promote needs_deepening_topics rows from pending_review to active (stranded promotion) | needs_deepening promotion — ratified-13 |
| WI-1461 | Refining | P2 | Consolidate dual push-cron review reminders (RR-3 double-push risk) | dual push-cron consolidation — ratified-13 |
| WI-1464 | Ready | P2 | Calibrate the Challenge Round all-or-nothing mastery bar via the simulator before prod flip (RR-6) | Challenge mastery-bar calibration — pairs with bake-off gate |
| WI-1466 | Ready | P2 | Write Challenge Round cooldown on completion, not only decline (RR-8) | cooldown on completion — ratified-13 |
| WI-1469 | Ready | P2 | Decide and implement the SM-2-verified vs Challenge-verified mastery relationship (RR-11) | SM-2 vs Challenge relationship — Item-5 ruling execution; reconcile ADR-0031/32 |

### RATIFY — needs Phase-4 ruling

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1452 | Refining | P3 | Build the evidence-citation loop: evidence_links/LearnerSource substrate + envelope citations (felt-knowing F5-F7) | evidence-citation loop — Q1-adjacent (overlaps WI-1704) |
| WI-1462 | Ready | P2 | Replace library-redirect dead-end with a bounded re-teach off-ramp on 3rd failed recall (RR-4) | re-teach off-ramp — Item-5 recovery-ladder execution set |
| WI-1463 | Ready | P2 | Default the relearn topic list to system-ranked order by SM-2 urgency (RR-5) | system-ranked relearn order — Item-5 set |
| WI-1465 | Ready | P2 | Low-stakes per-concept re-prove path for recovering strugglers (RR-7 Challenge Round lockout) | per-concept re-prove path — Item-5 ladder |
| WI-1657 | Executing | P1 | Define and ship the full verified-learning loop | verified-learning loop umbrella — Q1 (THE scope question) |
| WI-1665 | Captured | P2 | Parent proof: recap consumes the verified-learning artifact (loop slice S7) | recap consumes verified artifact — Q1 (slice S7) |
| WI-1666 | Captured | P2 | End-to-end verified-learning loop test/eval pack (loop slice S8) | loop e2e test/eval pack — Q1 (slice S8) |
| WI-1667 | Captured | P2 | Delete superseded partial feature leftovers with better replacements | delete superseded partials — Q1 |
| WI-1703 | Ready | P2 | Define verified-artifact provenance contract for the learning loop | verified-artifact provenance contract — Q1 |
| WI-1704 | Ready | P2 | Build evidence-links substrate for verified learning artifacts | evidence-links substrate — Q1 |
| WI-1705 | Ready | P2 | Choose production-visible parent proof surface before rendering verified artifacts | parent proof surface choice — Q1 |

### QUARANTINE — decision-pack fate stands; execute Phase 5

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1437 | Ready | P2 | Surface milestone_reached moments as cards in the Mentor /now stack | milestone cards in /now stack |
| WI-1451 | Ready | P3 | Replace the impossible freeform 'keep this' note CTA with a working bookmark affordance (felt-knowing F3/F4) | bookmark affordance (felt-knowing) |
| WI-1454 | Ready | P3 | Concept-targeted review: focus due-topic recall on open weak concepts (concept-capture item 5) | concept-targeted review |
| WI-1455 | Ready | P3 | Note-correctness nudge + sooner review on non-solid concepts (concept-capture item 6 / note-correctness plan) | note-correctness family — umbrella killed; propose OUT |
| WI-1467 | Captured | P3 | Deepen recall-grading context beyond topic title + single answer (RR-9 remainder) | RR-9 remainder |
| WI-1468 | Captured | P3 | Render the merged relearn queue reason tag on mobile (RR-10 remainder, deferred until Challenge Round flip) | RR-10 remainder, post-Challenge-flip |
| WI-1470 | Captured | P3 | Build the topicOrder path-preview component (RR-13 remainder) | RR-13 remainder |
| WI-1471 | Captured | P3 | RR-14 cleanup: single cooldown constant + route startRelearn through startSession | RR-14 cleanup |
| WI-1472 | Captured | P2 | Write the deep per-subject review diagnostic / cross-subject Checkup spec (RR-15, review-backbone fork) | RR-15 diagnostic spec |
| WI-1473 | Captured | P2 | Spec + execute retrieval_events follow-ons: activate 'relearn' nextAction and build the eval-corpus reader | retrieval_events follow-ons |
| WI-1480 | Captured | P3 | Continuity T1: 'best next step' card re-specced as a V2 NowCard | best-next-step NowCard re-spec |
| WI-1485 | Captured | P3 | Continuity T6: verify no deficit-language retention copy remains on learner surfaces | deficit-language copy sweep |

### OUT — ruled out/killed/deferred

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1443 | Ready | P3 | Correctness-chain #3: add per-turn answer-correctness signal to the learning envelope | correctness-chain #3 — fast-follow (Item 2) |
| WI-1444 | Ready | P3 | Correctness-chain #4: wire (or delete) the stranded three-strike adaptive-teaching system | correctness-chain #4 — fast-follow (Item 2) |
| WI-1453 | Ready | P3 | Build the v1.5 returning-session rotating greeting pool (>=7 recency/win-aware variants) | rotating greeting pool — killed (def §13) |
| WI-1483 | Captured | P3 | Continuity T4: recap 'Coming up' next-topic fields | 'Coming up' recap fields — KILLED (Item 3) |
| WI-1491 | Captured | P3 | Execute the note-correctness plan (T1-T13 umbrella): grade learner notes, marks UI, save-as-note path | note-correctness umbrella — killed (def §3) |


## Node 4: Guardian / family loop

### RATIFY — needs Phase-4 ruling

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1185 | Ready | P3 | Allow parents to create and manage child-scoped subjects from child context | parent-managed child subjects — WS-32 on hold |
| WI-1658 | Ready | P1 | Build parent proof receipts from verified learner explanations | parent proof receipts — Q1 slice ruling |


## Node 5: Library & curriculum

### RATIFY — needs Phase-4 ruling

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1662 | Ready | P2 | Rule mastery-gated progression against the no-lock learning doctrine | mastery-gated progression vs never-lock — Q4 |


## Node 6: Languages & voice

### GATE — launch-gating (IN)

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1183 | Executing | P2 | Add i18n value-equality guard and re-translate echoed-English strings per locale | WS-34 closeout — i18n echo guard, PR #2009 |
| WI-1447 | Ready | P2 | Fix voice STT/TTS locale fallback for non-language subjects; add cs/ja/pl/en locale mappings | STT/TTS locale fallback fix — ratified-13 |
| WI-1547 | Backlog | P2 | Upgrade Four Strands graded input generation beyond seed passages | graded input upgrade — launch-IN narrow course slice |
| WI-1548 | Backlog | P2 | Add repeat-after-me and shadowing activities end-to-end | repeat-after-me/shadowing — launch-IN narrow speaking slice |
| WI-1549 | Backlog | P2 | Persist language speaking attempts with transcript comparison scores | speaking attempts persistence — launch-IN paired with WI-1548 |
| WI-1552 | Backlog | P2 | Build adaptive next-activity selector for Four Strands sessions | adaptive next-activity selector — launch-IN narrow continue path |
| WI-1553 | Backlog | P2 | Add language session-end learning summary | session-end summary — launch-IN narrow learning receipt |
| WI-1755 | Captured | P1 | Harden Four Strands language-mode routing and eval guards for launch | language-mode safety/eval guard — closes G10 |
| WI-1756 | Captured | P1 | Render Four Strands meaning-output task with correction and retry loop | structured meaning-output card/loop — closes G11 |

### FILL — approved MVP-window work, not launch-gating

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1394 | Ready | P3 | Re-home CEFR vocabulary browser into the V2 shell (legacy Progress-only today) | CEFR browser re-home — FILL; not launch-gating if receipt + continue path exist |
| WI-1492 | Backlog | P3 | Wire SpeakingPracticeCard into the live four-strands session flow | SpeakingPracticeCard wiring — FILL unless fastest path for WI-1548 |
| WI-1554 | Backlog | P2 | Show Four Strands balance and skill profile in language progress UX | strands balance / skill-profile UX — FILL until competency model exists |

### RATIFY — needs Phase-4 ruling

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-904 | Backlog | P2 | Dictation playback: rework pacing around clear speech and phrase/sentence pauses | dictation pacing — propose post-MVP (Q6 baseline suffices) |

### OUT — ruled post-launch / not MVP

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1550 | Backlog | P2 | Add language-native competency profile model | full competency profile model — post-launch; tiny receipt fields only if needed |
| WI-1551 | Backlog | P2 | Evaluate language sessions into competency updates | full session→competency evaluator — post-launch; receipt summary only if needed |

### DOCS — close/reshape after ruling

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1493 | Ready | P3 | Convert the 4-strands doc into a real plan and enumerate remaining Minimum-Lovable gaps | 4-strands doc→plan conversion — reshape/close after ruling is reflected |

### QUARANTINE — decision-pack fate stands; execute Phase 5

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1486 | Captured | P3 | Continuity T7: defer mic permission request to an intentional voice action | defer mic permission to intentional action |

### OUT — ruled out/killed/deferred

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1459 | Ready | P3 | Re-scope and refresh the Epic 17 voice-first spec before any execution (umbrella) | voice-first re-scope umbrella — post-MVP (def §6) |


## Node 7: Notifications & reachability

### GATE — launch-gating (IN)

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1441 | Refining | P2 | Set pushEnabled=true on OS permission grant; add/decide daily-review toggle home for V2 | push permission wiring — ratified-13 |

### OUT — ruled out/killed/deferred

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1488 | Captured | P3 | Notification reachability T4-T6: child-to-parent reciprocal nudges (needs re-triage + spec) | reachability T4–T6 — OUT (def §7) |


## Node 8: Billing & monetization

### GATE — launch-gating (IN)

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-748 | Captured | P1 | Configure real production REVENUECAT_WEBHOOK_SECRET before launch (replace placeholder) | RevenueCat webhook prod secret — OPQ-6 wave-B territory |
| WI-1117 | Ready | P1 | Finish RevenueCat store wiring for billing go-live | RevenueCat wiring — probable dup of WI-1328; reconcile |
| WI-1328 | Ready | P1 | RevenueCat production monetization setup (MVP) | RevenueCat production setup |
| WI-1335 | Ready | P1 | Store publishing: App Store + Play Console records, listings, privacy labels, ratings | store listings/records |
| WI-1337 | Ready | P1 | Push notification production credentials (APNs/FCM) | APNs/FCM prod credentials |
| WI-1341 | Ready | P2 | Store submission pipeline (eas submit + Config T production build) | store submission pipeline |
| WI-1399 | Ready | P2 | Billing silent-failure escalation gaps (alias-merge onFailure + child-paywall observability) | billing silent-fail escalation — ratified-13 (def §8) |
| WI-1474 | Captured | P2 | Billing T1: payment-failed handler must notify the owner (currently log-only) | payment-failed notify — IN before paid launch (def §8) |
| WI-1475 | Captured | P2 | Billing T2: past-due banner on the V2 home surface (needs NowCard spec) | past-due banner — IN before paid launch (def §8) |

### RATIFY — needs Phase-4 ruling

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1660 | Ready | P2 | Add cancellation-save flow showing Learning Book and mastery value | cancellation-save flow — Q3 |
| WI-1661 | Ready | P2 | Push annual plan at trial end | annual push at trial end — Q3 |

### QUARANTINE — decision-pack fate stands; execute Phase 5

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1479 | Captured | P3 | Billing T6: structured observability for billing-recovery paths | billing-recovery observability — fast-follow |

### OUT — ruled out/killed/deferred

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1476 | Captured | P3 | Billing T3: honest child-cap parent notification fan-out (push gating, dedup window, copy) | child-cap fan-out — killed family (def §4) |
| WI-1477 | Captured | P3 | Billing T0+T4: child-allocated top-up capacity (blocked on learn-1 proxy-guard resolution) | child top-ups — killed (def §4/§13) |
| WI-1478 | Captured | P3 | Billing T5: parent action from the child-cap banner (allocate vs purchase), V2 re-spec | cap-banner parent action — killed (def §4/§13) |


## Node 9: Safety

### GATE — launch-gating (IN)

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1358 | Executing | P2 | Server-side action on crisis_redirect (deferred §6(b) guardian-notification design) | crisis-disclosure server action — implemented, finalization queue |
| WI-1365 | Executing | P2 | Implement suitability-judge enforcing output gate for minors (Option A: post-stream block-and-replace) | judge enforcing output gate for minors |
| WI-1376 | Executing | P1 | Crisis-rule signal-binding: force crisis_redirect when the model's prose recognizes a safeguarding risk; stop neglect disclosures being dropped mid-homework | crisis signal-binding fix |
| WI-1377 | Executing | P2 | Widen safeguarding-recall probe set to a stable baseline + re-measure post signal-binding fix | safeguarding-recall probe baseline |
| WI-1686 | Captured | P1 | Enable suitability-judge flags in prd: JUDGE_FRAMEWORK_ENABLED + JUDGE_ENFORCEMENT_ENABLED (A-02, ruled A — event 36) | enable suitability-judge flags — Phase-0 #2 |
| WI-1691 | Captured | P1 | A-03 launch slice (b): blocked-safety events routed to daily operator digest (ruled B — event 33) | daily blocked-safety digest — net-new confirmed |

### RATIFY — needs Phase-4 ruling

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1690 | Captured | P1 | A-03 launch slice (a): crisis-disclosure detection with in-app resources + guardian notification (ruled B — event 33) | crisis slice (a) — Q8 contradiction with se-032; reconcile BEFORE build |

### OUT — ruled out/killed/deferred

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1692 | Captured | P2 | A-03 fast-follow: full guardian-notification UX + human-review queue (identity-foundation epic) | guardian-notification UX + review queue — fast-follow |

### HYGIENE — not launch-gating

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1316 | Executing | P2 | Eval harness: HW02.solved-from-memory check false-fires on correct clarifying response (probes.ts:454) | eval-harness false-fire — pairs with 1377 re-measure |


## Node 10: Compliance & legal

### GATE — launch-gating (IN)

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1105 | Ready | P1 | Appoint outsourced Data Protection Officer (DPO) | DPO appointment — THE launch gate C-5 |
| WI-1106 | Ready | P1 | Produce pre-launch DPIA (data protection impact assessment) | DPIA signed — THE launch gate C-5 |
| WI-1107 | Ready | P1 | Create Record of Processing Activities (ROPA) | ROPA |
| WI-1108 | Ready | P1 | Write data-breach response plan (72h to Datatilsynet) | breach response plan (72h) |
| WI-1109 | Ready | P1 | Finalize and publish privacy policy + child-readable summary | privacy policy publish + child summary (incl. false-claims fix) |
| WI-1111 | Ready | P1 | Rule and document the Article 9 health / learning-disability decision | Art 9 health/learning-disability ruling |
| WI-1114 | Ready | P1 | Complete store age-rating and kids/privacy declarations (both stores) | store age-rating + kids/privacy declarations |
| WI-1115 | Ready | P2 | Configure store country availability and hard-blocks | store country availability + hard-blocks |
| WI-1192 | Ready | P1 | Sign Art 28 processor DPAs (business tier, no-training) and complete per-vendor transfer TIAs | Art 28 processor DPAs + TIAs |
| WI-1193 | Backlog | P1 | Record accountable lawful-basis + terms-accepted fact (incl. adults); split consent purposes | lawful-basis + terms-accepted record — register-derived floor |
| WI-1194 | Backlog | P1 | Close retention gaps: verify transcript purge, age-out verbatim quotes, set retention periods, add dormancy sweep | retention gaps — counsel-owned values, engineering IN |
| WI-1196 | Backlog | P1 | Activate DB-layer RLS for defence-in-depth, or formally accept app-layer-only isolation with tracked remediation | RLS accept-or-activate — ruled accept; remaining work = formal acceptance doc |
| WI-1442 | Ready | P1 | Persist consent audit trail before profile hard-delete (GDPR proof-of-consent) | consent audit trail before hard-delete (def §10) |
| WI-1507 | Executing | P1 | Complete launch compliance closure check against actual data flows | launch compliance closure check (parked; re-run at end) |
| WI-1558 | Backlog | P1 | DPIA A13 name-minimization claim contradicts verbatim learner name sent to LLM | DPIA name-minimization — counsel Q4 decides arm |
| WI-1559 | Executing | P1 | Controller legal entity mismatch across privacy policy vs DPIA/ROPA | **RESOLVED ruling:** ZWIZZLY AS, org.nr 811696072, Fiskekroken 3B, 0139 Oslo, Norway; Norwegian Datatilsynet; active-document reconciliation complete |
| WI-1561 | Captured | P2 | Store data-safety worksheet stale vs current code (age 11 vs 13; legacy tables) | store data-safety worksheet refresh |
| WI-1577 | Captured | P1 | Launch compliance closure — FINAL GATE (pre-store-submission re-run) | FINAL GATE pre-store-submission re-run |
| WI-1659 | Executing | P1 | Produce EU AI Act high-risk education compliance plan | AI Act compliance plan — IN (def §10); classification counsel-owned |

### RATIFY — needs Phase-4 ruling

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1110 | Ready | P2 | Appoint UK GDPR representative (if serving UK) | UK rep — only if serving UK; store-country config (WI-1115) decides |
| WI-1116 | Ready | P2 | Decide and integrate US state age-signal (TX/UT/LA App Store Accountability Acts) | US state age-signal acts — launch is EU; propose OUT/fast-follow |
| WI-1162 | Ready | P2 | Decide whether v2 payerPersonId/storeProductId/storePlatform belong in the GDPR account export | v2 billing fields in GDPR export — small decision |
| WI-1195 | Backlog | P1 | Add in-chat Art 50 AI disclosure and extend no-clinical-copy guard to LLM-written fields | Art 50 AI disclosure — Q5 AI-Act cluster sizing |
| WI-1663 | Executing | P2 | Create AI Act technical file and QMS skeleton for MentoMate AI system | AI Act technical file/QMS — Q5: how much gates launch |
| WI-1664 | Executing | P2 | Add school and institutional deployment AI Act tripwire | institutional-deployment tripwire — Q5 |

### OUT — ruled out/killed/deferred

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1002 | Ready | P3 | New person-keyed supporter/visibility tables ship without RLS | RLS on new tables — RLS ruled OUT; confirm app-layer scoping covers them |


## Node 11: Trust package

### GATE — launch-gating (IN)

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1497 | Captured | P2 | Add first-week mentor plan after the first real session | first-week mentor plan (Item 6) |
| WI-1498 | Captured | P2 | Add lightweight mentor-memory confirmation after session 1 | mentor-memory checkpoint (Item 6) |
| WI-1499 | Captured | P2 | Add tutor-reply feedback controls for bad learning turns | flag-a-reply v1 (Item 6) |
| WI-1501 | Backlog | P2 | Add in-app support/recovery path with context attachment | in-app support path (Item 6) |
| WI-1502 | Captured | P2 | Add visible review-promise Mentor card | visible review promise (Item 6) |


## Node 12: Platform & quality floor

### GATE — launch-gating (IN)

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-617 | Ready | P2 | Re-enable main branch protection: required code-owner review (re-arm WI-538) before MentoMate production launch | re-arm branch protection before launch |
| WI-1098 | Executing | P3 | Validate API responses at the mobile trust boundary — remaining hooks (parseJson sweep) | WS-34 closeout — PR #2011 landing |
| WI-1167 | Ready | P2 | Staging 'Deploy API (staging)' migration step fails — relation public.profiles does not exist | staging migration step broken — blocks staging validation for the 1685 cutover |
| WI-1307 | Executing | P1 | M4/C7: Build + E2E-prove the V2=off/V1=on fallback channel (gates M5 + M6) | V2=off/V1=on fallback proof — gates M5/M6 (Awaiting Info on OPQ-11/13) |
| WI-1310 | Ready | P1 | Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY_PRODUCTION to Doppler prd + EAS production env (blocks M4 rollback build) | prod Clerk key in Doppler/EAS — blocks M4 rollback build (WI-1307) |
| WI-1336 | Executing | P1 | Production observability: re-enable Sentry source-map upload + alerting baseline | Sentry re-enable + alerting (in finalization queue) |
| WI-1338 | Ready | P1 | Inngest production environment sync | Inngest production sync |
| WI-1400 | Ready | P2 | V2 shell has zero native Maestro e2e coverage (mentor/subjects/journal tabs) | Maestro smoke baseline for V2 shell — ratified-13 |
| WI-1406 | Ready | P2 | AUTH e2e + resilience-branch coverage gaps (MFA stubs, phone-code, session-revoked, sessionStorage replay, gate timeouts) | auth-resilience e2e — IN subset per ratified-13 |
| WI-1500 | Ready | P1 | Build launch health dashboard for silent-failure signals | launch-health alerts on 6 signals |
| WI-1503 | Ready | P1 | Dogfood exact production-profile launch build end to end | dogfood prod build |
| WI-1506 | Ready | P1 | Run small closed beta with 5-10 real families before public launch | closed beta — gates public launch |
| WI-1570 | Captured | P2 | Instrument mobile activation events — client dispatch to POST /v1/activation-events for the 6 client-observed types | client half of activation wiring — reconcile with WI-1689 (probable overlap) |
| WI-1588 | Captured | P1 | LAUNCH-BLOCKING: verify activation instrumentation (WI-1504) + LLM kill-switch (WI-1505) end-to-end vs a real migrated Neon DB + KV in a staging/prod-profile build | LAUNCH-BLOCKING e2e verify of activation + kill-switch |
| WI-1640 | Captured | P1 | White-screen crash on /ready when mentor-birth animation completes (first-subject onboarding) | P1 white-screen crash on /ready — launch bug |
| WI-1641 | Captured | P1 | Production worker secrets drift: Doppler-only additions never reach the worker, took prod API hard-down | P1 prod worker secrets drift — took prod down |
| WI-1642 | Captured | P2 | All SENTRY_AUTH_TOKEN values in Doppler (dev/stg/prd) are invalid — crash triage is blind | invalid Sentry tokens — pairs with WI-1336 |
| WI-1685 | Captured | P1 | V2 routing cutover: staging validation then prod flag flip (A-01, ruled A — substrate event 34) | V2 routing cutover — Phase-0 #1 |
| WI-1687 | Captured | P1 | A-10 cache-friendly restructure of exchange-prompts.ts: stable prefix first, dedupe repeated blocks (ruled A — event 35) | cache-friendly prompt restructure — Phase-0 #4 |
| WI-1688 | Captured | P1 | A-09 prompt-cache markers on V2 providers (Anthropic cache_control; verify Cerebras; OpenAI automatic) (ruled A — event 35) | prompt-cache markers — Phase-0 #4 (absorbs WI-1448) |
| WI-1689 | Captured | P1 | Wire mobile activation events to POST /v1/activation-events (A-22, ruled A — event 37) | activation events wiring — Phase-0 #5 |

### RATIFY — needs Phase-4 ruling

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-779 | Ready | P2 | WP-FLAG — Remove IDENTITY_V2_ENABLED + legacy schema/twins | identity flag/legacy-twin removal — propose post-launch; sequence with 1379 |
| WI-1288 | Ready | P2 | Repoint concepts/concept_mastery schema-code FK profiles.id -> person.id + idempotent migration 0129 (split from WI-781) | concepts FK repoint + migration 0129 — schema correctness; propose IN |
| WI-1308 | Refining | P2 | M5/C8: Retire V0 + flags-off legacy shell before ship (gated on proven fallback C7) | M5 retire V0 pre-ship vs S6-deferred ruling — reconcile before acting |
| WI-1334 | Ready | P2 | Rule dev/preview V0+V1+V2 flag combos: fix or sanction (banned per convergence spine) | dev/preview flag-combo ruling |
| WI-1371 | Ready | P2 | Add integration coverage for trial-v2.ts (transitionToExtendedTrialV2 et al.) — zero integration coverage after legacy trial dead-fn block retirement | trial-v2 integration coverage — quality floor; propose IN |
| WI-1379 | Ready | P3 | Un-gate or re-home the account-deletion v2 cascade block before the legacy identity flag collapses (currently only runs flag-OFF) | account-deletion v2 cascade un-gate — must precede flag collapse (779) |
| WI-1395 | Ready | P3 | Re-home full milestone history list into the V2 shell (legacy Progress-only today) | milestone history re-home — V2 shell parity |
| WI-1396 | Ready | P3 | Re-home live global engagement glance (streak/sessions/minutes/recall-queue) into the V2 shell | engagement glance re-home — V2 shell parity |
| WI-1416 | Ready | P2 | V2 open rulings — 4 product/architecture decisions surfaced by the test-coverage audit (provenance, denial UX, parking-return, S3 rare rows) | 4 open rulings — Item-4 D1–D4 ballot already ruled most; close against ballot |
| WI-1456 | Ready | P3 | Re-home the concept-mastery star to a V2 note surface (V1 book reader is the only host today) | concept-star re-home — ratified-13 disposition to confirm |
| WI-1651 | Captured | P2 | e2e-ci Maestro job always reports green: MAESTRO_EXIT lost across line-split shells | Maestro CI always-green — undermines the WI-1400 e2e gate; propose IN |
| WI-1652 | Captured | P2 | CI maestro test selects only 2 root-level flows; all subdirectory smoke/pr-blocking flows never run | Maestro CI runs only 2 flows — same family as 1651; propose IN |
| WI-1655 | Captured | P2 | WS-44 device-evidence batch: run the verify-at-e2e-run Maestro flows on an emulator | WS-44 device-evidence batch — propose IN with beta |

### OUT — ruled out/killed/deferred

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1292 | Backlog | P1 | Apply 0130 legacy-table DROP (HELD — irreversible, spine-gated) | 0130 legacy DROP — HELD, irreversible, post-launch |
| WI-1436 | Refining | P3 | Delete legacy Gemini-default LLM routing path after v2 soak (post-launch) | legacy Gemini deletion — post-soak (def §12) |
| WI-1448 | Executing | P3 | Add Anthropic prompt caching to the static system-prompt prefix | Closed/Superseded → WI-1688 (inventory snapshot pre-dates close) |
| WI-1494 | Captured | P3 | Activate RLS enforcement (Phase 3/4 umbrella): app_user role, dual connections, middleware scoping | RLS umbrella — ruled superseded; still Captured, close Phase 5 |

### HYGIENE — not launch-gating

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-482 | Executing | P2 | Split monolithic session/curriculum service modules | service split — parked (ruled 2026-07-09) |
| WI-542 | Ready | P3 | Watch: retire nx-affected-on-Windows workaround when @nx/expo upstream fixes the project-graph stack-overflow | watch item — upstream nx fix |
| WI-649 | Ready | P3 | Dev Neon journal drift blocks drizzle-kit migrate (22/109 rows recorded; push-managed since April) | dev Neon journal drift |
| WI-1141 | Refining | P3 | Dev environment: flip IDENTITY_V2_ENABLED=true for dev<->prod parity | dev flag parity |
| WI-1164 | Captured | P2 | change-class router must run @eduagent/database:test (drizzle-meta-coverage) when apps/api/drizzle/** changes | change-class router gap |
| WI-1187 | Ready | P3 | Spike: feasibility of extracting a reusable SaaS mobile template repo from Mentomate | template-repo spike — post-launch |
| WI-1201 | Captured | P2 | Integration test: visibility shared-record endpoint profileId scoping (follow-up to WI-1168) | scoping integration test follow-up |
| WI-1244 | Refining | P3 | Decompose mobile god-screens: session/index.tsx (~1637 lines) + shelf book screen (~2189 lines) | god-screen decomposition |
| WI-1250 | Captured | P3 | Drop orphaned legacy subscriptions table on staging (staging slice of WI-779 strip step 4) | staging legacy-table drop slice |
| WI-1252 | Ready | P3 | Migrate revenuecat-webhook-handler-v2.test.ts internal mocks to seeded db.query seams | GC6 mock migration |
| WI-1268 | Captured | P2 | Repair this repo scripts/setup-worktree.sh core.bare guard (local slice of shared-.git/config hardening) | setup-worktree guard |
| WI-1311 | Captured | P2 | env:sync silently strips EXPO_PUBLIC_ENABLE_MODE_NAV_V2 from eas.json (vars absent in Doppler get nulled) | env:sync strips nav flag — verify before V2 publish builds (touches WI-1307) |
| WI-1324 | Backlog | P1 | Test git() helper inherits husky GIT_DIR → destroys real repo on >100-file push | P1 destructive test bug (dev-only blast radius) |
| WI-1345 | Backlog | P1 | check-merge-invariant.test.ts commits onto ambient worktree branch (fleet-wide worktree clobber) | P1 destructive test bug (dev-only blast radius) |
| WI-1355 | Captured | P3 | check-gc1-pattern-a.ts misses gc1-allow comments trailing the module specifier (false GC1 violations) | GC1 checker false positives |
| WI-1363 | Ready | P3 | Rename/relocate stale legacy-named integration suites post-cutover (names/paths only, no assertion moves) | test rename/relocate |
| WI-1378 | Refining | P3 | profile-isolation.integration.test.ts fails on real migrated DB — seeds legacy profiles but quiz_rounds.profile_id FKs person.id; suite not wired into any CI target | stale isolation suite not in CI |
| WI-1513 | Captured | P2 | Wire IDENTITY_V2_REPOINTED in CI so child-profile-v2 full-write integration tests run (currently skip) | CI env flag for v2 write tests |
| WI-1566 | Captured | P3 | Scope LLM kill-switch KV read to LLM routes (avoid per-request read on all routes) | kill-switch KV read scoping — perf polish |
| WI-1574 | Captured | P3 | Consolidate activation-event recording into services/ — extract duplicated route-level call sites + occurrence-bucketing policy | activation recording consolidation — fast-follow |
| WI-1575 | Captured | P2 | Fold standalone ci.yml whole-tree ratchets into check-change-class.sh (run locally by change class) | ratchet consolidation |
| WI-1576 | Captured | P3 | Retire the 4 no-op legacy-identity-anchors.ts test shims + sweep their ~40 integration call sites | retire test shims |
| WI-1643 | Ready | P3 | sync-secrets.js placeholder check false-positives on a comment, silently no-ops local prd sync | sync-secrets placeholder false-positive |


## Node —: Non-product (machinery / docs-hygiene)

### DOCS — doc-hygiene pass (Phase 5)

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-1397 | Ready | P3 | Update v2-dossier docs 06+07: stale Journal-practice/appeal/person-scope claims and moved code anchors | v2 dossier staleness |
| WI-1439 | Ready | P3 | Fix stale status headers across shipped specs/plans (concept-capture, journal-redesign, forever-notebook, trial-onboarding, note-correctness) | stale spec status headers |
| WI-1460 | Ready | P2 | epics.md Annex A.5 superseded-annotation pass (FR6, Epic 4, Epic 7, Epic 12, WEB-A) | epics.md annotation pass |

### MACHINERY — not product

| WI | Stage | Pri | Name | Note |
|---|---|---|---|---|
| WI-752 | Executing | P2 | ADR governance correction & re-vetting | ADR governance |
| WI-757 | Captured | P2 | Amend MMT-ADR-0000 — crystal-clear reconstruct-vs-launder + L3-in-passing-only + operator sign-off + no feature-PR ADRs | ADR governance |
| WI-895 | Captured | — | WP: Break the spec→ADR laundering circle — shift-left ADR-provenance enforcement | ADR-provenance WP |
| WI-896 | Captured | — | A — Amend MMT-ADR-0000 §II.6: shift-left ADR-provenance (ratified why; needs human-Architecture sign-off; gates B–E) | ADR-provenance A |
| WI-897 | Captured | — | B — Layer 1: AGENTS.md doctrine rule — specs implement decisions, run §II.1 before writing a spec, ADR-first/lockstep | ADR-provenance B |
| WI-898 | Captured | — | C — Layer 2: override superpowers brainstorming to inject the §II.1 gate + hierarchy (decisions spawn ADRs, specs point at them) | ADR-provenance C |
| WI-899 | Captured | — | D — Layer 3: /refine ADR-gate — run the §II.1 five-trigger test at refine; flag ADR-class; require linked ADR before Ready (shared ZDX toolchain, coordinate w/ Nexus) | ADR-provenance D |
| WI-900 | Captured | — | E — Layer 4: move check-decision-adr-link from CI to pre-commit (local immediate enforcement; CI stays backstop) | ADR-provenance E |
| WI-1299 | Captured | P2 | Repo notion skill points agents at the wrong Work Items DB (fleet-wide ZAF, not the Cosmo/ZDX pipeline) | verify misfile, likely repoint to Nexus |
| WI-1309 | Ready | P2 | Drain the Stream-2 backlog (umbrella-program docs) into Cosmo WIs under WS-36 | Stream-2 drain umbrella |
| WI-1650 | Ready | P3 | claude-review emits factually-false blocking findings (hallucinated rename; contradicts own prior-round premise) | claude-review defect — tooling, not product |
