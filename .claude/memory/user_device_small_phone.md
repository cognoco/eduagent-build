---
name: User's primary test device is Samsung Galaxy S10e (small screen)
description: User tests on Galaxy S10e (5.8" screen). Small screen layout bugs are a real concern — buttons getting cut off, scroll issues, keyboard overlap. Always consider this device when reviewing UI changes.
type: user
---

**Device:** Samsung Galaxy S10e
**Screen:** 5.8", 1080x2280, 438 ppi
**Why it matters:** This is significantly smaller than typical emulator screens (1080x1920+). UI elements near the bottom of the screen are at risk of being unreachable, especially when the keyboard is open or when bottom sheets/modals are shown. The "Use this" button on the homework OCR edit screen was the first confirmed instance of this issue (2026-04-03).

**How to apply:** When building or reviewing UI, always check that interactive elements are reachable on a ~5.8" screen. Use `KeyboardAvoidingView` properly, ensure ScrollViews extend far enough, and test bottom-positioned buttons with keyboard open.
