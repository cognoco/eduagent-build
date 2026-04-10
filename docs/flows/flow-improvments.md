# Mobile Flow Improvements

Date: 2026-04-10

This review was written from an end-user point of view after reading the current mobile flow inventory and sampling the current route/component code behind those flows.

Interpretation notes:
- "Missing" includes missing reassurance, discoverability, recovery, and follow-through, not only missing backend functionality.
- These findings are UX-first. A flow can be technically implemented and still feel frustrating, slow, risky, or unclear.
- Some findings are inferred from the current code paths because several flows are marked `Code-only` in the inventory.

## Highest-priority rough edges

- `AUTH-05`: additional verification can still strand users with "this build does not support yet" style messaging if their account requires a method the app cannot complete cleanly.
- `ACCOUNT-10`: Export my data says the export is ready, but the user is not actually shown, downloaded, or asked to share the export.
- `ACCOUNT-06`: "Help & Support" exists as a row in More but has no action, which feels broken immediately.
- `HOMEWORK-02`: homework is camera-first with no obvious gallery/import path, which is painful for screenshots, PDFs, LMS images, and already-taken photos.
- `LEARN-10`: book session long-press exposes "Coming soon" / "Not available yet" actions, which is a direct frustration trap.
- `AUTH-11` / `LEARN-02`: session expiry and forced sign-out are explained, but still feel abrupt and can interrupt work without a strong recovery path.
- `ACCOUNT-13` / `ACCOUNT-11`: account deletion copy says 7-day grace in-product while privacy copy says 30 days, which undermines trust.

## Auth and Access

| ID | Flow | What feels missing | What will annoy or frustrate the end user |
| --- | --- | --- | --- |
| AUTH-01 | App launch and auth gate | More purposeful loading and clearer "why am I here?" messaging during redirects and auth checks. | The app can feel like it is bouncing between spinner, gate, and sign-in instead of confidently opening. |
| AUTH-02 | Sign up with email and password | Better expectation-setting about what happens after sign-up: verify email, create profile, maybe get parent approval. | Signing up can feel like the first of several separate sign-ups instead of one continuous start flow. |
| AUTH-03 | Sign-up email verification code | More reassurance about resend timing, code arrival, and what to do if the email never arrives. | Inbox hopping and typo recovery are tedious, especially on mobile. |
| AUTH-04 | Sign in with email and password | Better recovery copy when activation/auth propagation is slow or flaky. | Users can feel like sign-in "worked but did not work" when they see spinner fallback or activation errors. |
| AUTH-05 | Additional sign-in verification | A guaranteed supported path for email code, phone code, and TOTP without falling back to unsupported-method messaging. | Getting locked out because the app cannot finish your account's verification path is a trust breaker. |
| AUTH-06 | Forgot password and reset password | Stronger success feedback and a clearer landing after reset. | The flow works, but it is easy to feel uncertain whether the reset fully completed or where you should go next. |
| AUTH-07 | Auth screen navigation | More state preservation across sign-in, sign-up, and forgot-password pivots. | Moving between auth screens can feel like restarting a form instead of continuing a task. |
| AUTH-08 | OAuth sign in / sign up with Google, Apple, or OpenAI | More consistent provider support and clearer fallback when a provider cannot complete sign-in. | Different providers behave differently, and OpenAI is env-gated enough that availability can feel inconsistent. |
| AUTH-09 | SSO callback completion and fallback return to sign in | Better provider-specific recovery guidance than "Back to sign in" after a timeout. | A blank waiting screen followed by a generic fallback feels like the app gave up without explaining why. |
| AUTH-10 | Sign out | A small confirmation or signed-out acknowledgement. | It is easy to tap sign out and immediately lose context with no reassuring "you are signed out" finish. |
| AUTH-11 | Session-expired forced sign-out | A stronger re-entry path that preserves what the user was doing or tells them what was lost. | Being forced out mid-task is especially frustrating even when the alert explains what happened. |
| AUTH-12 | First-time vs returning sign-in copy | More than copy: the rest of the path still needs to feel shorter and calmer for first-timers. | Nice wording helps, but it does not remove the feeling of a long setup gauntlet. |

## Profiles, Family, Consent, and Account

