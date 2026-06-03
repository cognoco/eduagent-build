# MMT-ADR-0009 — A durable transition scheduler: one unified daily sweep

**Status:** Accepted · 2026-06-03 · **Scope:** Identity Foundation — the time-triggered transition rail (pre-launch clean cut) · **Deciders:** Architect (jjoerg) + Claude · **Realizes:** ontology inv 24; PRD Part 10 §H Ripple 4 · **Consumers:** E1 (age/threshold cross), E2 (residence re-eval), E5 (inactivity-expiry)

> **Placement.** Global L2 from birth; lockstep canon partner is the incubating ontology (inv 24) + `domain-model.md` §5.

## Context

Several identity transitions fire with **no user action** — they are time-triggered, not request-triggered (ontology inv 24, domain-model-options §8):

- a charge crosses the **consent threshold** (the gate may lift) — E1;
- a Person crosses **18** ("graduation") — E1;
- a Person's **declared `residence_jurisdiction`** changes their consent requirement — E2 (action-triggered at the edit, but needs a scheduled backstop);
- an account goes **dormant (~365 days)** and is cleaned up — E5 (inactivity-expiry / last-guardian abandonment fallback).

A dormant account still transitions on its birthday whether or not it is ever opened, so these **cannot live only in request handlers** — that is the drift map's "wired-but-untriggered" trap: if nothing *schedules* the re-evaluation, the transition silently never happens. PRD Part 10 §H Ripple 4 confirmed a durable scheduler is feasible on the **existing Inngest rail with zero new infrastructure**, mirroring the production daily cron + per-person fan-out pattern (`apps/api/src/inngest/functions/daily-snapshot.ts`). It left open one D-body call: **one unified sweep, or three separate jobs?**

## Decision

**One unified daily Inngest sweep evaluates all time-triggered transition classes in a single per-Person pass.**

- A single **admin cron** (date-predicated daily scan of all non-archived Persons) fans out per-Person evaluation events via `step.sendEvent`, received by a **bounded-concurrency** handler that, for each Person, checks every time-based condition at once (age-threshold cross, residence-driven consent re-eval, dormancy) and dispatches whatever transition each one requires.
- **Idempotency is keyed on `personId + day`** (the cron-day bucket carried in the event payload, exactly as `daily-snapshot.ts` does to escape Inngest's 24h default-dedup sitting on the cron cadence).
- **Failure isolation is per-Person, at the fan-out leaf** (per-item `try/catch` + `captureException`, the daily-snapshot pattern) — one Person's failed check never blocks another's, which delivers most of the isolation benefit of separate jobs without three top-level crons.
- The scheduler **only detects and dispatches**; the transition mechanics (graduation migration, suspend-pending-consent, the warn/export window before dormancy deletion) live in their own handlers and named interim states (inv 25), not in the cron.

**Cost note carried to Phase E:** the birthday/age scan **cannot** filter to recently-active Persons (a dormant account still ages, inv 24), so it is a daily date-predicated scan of *all* non-archived Persons — needing an index on `birth_date` / `last_activity`. (Contrast `daily-snapshot`, which legitimately filters to 90-day-active profiles because a snapshot of an inactive learner is pointless; a *transition* of an inactive Person is not.)

## Consequences

- **One rail to build, operate, and monitor**, reusing a pattern already trusted in production — the least-new-surface choice.
- **One scan** of the Person set instead of three overlapping scans; the shared per-Person inputs (age, residence, last-activity) are loaded once.
- **Low-regret:** if a single consumer later needs a genuinely different cadence (e.g. residence re-eval goes event-only, dormancy goes weekly), splitting *that* consumer out is a small additive change — start unified.
- The scheduler is **infrastructure for** E1/E2/E5 but does not decide their policy; e.g. it fires the dormancy candidate event, but the dormancy *period*, the mandatory pre-deletion notice, and the legally-mandated retention carve-outs (billing/tax records outliving learning data) are counsel items (REQ-2) and Phase-E design, not fixed here.
- New work (T2+): this is a net-new Inngest function pair (cron + fan-out receiver); the index is a Phase-E migration concern.

## Alternatives considered

1. **Three separate scheduled jobs** (age, residence, dormancy). Rejected for v1 — three crons to operate, three overlapping scans, three reloads of the same per-Person inputs, for an isolation benefit the per-item leaf `try/catch` already provides. Re-considered only if a real per-consumer cadence divergence appears.
2. **Put transitions only in request handlers** (lazy re-evaluation on next login). Rejected — the dormant-account birthday transition never fires; this *is* the wired-but-untriggered failure inv 24 forbids.
3. **A unified sweep that filters to recently-active Persons** (mirroring daily-snapshot's 90-day filter). Rejected — correct for snapshots, wrong for transitions: an inactive Person still legally ages and still must time out; the scan must be date-predicated over all non-archived Persons.
