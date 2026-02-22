---
title: 'TEA Test Design -> BMAD Handoff Document'
version: '1.0'
workflowType: 'testarch-test-design-handoff'
inputDocuments:
  - '_bmad-output/test-artifacts/test-design-architecture.md'
  - '_bmad-output/test-artifacts/test-design-qa.md'
sourceWorkflow: 'testarch-test-design'
generatedBy: 'TEA Master Test Architect (Murat)'
generatedAt: '2026-02-22'
projectName: 'EduAgent'
---

# TEA -> BMAD Integration Handoff

## Purpose

This document bridges TEA's test design outputs with BMAD's epic/story decomposition workflow. It provides structured integration guidance so that quality requirements, risk assessments, and test strategies flow into implementation planning.

## TEA Artifacts Inventory

| Artifact | Path | BMAD Integration Point |
|----------|------|----------------------|
| Architecture Doc | `_bmad-output/test-artifacts/test-design-architecture.md` | Epic quality requirements, testability blockers |
| QA Doc | `_bmad-output/test-artifacts/test-design-qa.md` | Story acceptance criteria, test scenarios |
| Risk Assessment | (embedded in architecture doc) | Epic risk classification, story priority |
| Coverage Strategy | (embedded in QA doc) | Story test requirements, P0-P3 classification |

## Epic-Level Integration Guidance

### Risk References

The following P0/P1 risks should appear as epic-level quality gates:

| Epic | Risk IDs | Quality Gate |
|------|----------|-------------|
| **Epic 0** (User Management) | R-001 (SEC, score 9) | All consent flow paths validated; deletion chain complete |
| **Epic 1** (Learning Path) | R-003 (BUS, score 6) | Curriculum generation produces valid learning path |
| **Epic 2** (Interactive Teaching) | R-003 (BUS, score 6) | Homework mode never provides direct answers |
| **Epic 3** (Retention/Verification) | R-004 (DATA, score 6) | SM-2 calculation produces correct intervals; recall chain works |
| **Epic 4** (Progress/Engagement) | R-005 (SEC, score 4) | Profile isolation holds under family account scenarios |
| **Epic 5** (Subscription) | R-006 (BUS, score 4) | Stripe webhook -> DB state sync is reliable |

### Quality Gates

| Epic | Gate Criteria | Blocking? |
|------|-------------|-----------|
| Epic 0 | P0-001 (consent flow) + P0-004 (deletion) + P0-005 (auth) passing | Yes |
| Epic 1 | P0-002 (first session) passing | Yes |
| Epic 2 | P1-001 (homework) + P1-006 (SSE streaming) passing | No (P1) |
| Epic 3 | P0-003 (recall + SM-2) + P0-008 (session-completed chain) passing | Yes |
| Epic 4 | P1-003 (parent dashboard) + P1-004 (multi-subject) + P1-008 (Learning Book) passing | No (P1) |
| Epic 5 | P0-007 (Stripe webhook) + P1-005 (subscription flow) passing | Partial (P0-007 blocks) |

## Story-Level Integration Guidance

### P0/P1 Test Scenarios -> Story Acceptance Criteria

The following test scenarios MUST be reflected as acceptance criteria in their corresponding stories:

**Epic 0 Stories:**
- Sign-up story AC: "When user aged 11-15 in EU registers, parental consent email is sent within 30 seconds" (P0-001)
- Consent story AC: "When parent declines consent, child account and all data are deleted immediately" (P0-004, P2-002)
- Deletion story AC: "When user requests deletion, all data across all tables is purged within 30 days" (P0-004)

**Epic 1 Stories:**
- Subject creation story AC: "User can create subject, complete interview, and see generated curriculum" (P0-002)
- Curriculum story AC: "Generated curriculum contains ordered topics with learning outcomes" (P0-002)

**Epic 2 Stories:**
- Homework story AC: "AI never provides direct answers in homework mode; session marked as 'guided'" (P1-001)
- Streaming story AC: "SSE connection delivers AI response tokens in real-time" (P1-006)

**Epic 3 Stories:**
- Recall story AC: "After recall test, SM-2 calculates next review date and updates topic_schedules" (P0-003)
- Failed recall story AC: "After 3+ failed recalls, user redirected to Learning Book with 'Relearn Topic' option" (P1-002)
- Session chain story AC: "session.completed event triggers SM-2 update, coaching card refresh, and XP entry" (P0-008)

