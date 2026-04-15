# PARENT-06: Parent Monthly Report Empty State

**Date:** 2026-04-10
**Status:** Approved
**Finding:** `flow-improvements.md` PARENT-06

## Problem

Parents can wait 1-31 days before the first monthly report is generated (depends on when in the month the child first learns). The current empty state is a single grey text line: "No monthly reports yet. They will appear here once a month after there is enough learning activity to summarize." No time estimate, no illustration, no action, no explanation of what triggers a report.

Additionally, the "Monthly reports" button on the child detail screen only appears when `child?.progress` is truthy — brand-new child profiles may not show the button at all.

## Solution

### 1. Richer empty state on reports list screen

Replace the single-line grey text with a structured empty state card:

**Illustration:** A simple calendar icon or document icon (use existing icon library, not a custom illustration).

**Heading:** "Your first report is on its way"

**Body:** "Reports are generated on the 1st of each month, summarizing your child's learning from the previous month. {ChildName}'s first report will arrive on {nextReportDate}."

Compute `nextReportDate`: the 1st of the next month. If today is the 1st and no report exists yet (generation runs at 10:00 UTC), show "later today" instead of the next month.

**Action button:** "See {ChildName}'s progress now" → navigates back to the child detail screen, which already shows real-time progress data (subjects, sessions, XP).

**Subtext:** "You'll get a push notification when the report is ready."

### 2. Always show the "Monthly reports" button

On the child detail screen (`child/[profileId]/index.tsx`), remove the `child?.progress` guard on the reports button. Show it always, even for brand-new profiles. The reports list screen's empty state will handle the explanation.

If there are reports: "Monthly reports (3)"
If no reports: "Monthly reports"

No count suffix when empty — avoids "Monthly reports (0)" which looks broken.

### 3. Time context in the empty state

To make the wait less abstract, compute how many days until the next 1st:

- "Your first report arrives in about {N} days" (when N > 3)
- "Your first report arrives in a few days" (when N <= 3)
- "Your first report should be ready later today" (on the 1st, before generation)

## Scope Exclusions

- **Interim/weekly micro-reports** — generating more frequent reports would change the product model. Out of scope.
- **Preview of what reports contain** — would require a sample/demo report. Not justified for launch.
- **Report generation trigger change** — the monthly cron at 10:00 UTC on the 1st is the existing schedule. Not changing it.

## Files Touched

- `apps/mobile/src/app/(app)/child/[profileId]/reports.tsx` — richer empty state component
- `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` — remove `child?.progress` guard on reports button
- `apps/mobile/src/app/(app)/child/[profileId]/reports.test.tsx` — test empty state renders with correct date

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Child never learns | No sessions in a month | Report never generated, empty state persists | "See progress" button shows real-time data (even if empty) |
| Report generation fails | Inngest cron error | Empty state continues, no broken UI | Cron retries automatically; parent can check progress directly |
| Today is the 1st and report not yet generated | Before 10:00 UTC | "Should be ready later today" | Push notification when ready |
