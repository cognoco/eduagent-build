# MMT-ADR-0006 — OCR: ML-Kit on-device primary, server-side fallback behind an interface (provider deferred)

**Status:** Accepted (Architecture decision, Epic 2 era) · **Formalized:** 2026-06-03 (Phase-C seed — MMT-ADR-0000 Part III) · **Scope:** Homework OCR · **Deciders:** PM + Claude · **aka** `ARCH-14`

> **Provenance note:** this is the third Phase-C seed ADR, chosen to exercise the **`ARCH-N` freeze + absorb-forward** mechanism (MMT-ADR-0000 Part III). It promotes the pre-existing register entry `ARCH-14` to a full decision record. Per absorb-forward, the same change-set migrates `ARCH-14`'s lone code citation (`apps/api/src/services/ocr.ts`) to `MMT-ADR-0006` and stamps the `ARCH-14` line in `docs/specs/epics.md` with its disposition (`→ MMT-ADR-0006`). No standing `ARCH-14` alias remains.

## Context

The homework-help flow is **camera → OCR → first AI response**, on a `<3s` critical-path budget. OCR sits on that path. Two forces are in tension: most homework text is ordinary handwriting/print that an on-device recognizer handles instantly with no network hop, but math-heavy content needs a stronger (server-side) recognizer whose provider was not yet evaluated against real content.

## Decision

- **Primary: ML Kit on-device OCR** — fast, no network dependency for the common case, keeps the critical path inside budget.
- **Fallback: server-side OCR behind a swappable provider interface**, exposed at `/v1/ocr`. The fallback **provider** (Mathpix vs. Cloudflare Workers AI) is **deliberately deferred** — the *interface* is designed now; the *provider choice* is made only when real homework-content accuracy/cost data exists to evaluate candidates against.
- **No circuit breaker on OCR** — failures are per-image, not systemic; a single-request 5s timeout falls back immediately to manual text input (contrast with the LLM-provider circuit breaker).

## Consequences

- `apps/api/src/services/ocr.ts` is a **swappable provider interface** (pure business logic, no Hono imports), so the deferred provider can be slotted in without touching call sites. Its header comment now cites `MMT-ADR-0006` (migrated from `ARCH-14`).
- The provider decision (Mathpix vs. CF Workers AI) remains **open** by design. Selecting it requires a new ADR (or an amendment here), made against real-content accuracy/cost data — not before that data exists.
- On-device primary means the OCR result quality varies by device ML Kit capability; the server fallback + manual-text path are the recovery routes (no dead-end).

## Alternatives considered

1. **Server-side OCR for everything.** Rejected — adds a network hop to the common case and pressures the `<3s` critical-path budget for text that on-device handles instantly.
2. **On-device only, no server fallback.** Rejected — on-device recognizers handle math/symbolic content poorly; the interface seam preserves a path to a stronger recognizer without re-architecting.
3. **Choose the fallback provider now.** Rejected — premature; the provider should be chosen against real homework-content accuracy/cost, so the interface is designed now and the provider deferred.