**Epic 4 Stories:**
- Parent dashboard story AC: "Parent can view all children's session counts and retention signals" (P1-003)
- Learning Book story AC: "Topics display retention status (Strong/Fading/Weak/Forgotten) with decay bars" (P1-008)

**Epic 5 Stories:**
- Webhook story AC: "Stripe webhook updates local subscription state within 1 minute" (P0-007)
- Trial story AC: "14-day trial expiry triggers warning notification and soft landing" (P1-005)

### Data-TestId Requirements

The following `testID` attributes are required for Maestro E2E flows:

| Screen | Required testIDs | Used By |
|--------|-----------------|---------|
| Sign-up | `get-started-button`, `email-input`, `password-input`, `create-account-button` | P0-001 |
| Consent | `parent-email-input`, `send-consent-button`, `consent-pending-indicator` | P0-001 |
| Home | `coaching-card-primary`, `add-subject-button`, `bottom-tab-home`, `bottom-tab-book`, `bottom-tab-more` | P0-002, P1-010 |
| Subject creation | `subject-name-input`, `start-interview-button` | P0-002 |
| Chat | `chat-input`, `send-button`, `message-bubble`, `streaming-indicator` | P0-002, P1-006 |
| Recall test | `recall-answer-input`, `submit-recall-button`, `recall-result` | P0-003 |
| Learning Book | `learning-book-topic-list`, `topic-retention-bar`, `topic-status` | P1-008 |
| Parent dashboard | `child-card`, `session-count`, `retention-signal` | P1-003 |
| Camera | `camera-view`, `capture-button`, `ocr-result` | P1-001 |
| Subscription | `trial-badge`, `upgrade-button`, `quota-remaining` | P1-005 |
| Profile switcher | `profile-switcher-chip`, `profile-switcher-menu`, `profile-option` | P2-001 |

## Risk-to-Story Mapping

| Risk ID | Category | P x I | Recommended Story/Epic | Test Level |
|---------|----------|-------|----------------------|------------|
| R-001 | SEC | 3x3=9 | Epic 0: Consent flow stories | E2E + Integration |
| R-002 | TECH | 2x3=6 | New story: "Implement test seed endpoint" | N/A (infra) |
| R-003 | BUS | 2x3=6 | Epic 2: Homework mode + Session quality | Integration |
| R-004 | DATA | 2x3=6 | Epic 3: Recall test + SM-2 chain | E2E + Integration |
| R-005 | SEC | 2x2=4 | Epic 0: Profile isolation stories | Integration |
| R-006 | BUS | 2x2=4 | Epic 5: Stripe webhook stories | Integration |
| R-008 | TECH | 2x2=4 | Epic 3: Session-completed chain | Integration |
| R-010 | BUS | 2x2=4 | Epic 2: Homework camera capture | E2E |
| R-011 | SEC | 2x2=4 | Epic 0: Account deletion stories | Integration |

## Recommended BMAD -> TEA Workflow Sequence

1. **TEA Test Design** (`TD`) -> produces this handoff document (COMPLETE)
2. **BMAD Create Epics & Stories** -> consumes this handoff, embeds quality requirements
3. **TEA ATDD** (`AT`) -> generates acceptance tests per story (P0 scenarios first)
4. **BMAD Implementation** -> developers implement with test-first guidance
5. **TEA Automate** (`TA`) -> generates full test suite (Tier 1 + Tier 2 Maestro flows)
6. **TEA Trace** (`TR`) -> validates coverage completeness against 105 FRs

## Phase Transition Quality Gates

| From Phase | To Phase | Gate Criteria |
|-----------|----------|--------------|
| Test Design | E2E Implementation | R-002 (seed endpoint) resolved; EAS dev build cached |
| E2E Implementation | Tier 1 Stable | 4 smoke flows passing with <5% flake rate |
| Tier 1 Stable | Tier 2 Buildout | Tier 1 promoted from advisory to blocking in CI |
| Tier 2 Buildout | Full Suite | All 12 flows passing nightly |
| Full Suite | Release | P0 = 100% pass, P1 >= 95% pass, no open P0/P1 bugs |