| ID | Flow | What feels missing | What will annoy or frustrate the end user |
| --- | --- | --- | --- |
| ACCOUNT-01 | Create first profile | More explanation of why birth date matters and what changes after profile creation. | The form is high stakes for how little context it gives. |
| ACCOUNT-02 | Create additional profile | Better clarity about who will become active after creation and how switching works. | Adding a profile feels like admin work with a slightly unclear outcome. |
| ACCOUNT-03 | Add child profile from More or Profiles | Earlier explanation of billing/profile limits before the user taps into the flow. | Hitting a paywall or profile cap only after deciding to add a child feels like a surprise block. |
| ACCOUNT-04 | Profile switching | A clearer mental model for owner/parent/child roles and current active profile. | Users can worry they are making changes on the wrong person's profile. |
| ACCOUNT-05 | Family-plan gating and max-profile gating for adding children | More proactive plan-limit visibility before the CTA. | Alert-only gating feels reactive and salesy. |
| ACCOUNT-06 | More tab navigation | A tighter information hierarchy and working support entry. | "Help & Support" is present but does nothing, which feels broken immediately. |
| ACCOUNT-07 | Settings toggles for push notifications and weekly digest | Better feedback about whether the change really took effect and whether OS permissions are still needed. | Toggles can feel decorative if the user never sees a success state. |
| ACCOUNT-08 | Learning mode and celebration preferences | Simpler, more concrete examples of what each mode actually changes in day-to-day use. | Users may not know enough yet to choose between abstract preference modes. |
| ACCOUNT-09 | Change password | A more direct forgotten-password handoff and stronger success/closure. | "Forgot your password?" signs the user out instead of taking them straight into reset, which feels jarring. |
| ACCOUNT-10 | Export my data | Actual delivery of the export: show it, download it, or share it. | "Your data export is ready" with nothing to open is one of the clearest broken-feeling experiences in the app. |
| ACCOUNT-11 | Delete account with 7-day grace period | Stronger confirmation and clearer reminder to export first. | It feels too easy to trigger a destructive action, and the policy messaging is inconsistent elsewhere. |
| ACCOUNT-12 | Cancel scheduled account deletion | Clearer explanation of what is still recoverable during the grace period. | Users may not understand whether "cancel deletion" restores everything or only stops future deletion. |
| ACCOUNT-13 | Privacy policy | Better scanability and policy consistency with in-product deletion copy. | It is a long wall of legal text, and the 30-day deletion line conflicts with the 7-day in-app flow. |
| ACCOUNT-14 | Terms of service | A short, plain-English summary before the full legal text. | Most users will skim or bounce because the page is dense and non-actionable. |
| ACCOUNT-15 | Self mentor memory | Clearer language around collection vs injection, plus stronger reassurance about what is and is not stored. | The screen is powerful but can feel creepy, overly technical, or empty in a repetitive way. |
| ACCOUNT-16 | Child mentor memory | Parent-friendly explanations of each control and likely outcomes. | Parents can edit a lot here without really understanding the tradeoffs. |
| ACCOUNT-17 | Child memory consent prompt | More detail on scope, reversibility, and safety before the yes/no choice. | "Yes, enable" vs "Not now" is too thin for a privacy-sensitive decision. |
| ACCOUNT-18 | Subject analogy preference after setup | Better discoverability after onboarding. | The feature exists, but many users will never realize they can tune explanations per subject later. |
| ACCOUNT-19 | Consent request during underage profile creation | Earlier expectation-setting before the profile is created. | A child can feel "finished" and then discover that a whole second approval journey still blocks them. |
| ACCOUNT-20 | Child handoff to parent consent request | A less awkward handoff option than physically giving the phone to a parent in the moment. | Real families will not always be together when the child signs up. |
| ACCOUNT-21 | Parent email entry, send consent link, resend, and change email | Better delivery tracking and less manual checking. | The current experience leans heavily on "check inbox, maybe spam, then come back and tap check again." |
| ACCOUNT-22 | Consent pending gate | A stronger sense of progress and fewer hard waits. | Even with preview surfaces, it still feels like a waiting room that blocks momentum. |
| ACCOUNT-23 | Consent withdrawn gate | Warmer, more explanatory recovery messaging. | For a child, this feels abrupt and punitive even if it is legally necessary. |
| ACCOUNT-24 | Post-approval landing after consent is granted | A little more orientation before the next setup step. | The celebration is nice, but the user still has to infer what happens next. |
| ACCOUNT-25 | Parent consent management for a child | More explicit explanation of deletion consequences before withdrawal. | Parents may hesitate or make a fearful choice because the cost is high and the UI is brief. |
| ACCOUNT-26 | Regional consent variants | Clearer explanation of why the threshold changed. | Different legal thresholds can feel arbitrary if the app does not explain the rule in plain language. |

## Home, Navigation, and Subject Setup

