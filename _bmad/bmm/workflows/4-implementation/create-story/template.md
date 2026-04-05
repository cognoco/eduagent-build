# Story {{epic_num}}.{{story_num}}: {{story_title}}

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a {{role}},
I want {{action}},
so that {{benefit}}.

## Acceptance Criteria

1. [Add acceptance criteria from epics/PRD]

## Tasks / Subtasks

- [ ] Task 1 (AC: #)
  - [ ] Subtask 1.1
- [ ] Task 2 (AC: #)
  - [ ] Subtask 2.1

## Failure Modes

<!-- REQUIRED for any screen/flow. Enumerate every non-happy-path state.
     If the "Recovery" column is empty, the design is incomplete. -->

| State | Trigger | User Sees | Recovery |
|-------|---------|-----------|----------|
| Loading timeout | Slow network / API down | Spinner > 15s | Cancel button, "Go Home" link |
| API error | Server 4xx/5xx | Error message | Retry + "Go Back" |
| Empty data | No records exist | Empty state | Guidance text + CTA |
| Offline | No network | Proactive banner | Disable actions, show warning |
| Expired/Gone | Stale link or deleted resource | "Not found" message | "Go Back" button |

## Dev Notes

- Relevant architecture patterns and constraints
- Source tree components to touch
- Testing standards summary

### Project Structure Notes

- Alignment with unified project structure (paths, modules, naming)
- Detected conflicts or variances (with rationale)

### References

- Cite all technical details with source paths and sections, e.g. [Source: docs/<file>.md#Section]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
