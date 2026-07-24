---
title: Trust package design artifact
date: 2026-07-24
profile: design
status: active
work_items:
  - WI-1767
---

# Trust package design artifact plan

## Goal

Produce one git-versioned, product-approved specification for the five MVP trust
package slices so each build item can be implemented without another product
decision.

## Source surfaces read

- `apps/mobile/src/app/(app)/more/index.tsx` and
  `apps/mobile/src/app/(app)/mentor-memory.tsx`
- `apps/mobile/src/app/session-summary/[sessionId].tsx` and
  `apps/mobile/src/app/session-summary/_view-models/session-summary-derived.ts`
- `apps/mobile/src/components/session/SessionMessageActions.tsx`
- `apps/mobile/src/components/feedback/FeedbackProvider.tsx` and
  `apps/mobile/src/components/feedback/FeedbackSheet.tsx`
- `apps/mobile/src/app/(app)/more/help.tsx`
- `apps/api/src/services/now-feed.ts`
- `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`

## Tasks

1. Record the selected written-spec approach and the rejected external-mockup
   alternative on WI-1767.
   - Done when the Design-item mechanical DoR gate recognizes two explored
     options and the item reaches Ready.
2. Specify all five slices.
   - Done when every slice names placement, source copy, state behavior,
     failure behavior, privacy boundary, accessibility behavior, and relevant
     existing surfaces.
3. Check cross-slice consistency.
   - Done when first-week and review-promise copy cannot make conflicting
     review promises, memory education never exposes remembered facts, and
     support context remains allow-listed.
4. Link the build items and record product review.
   - Done when WI-1497, WI-1498, WI-1499, WI-1501, and WI-1502 cite the
     specification and OPQ-40 records Zuzka's approval.
5. Close the operator question.
   - Done when OPQ-40 is Closed only after the repository artifact and all five
     work-item links have been verified.