| ID | Flow | What feels missing | What will annoy or frustrate the end user |
| --- | --- | --- | --- |
| HOME-01 | Learner home with intent cards | More personalized prioritization around review due, interrupted sessions, and next-best action. | The home screen is clean but sparse, so users may still hesitate about what to do first. |
| HOME-02 | Parent gateway home | More direct parent tasks like reports, consent, and oversight shortcuts. | Two cards can make the parent area feel thinner than expected. |
| HOME-03 | Parent tabs and parent-mode navigation | Stronger visual distinction between parent context and learner context. | Shared shell/navigation can make it feel like the app changes personality depending on who is active. |
| HOME-04 | Animated splash and initial shell | Faster path to useful content when the app already knows the user. | Any extra wait before value feels expensive on repeat opens. |
| HOME-05 | Empty first-user state | More confidence-building explanation of what the first learning experience will feel like. | New users still need to imagine the product before they have earned trust in it. |
| HOME-06 | Resume interrupted session | Better resurfacing from Home and Library, not only Learn New. | Users may think their interrupted work disappeared if they do not happen to revisit Learn New. |
| SUBJECT-01 | Create subject from learner home | More guided examples and starter suggestions. | "What do you want to learn?" is broad enough to create blank-page paralysis. |
| SUBJECT-02 | Create subject from library empty state | Stronger recommendations when the library is empty. | An empty library plus a blank create form can feel like too much setup work. |
| SUBJECT-03 | Create subject from chat when classifier cannot match an existing subject | A smoother in-chat fix path. | Being pulled out of chat to define a subject interrupts the feeling of instant help. |
| SUBJECT-04 | Create subject from homework | A more seamless subject fallback that does not make homework feel like setup. | When homework turns into subject admin, the user feels the app is making them earn help. |
| SUBJECT-05 | Subject resolution and clarification suggestions | Faster commitment to the user's wording after one failed clarification round. | It can feel like the AI is arguing with the learner's intent instead of helping. |
| SUBJECT-06 | Broad subject flow: create a broad subject, then pick a book | Clearer explanation of what a "book" means in the product and faster filing. | The shelf/book metaphor is not obvious, and the filing overlay can leave users waiting without confidence. |
| SUBJECT-07 | Focused subject or focused-book flow | Shorter path to first value. | Naming a subject and then doing a full interview still feels like more onboarding before learning starts. |
| SUBJECT-08 | Language learning setup | More language choices and support for higher than B2. | Advanced learners or less common native languages can feel left out quickly. |
| SUBJECT-09 | Interview onboarding | Better resilience and recovery after stream errors or expiry. | If the interview errors or expires, users can fear their effort was wasted. |
| SUBJECT-10 | Analogy-preference onboarding | Stronger explanation of why this choice matters now versus later. | It is optional, but it still feels like one more decision before the user has seen the product work. |
| SUBJECT-11 | Curriculum review | A guided recommendation mode for users who do not want to edit the plan. | The amount of control is powerful, but it can feel like homework before the teaching begins. |
| SUBJECT-12 | View curriculum without committing to a learning session | A clearer "start here" recommendation from the read-only view. | Users can browse the plan and still not know the best first action. |
| SUBJECT-13 | Challenge curriculum, skip topics, add topics, and ask why topics are ordered this way | More progressive disclosure. | Too many edit options at once can make users second-guess the AI before they have tried the curriculum. |
| SUBJECT-14 | Placement / knowledge assessment | Better sense of length, stakes, and result meaning. | Chat-based assessment without a visible finish line can feel vague and tiring. |

## Learning, Chat, Library, Retention, and Progress

