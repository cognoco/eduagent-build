# Child Notice — Persistent Memory Section (Draft for the memory unlock only) — v0.1

**Status:** Draft v0.1, 2026-07-30. For DPO review (Stephan Hartmann).
**Feeds:** DPO Action 13 — [`DPO exchanges/2026-07-26-action-register-tracker.md`](../DPO%20exchanges/2026-07-26-action-register-tracker.md) row 13 (transparency package / layered child notice).
**Companion source:** [`../child-readable-privacy-summary-draft.md`](../child-readable-privacy-summary-draft.md) — the existing child-readable notice this section is written to match in voice, reading level, and structure.

> **This section does not ship at launch.** MentoMate's launch state has persistent memory disabled — the "Interim operating conditions" in the action register tracker are explicit that "persistent memory + profiling stay disabled until legal basis/controls/transparency/retention approved." This draft exists so the notice text is ready the day the unlock happens, not before. It should be inserted into the child-readable privacy summary's "What 'learning memory' means" section (or as a new section immediately after it) **only at the same time the memory feature itself unlocks**, never earlier.

---

## Draft section text (for insertion into the child-readable notice)

### The mentor remembering things about you, over time

Right now, MentoMate remembers what happened in one chat while you're using it, and keeps a short summary of your subjects, progress, and what you've learned. This new part is different: it lets the mentor remember things about **you** — the way you like things explained, subjects you've talked about before, things you told it that help it help you better — and use that memory the next time you talk, even weeks later.

**Why we do this.** A good tutor remembers you. If you told your mentor last week that you're stronger in algebra than geometry, or that you like examples using football instead of cooking, remembering that saves you from repeating yourself and helps the mentor actually teach you better.

**What it remembers.** Things like: subjects and topics you've studied, how you like things explained, mistakes you tend to make so it can help you avoid them again, and small facts you've shared that are useful for learning (like "I'm doing this for my exam in June"). It does not go looking for private things about your life that have nothing to do with learning.

**What it does not do.** This memory is not used to advertise to you, build a profile of you to sell, or train some other company's general AI model. It is only used to make your own tutoring better.

**You can see it.** You can open your memory and see exactly what MentoMate remembers about you, in plain language — not hidden, not a mystery.

**You can turn it off.** If you don't want the mentor to remember things between chats, you can turn this off. Turning it off doesn't stop you from using MentoMate — it just means each chat starts fresh, the way things worked before this feature existed.

**A parent or guardian's role.** [PLACEHOLDER — depends on the guardian-visibility scope ruling referenced in the existing draft's "Parents and guardians" section, which is not yet finalized. Do not fill this in until that scope is set; a wrong guess here is worse than a blank.]

### Comprehension prompts to add (for testing this section specifically)

1. What is different about this new kind of memory compared to what MentoMate already remembered?
2. Can you find where to look at what the mentor remembers about you?
3. If you wanted to stop the mentor from remembering things between chats, what would you do?
4. Is this memory used to show you ads or sell information about you?

---

## Notes for the DPO / product review

- Written to match the existing draft's reading level (short sentences, concrete examples, second-person "you," no legal jargon) and its practice of ending with comprehension prompts for testing with young people.
- Deliberately avoids specific UI navigation instructions ("tap Settings then...") since the exact settings-screen location depends on the interface inventory in the companion document ([`2026-07-30-memory-disclosure-copy-inventory.md`](2026-07-30-memory-disclosure-copy-inventory.md)), not yet built.
- The "parent or guardian's role" paragraph is intentionally left as a placeholder — the existing draft itself defers this ("The final summary must state exactly what guardians can see after the controller and DPO complete the child-best-interests assessment; this draft does not guess that scope"), and that assessment has not concluded. Writing a confident guess here would misrepresent guardian visibility to a child reader, which is a worse failure than leaving it blank.
- This text has not been tested for comprehension with any young person, per the existing draft's own caveat that it is "not the final published notice."
