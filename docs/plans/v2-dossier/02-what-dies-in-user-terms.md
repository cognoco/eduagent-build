# What dies, what moves, what stays — in user terms

> Every claim below was verified against the working tree on 2026-06-12 (branch
> `new-llm`): every "dying" surface maps to a real route file on disk; no phantoms.
> Nothing is deleted until **S6**, and each deletion is gated on its V2 replacement
> being live + measured; removing the legacy flags is additionally gated on the
> **§13.1 V0-retirement ruling** (yours, still open). Doc sources: spec §7,
> `v2-plan/02-flow-map.md`, S6 plan. This file is the plain-language rendering.

## DIES — you will no longer find these

| What a user notices gone | Where the job goes |
|---|---|
| **The "More" tab** (account, notifications, help, privacy, …) | Behind the **avatar** (top-corner sheet); owner-gating preserved |
| **The Library tab** (the bookshelf of subjects/books) | Browsing → **Subjects tab**; saved items → **Journal** (still browsable, not search-only) |
| **The Progress tab** (mastery stats, streak chip, saved, vocabulary, reports, milestones) | Per-subject progress → **Subject hub**; paper trail → **Journal**; "what next" → **Mentor feed** |
| **The Recaps tab** (V1 guardian tab) | Into the **Journal** |
| **The own-learning tab** | Already a redirect today (half-dead); folds into the single Mentor tab + Me scope |
| **The Study ⇄ Family mode switcher** | Replaced by the **scope chip** `[Support hub] [Jakub] [Me]` (S4) |
| **Proxy mode** ("viewing as child" with the colored banner) | Replaced by **person scopes** — live data through a server mask, never impersonation (S4) |
| **The parent home screen** (family dashboard) | Replaced by the **Support-hub feed** (S4) |
| **The 3-screen end-of-session summary funnel** | Dissolves into the **mentor's wrap-up conversation turn** — gated on park-and-return eval coverage (see Gap 3 in `01-…`) |
| **Parent drill-down screens** (`child/[profileId]/…` reports, curriculum, sessions) | Person-scope masked Subject hub + Journal shared record (S4/S5) |
| **Standalone My Notes screen** | Into the **Journal** |
| **Standalone mentor-memory screen** | Into the **Journal** ("what the mentor knows about me") |
| **XP everywhere** (Practice-hub "⭐ NN XP" pill, session-summary bonus banner, topic/book badges) | **Nothing.** Killed, not re-wired (P7). Backend XP tables dropped later, after the last reader is gone |
| **The streak counter** ("🔥 5-day streak") | A calm **"on track" badge** — no number. Streak *data* stays in the DB |

## MOVES — same job, new place to tap

| Today | V2 |
|---|---|
| Settings / billing / security / privacy / add-child (More tab) | **Avatar sheet** — billing, security, export/delete stay owner-only exactly as today |
| Browsing my subjects (Library) | **Subjects tab** — one hub per subject: "Next up" on top, chapters collapsible on the page, topic detail as a slide-up sheet (max depth 2) |
| Per-subject progress (Progress → subject) | Merged **into the Subject hub** (shelf + progress become one screen) |
| My recaps / reports / vocabulary / transcripts | **Journal** (recaps · notes · mentor memory, + the moments strip) |
| Starting quiz / dictation / practice / homework (scattered buttons) | The **feed proposes them** as cards; the **bar + camera + Homework chip** takes them on demand |
| "Continue where I left off" | The **`/now` anchor card** (1–3 ranked, declinable) |
| Parent viewing child progress (proxy + family mode) | **Scope chip person-scope** (S4): structural view only |
| Billing deep-links / push targets | Re-pointed at avatar → subscription; home-pushes re-routed to the Mentor feed |

## STAYS — untouched floor

- **Auth, profiles, consent** — the entire stack; V2 starts after a lawful profile exists.
- **The conversation/session engine itself** — voice, streaming, parking, challenge
  overlays. V2 changes how you *arrive*, not the engine.
- **Homework** (photo, help-me vs check-answer, dictation-homework) — *more*
  prominent, not less: permanent camera + chip on the bar.
- **Quiz / Dictation / Practice screens** — kept as targets; only discovery moves.
  (Practice hub keeps its screen, loses its XP label.)
- **Subject creation, pick-book, transcripts, subject detail.**
- **Subscription/billing + RevenueCat flows** — relocated behind the avatar, unchanged.
- **Retention/SRS core and streak data** — kept (an invisible consistency refactor in S0-R).
- **The V0 production 5-tab shell** — must not regress until §13.1 is ruled.

## Found while verifying (oddities worth knowing)

1. **Milestones gallery is already unreachable** — fully built screen, zero inbound
   navigation anywhere in the app today. It doesn't "die in V2"; it died quietly at
   some point and nobody removed the file. Needs an explicit keep/delete call in S6.
2. **Recall-test screen** exists as a real route but no V2 doc dispositions it by
   name. Same: needs an explicit S6 line.
3. **own-learning** is already just a redirect — its row in the kill list is
   ceremonial.
4. **XP is not backend-only** — resolved 2026-06-13. The spec and plans now keep
   earned private receipts (XP/practice points, reflection bonus, quiz personal
   bests, mastery/progress deltas) while deleting coercive reward presentation.

Last updated: 2026-06-13