| ID | Flow | What feels missing | What will annoy or frustrate the end user |
| --- | --- | --- | --- |
| LEARN-01 | Freeform chat: "Just ask anything" | Cleaner ending with less filing/admin overhead. | Ending chat and then deciding whether to add it to the library feels like extra work after the session. |
| LEARN-02 | Guided learning session from a subject or topic | More in-context teaching of the interface itself. | There are many tools and states, so the experience can feel busy before it feels empowering. |
| LEARN-03 | First session experience | A more explicit first-session tour of chips, voice, notes, and wrap-up. | First-timers are expected to infer a lot from the UI. |
| LEARN-04 | Core learning loop | Slightly less surface complexity or stronger prioritization of what matters now. | Quick chips, parking lot, notes, topic switching, and wrap-up can all compete for attention. |
| LEARN-05 | Coach bubble visual variants | A clearer payoff for the variant beyond visual novelty. | Style changes are pleasant, but users care more about whether the teaching changed. |
| LEARN-06 | Voice input and voice-speed controls | A more obvious voice-first entry choice and clearer fallback guidance. | Voice exists, but users may discover it late or wonder when it is the "right" mode to use. |
| LEARN-07 | Session summary: submit summary or skip summary | A slightly lighter-feeling reflection step and softer skip handling. | Asking for a summary right after effort can feel like one last chore before you are allowed to leave. |
| LEARN-08 | Library root with shelves, books, and topics tabs | Simpler empty-state guidance and stronger "continue where I left off" cues. | The three-tab structure is capable, but it can feel dense and academic for younger users. |
| LEARN-09 | Subject shelf -> book selection | A more direct continuation path. | Users may want "continue learning" rather than thinking in shelves and books. |
| LEARN-10 | Book detail and start learning from a book | Removal of placeholder actions or hiding them until real. | "Coming soon" and "Not available yet" actions on long-press are guaranteed disappointment. |
| LEARN-11 | Manage subject status: active, paused, archived | Better discoverability from the main subject cards. | Useful controls hidden behind Manage can feel harder to find than they should be. |
| LEARN-12 | Topic detail | More learner-friendly language and more direct action from weak areas. | Status, interval, XP, and retention terms can feel internal rather than motivating. |
| LEARN-13 | Recall check | More emotional reassurance before the test begins. | Even with the "I don't remember" button, a recall test can feel stressful and high stakes. |
| LEARN-14 | Failed recall remediation | More warm framing around failure. | Hitting remediation after multiple misses can feel demoralizing if the language is too clinical. |
| LEARN-15 | Relearn flow: same method or different method | More coaching on how to choose a method. | Many learners do not actually know which teaching style will work best for them. |
| LEARN-16 | Retention review from library or review surfaces | More home-screen surfacing and urgency cues. | If review is not made more obvious, users will postpone it. |
| LEARN-17 | Progress overview | Stronger "do this next" guidance. | The screen is informative, but it is still mostly retrospective instead of action-driving. |
| LEARN-18 | Subject progress detail | A shortcut to the weakest or most urgent topic. | Users may admire the stats and still not know where to re-enter the subject. |
| LEARN-19 | Streak display | Clearer explanation of what counts and what breaks it. | Streaks motivate some users but pressure others if the rules feel fuzzy. |

## Homework and Parent Experience

| ID | Flow | What feels missing | What will annoy or frustrate the end user |
| --- | --- | --- | --- |
| HOMEWORK-01 | Start homework from learner home or More screen | A more unified relationship between homework and normal learning. | Homework can feel like a separate tool rather than part of one continuous mentor experience. |
| HOMEWORK-02 | Camera permission, capture, preview, and OCR | Gallery/image import, plus clearer OCR confidence feedback. | Camera-only is painful for screenshots, PDFs, or already-taken photos. |
| HOMEWORK-03 | Manual fallback when OCR is weak or fails | Faster cleanup help after OCR. | Manually editing OCR into usable problem cards is still a lot of work when the user wanted quick help. |
| HOMEWORK-04 | Homework tutoring session with multi-problem navigation | Stronger affordances around moving between problems and switching help modes. | Users may not realize how to progress through multiple problems once the session starts. |
| PARENT-01 | Parent dashboard (live or demo) | A clearer first-run "how do I link a child?" action from the dashboard itself. | Demo mode shows promise, but it can still feel like a preview without a direct path to make it real. |
| PARENT-02 | Multi-child dashboard | Slightly richer per-child summary and prioritization. | When multiple children appear together, nuance can get flattened into quick cards. |
| PARENT-03 | Child detail drill-down | Better progressive disclosure and less density on one screen. | Subjects, sessions, reports, memory, and consent all live together and can feel overwhelming. |
| PARENT-04 | Child subject -> topic drill-down | More parent-friendly interpretation of progress terms. | Completion and retention labels still assume product vocabulary more than parent vocabulary. |
| PARENT-05 | Child session / transcript drill-down | More context around what "good" or "concerning" looks like. | Seeing raw transcript plus a tiny Guided tooltip may still leave parents unsure how worried to be. |
| PARENT-06 | Child monthly reports list and report detail | A stronger in-between state before the first report exists. | Many parents will hit an empty state for a while and feel like reporting is absent. |
| PARENT-07 | Parent library view | A clearer statement of why a parent is in a learner-style library view. | Parents may expect oversight tools and instead land in a navigation surface that feels built for the child. |
| PARENT-08 | Subject raw-input audit for parents | Better surfacing of this trust feature. | The audit value is real, but it is easy to miss because it is buried inside drill-down. |
| PARENT-09 | Guided label tooltip | A broader explanation of guided help beyond the tiny tooltip. | Parents need more narrative context than a glossary popover gives them. |

