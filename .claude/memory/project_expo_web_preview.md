---
name: Expo web preview for end-user testing
description: How to spin up the mobile app in a browser via .claude/launch.json "mobile" config. Useful for UX-level inspection when native builds are slow. Auth wall blocks deeper flows.
type: project
---

**Config:** `.claude/launch.json` has a `mobile` target that runs `expo start --web --port 8081`. Also has `api` on 8787 (wrangler dev for the Hono worker).

**How to start (in-session):**
```
preview_start name="mobile"
# then preview_snapshot / preview_screenshot / preview_console_logs
```

**Cold-bundle expectations (measured 2026-04-17):**
- First HTTP request kicks Metro — server start alone does nothing.
- ~18s to bundle ~2,543 modules on a dev Windows box.
- Subsequent hot reloads: 1–2s.

**What you get:**
- Full render tree via `preview_snapshot` (accessibility-tree format, exact text + roles).
- `preview_inspect` for CSS values (more accurate than screenshots for colors/fonts).
- `preview_console_logs` level="warn" for routing/render warnings.
- `preview_network` for API call tracing.

**Auth wall:** Landing = Clerk sign-in. Credentials/OAuth are blocked by safety rules unless the user explicitly drives them. Past sign-in requires user action.

**Web-specific caveats (what breaks silently):**
- Voice I/O — no native mic/TTS in web.
- SecureStore — absent. Theme preference falls back to `prefers-color-scheme`, which renders the app in **light mode** even though native default is dark.
- RevenueCat IAP — web stub only.
- `expo-notifications` push token listener — no-op on web (benign warning).
- Reanimated honors `prefers-reduced-motion=reduce`; splash animation is skipped in automated browsers.

**Useful for:**
- Checking sign-in screen, consent screens, privacy/terms pages, passive renders.
- Catching Expo Router routing warnings that don't appear in native builds.
- Accessibility checks (snapshot is a11y-tree native).

**Not useful for:**
- Anything past sign-in without user intervention.
- Audio, camera, push, IAP, SecureStore-dependent behavior.

**Known findings from first web-preview pass (2026-04-17):** see `_archive/project_expo_router_pollution.md`.
