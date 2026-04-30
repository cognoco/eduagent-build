---
name: Brand identity — fixed teal + lavender, dark-first, system toggle
description: No accent picker. Fixed brand: teal primary + lavender secondary. Navy dark bg, cream light bg. Default follows system setting. Two themes only.
type: project
---

Brand identity locked (2026-03-30).

**Colors (from logo horizontal-dark-panel.png):**
- Dark mode background: deep navy (~#1a1a3e)
- Light mode background: cream (#faf5ee)
- Primary accent: teal (#2dd4bf dark, auto-darkened for light mode text)
- Secondary accent: lavender (#a78bfa dark, auto-darkened for light mode text)
- Accent-as-fill: same hex on both modes (buttons get dark text on top)

**Key decisions:**
- NO accent picker. No presets. Fixed brand colors. Teal + lavender, always.
- Dark mode is the "brand" experience (matches logo). Light mode is functional.
- Default follows SYSTEM setting (dark/light/auto). No persona-based theme defaults.
- User can override in app settings (dark / light / system).
- If post-launch feedback says users hate the colors (unlikely — teal+lavender are universally inoffensive), add a "neutral" slate mode. Don't build preemptively.

**Why no picker:**
- Brand consistency — "the teal app" like Duolingo is "the green app"
- Logo matches UI always (no mismatch when user picks pink)
- Dramatically simpler engineering (cascade fix for 1 color set, not 6)
- Accent pickers feel like toy apps, not professional products
- Teen personalization comes from content (streak, XP, milestones), not button color

**Supersedes:** brand_color_refresh.md (blue #378ADD plan), all accent palette discussions.