## Billing and Monetization

| ID | Flow | What feels missing | What will annoy or frustrate the end user |
| --- | --- | --- | --- |
| BILLING-01 | Subscription screen and current-plan details | A simpler plan story and clearer primary action hierarchy. | The screen is informative but dense, so it feels like billing settings more than a focused decision flow. |
| BILLING-02 | Upgrade plan purchase flow | Better fallback when offerings are unavailable. | Seeing static plan descriptions instead of real purchase options feels broken even when support exists. |
| BILLING-03 | Trial / plan usage / family-pool detail states | More concrete explanations of what the limits mean in real use. | Monthly quotas and family pools are easy to read and still hard to internalize. |
| BILLING-04 | Restore purchases | More explicit confirmation of what changed after restore. | Alerts alone can feel thin for a flow users often open only when something already feels wrong. |
| BILLING-05 | Manage billing deep link | More warning that the user is about to leave the app. | App Store / Play jumps are always a context break. |
| BILLING-06 | Child paywall and notify-parent action | A less helpless child-side path. | The child can mostly only notify a parent and wait, which feels like a dead end. |
| BILLING-07 | Daily quota exceeded paywall | A faster-feeling continue path. | Being stopped mid-learning by quota is especially frustrating if relief is not immediate. |
| BILLING-08 | Family pool visibility | More per-profile attribution and recommendations. | Users can see the pool, but not easily understand who is consuming it fastest or what to do next. |
| BILLING-09 | Top-up question credits | Stronger reassurance during post-purchase processing. | Top-up polling can feel uncertain, and a missing package just turns into an error. |
| BILLING-10 | BYOK waitlist | More than a placeholder CTA. | Joining a waitlist is not satisfying for power users trying to solve a real limit today. |

## Regression and System Flows Already Captured in E2E

These are useful engineering journeys, but they are not standalone end-user product flows in the same way the sections above are. Still, each one points at a user-facing trust issue.

| ID | Flow | What feels missing | What will annoy or frustrate the end user |
| --- | --- | --- | --- |
| QA-01 | Quick smoke check | No separate UX concern beyond the core launch/auth/home flows. | If this breaks, the app feels unstable immediately. |
| QA-02 | Post-auth comprehensive smoke | No separate UX concern beyond the product flows it traverses. | Failures here usually show up as "the app feels randomly inconsistent after sign-in." |
| QA-03 | Chat classifier regression: easter / suggestion resolution | Better confidence and fewer clarification loops in subject understanding. | Users do not want the classifier to derail momentum over ambiguous topics. |
| QA-04 | Chat subject picker regression | A smoother "I meant this subject" correction in chat. | Needing to repair subject matching mid-conversation is frustrating. |
| QA-05 | Return to chat after creating a subject | A more seamless return to the original learning moment. | If the handoff back to chat is clumsy, the user feels punished for helping the app understand them. |
| QA-06 | Focused-book generation regression | Faster and more predictable subject-to-book handoff. | Waiting on focused-book generation or landing in the wrong level of content breaks trust quickly. |
| QA-07 | Tab-bar leak regression | Strong shell consistency across modal and nested routes. | Navigation chrome appearing where it should not makes the app feel glitchy and unfinished. |
| QA-08 | Parent add-child regression | Rock-solid reliability in the parent add-child journey. | Parents are especially sensitive to anything that makes profile creation feel unsafe or lossy. |
| QA-09 | Consent email URL regression | Trustworthy, resilient consent link handling. | Consent is already a patience-heavy flow, so broken or confusing links feel disproportionately damaging. |

## Summary

The strongest overall product impression is that the app already contains a lot of thoughtful learning machinery, but the user still pays a tax in handoffs:

- too many moments where the user must choose, confirm, wait, or interpret before they feel progress
- too many places where the UI says something succeeded without fully delivering the artifact or next step
- too many powerful controls that assume the user already understands the product model

If we want the mobile app to feel calmer and more trustworthy fast, the best near-term improvements are:

1. remove or complete obviously incomplete actions (`Export my data`, `Help & Support`, book long-press placeholders)
2. smooth high-friction gates (unsupported MFA, consent waiting, forced sign-out recovery)
3. reduce setup overhead before first value (subject creation, interview, curriculum editing, homework subject fallback)
4. make the next best action more obvious on Home, Progress, Library, and parent surfaces
