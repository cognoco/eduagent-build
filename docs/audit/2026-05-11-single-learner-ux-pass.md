# Single Learner UX Pass

Date: 2026-05-11

Method: Seeded single-learner Playwright crawl using the web build, then visual inspection of captured screenshots in `apps/mobile/e2e-web/test-results/manual-learner-ux/`. The first action-click run exposed a blocker on the Home practice action, so the coverage run used direct navigation for breadth.

## Screens Actually Inspected

- Home
- Practice / Test yourself entry
- New subject
- Library
- Subject shelf loading state
- Progress overview
- Progress subject loading state
- Progress sessions loading state
- Quiz loading states
- Assessment loading state
- Dictation loading state
- Homework camera permission state
- Mentor memory
- Own learning / learning profile surface
- More
- Account
- Privacy & data
- Notifications
- Help
- Profiles
- Subscription

## Findings

| ID | Screen | Finding | Why it hurts | Suggested change |
| --- | --- | --- | --- | --- |
| SL-UX-01 | Home -> Test yourself | Clicking `home-action-practice` hung in Playwright during the click action. | The most learner-relevant CTA can feel unresponsive or impossible to activate in the web test surface. | Investigate the pressable/card interaction and add an e2e assertion that clicking it reaches `practice-screen`. |
| SL-UX-02 | Deep learner routes | Several direct routes were still spinner/skeleton-only after a short render pause: subject shelf, progress subject/sessions, quiz, assessment, dictation. | A learner sees motion but no explanation, no timeout, and no escape except browser/app navigation. | Use `TimeoutLoader` or a standard loading shell with screen title, what is loading, and a back/home fallback. |
| SL-UX-03 | Library | Library has huge blank space after one subject row and no “continue”, “recent”, or “start new” affordance. | The screen technically works, but it feels like a directory rather than a place to learn. | Add a compact “Continue General Studies” row, recent topics, and a visible new-subject action when the library is sparse. |
| SL-UX-04 | Progress overview | Empty progress says “Start your first session”, but this seeded learner already has a subject and topics. | The learner may think progress is broken or that previous work did not count. | Explain what earns progress and offer a specific next action, e.g. “Study General Studies Topic 3 to unlock progress.” |
| SL-UX-05 | Practice | “Prove I know this” says only “Study a topic first”, while there is already a subject available. | The disabled/blocked state does not tell the learner how to unblock it. | Link the row to the best next study topic or show “No eligible topics yet” with one clear CTA. |
| SL-UX-06 | New subject | The form is clean, but the suggestions are repetitive and read like setup options rather than inspiring learning starts. | It feels functional, not delightful; a learner gets categories, not curiosity hooks. | Mix subjects with concrete prompts: “Ancient Egypt”, “Fractions”, “How plants grow”, “Python basics”. |
| SL-UX-07 | Mentor memory | The toggle appears on while the status says memory collection has not been enabled yet. | Mixed state language reduces trust around a sensitive feature. | Make the state binary and explicit: off until enabled, then show what will be remembered. |
| SL-UX-08 | More | Accommodation choices are prominent, but the current selection “None” dominates the settings screen. | This is important, but it crowds out everyday account/help tasks and feels clinical. | Put accommodations behind an “Learning style” row with a summary, or add a short “Adjust” affordance. |
| SL-UX-09 | Privacy & data | The first section is “When I withdraw consent for a child” for a single learner account. | Persona mismatch: a solo learner is reading parent/child policy controls. | Hide child-specific consent controls for single learners or label them as family-account settings. |
| SL-UX-10 | Subscription | “Upgrade” is primary even though the text says store purchasing is not available on this device. | It invites a dead-end and can feel bait-and-switchy. | Disable the upgrade button with an inline explanation or replace it with “Plans available on mobile app”. |

## What Would Make Me Love It

1. Make every major action land somewhere visibly useful within one second: Home CTAs, Library subject row, and Progress start-learning should all feel instant.
2. Replace indefinite spinners with educational loading states that name the destination and give a fallback.
3. Make empty states specific to the learner’s actual seed data instead of generic “start first session” language.
4. Give the sparse Library and Progress screens more “next best learning action” energy.
5. Tighten persona-specific settings so a single learner never sees parent/child copy unless it applies.
