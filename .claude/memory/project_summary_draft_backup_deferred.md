---
name: Summary draft server-side backup deferred
description: Server-side mirror of session-summary drafts deferred due to storage volume and retention concerns; local SecureStore autosave is live.
type: project
originSessionId: df7d9e59-3e7b-498b-b813-8de1e7354429
---
Local autosave for session-summary drafts shipped (2026-04-23) under `DRAFT-BULLETPROOF-01` — SecureStore-backed, profile+session scoped, 300ms debounce, 7-day TTL. Files: `apps/mobile/src/lib/summary-draft.ts` + wired into `apps/mobile/src/app/session-summary/[sessionId].tsx`. Survives app crash / OS kill / force-quit. Does **not** survive device loss/reset/reinstall.

Server-side backup proposed and **deferred** 2026-04-24.

**Why:** user flagged storage-volume concern (lots of in-progress drafts across sessions). Proper decisions still open: retention TTL, parent visibility of drafts, prompt-injection surface if drafts ever land in LLM context, GDPR-export payload growth, replication/backup cost.

**How to apply:** when the topic comes back, don't start from scratch — design options already mapped:
- **A (shipped):** local SecureStore only.
- **B:** local + server mirror. Extend `sessionSummaries` with nullable `draftContent` / `draftUpdatedAt`; new `PUT /v1/sessions/:sessionId/summary/draft` (idempotent) and `DELETE` on terminal status transition. 2–3s client debounce. Last-write-wins on `updatedAt`.
- **C:** B + offline outbox. Only justified if telemetry shows real offline loss.

Open questions before picking up B:
1. Column on `sessionSummaries` (simple) vs. separate `sessionSummaryDrafts` table (cleaner).
2. Debounce interval for server writes.
3. "Saved X seconds ago" indicator yes/no.
4. Prune-abandoned-drafts cron (30d? 90d?).
5. Does parent dashboard ever surface drafts? (Default: no.)
