---
name: V2 pushed-screen wayfinding and active-person orientation
description: Use when designing, testing, or reviewing V2 navigation, headers, bottom tabs, or own-versus-supporting profile context.
type: project
---

Operator ruling from V2 dogfood on 2026-07-17: deeper screens must preserve three distinct orientation signals.

- **Location:** ordinary pushed screens retain the bottom navigation and highlight their owning Mentor, Subjects, or Journal tab.
- **Return:** Back controls name the semantic destination (for example, “Back to Subjects”), including intentional behavior for deep links and empty history.
- **Active person/context:** show avatar/icon plus explicit wording such as “Your learning” or “Supporting {name}.” A stable semantic accent color may reinforce this, but must never be the only cue.

Focused flows may hide the bottom navigation only when they provide an explicit Exit, Cancel, or named return action. Prefer a central route-to-owning-tab / return-label / active-context contract over per-screen patches.

**Operational source:** `WI-2331` — Restore V2 wayfinding and active-profile orientation on pushed screens (Cosmo, Captured on 2026-07-17). Related implementation seams: `WI-2185` fixed V2 chrome clearance, `WI-2178` active theme behind fixed chrome, and `WI-2240` avatar account entry/return paths.
