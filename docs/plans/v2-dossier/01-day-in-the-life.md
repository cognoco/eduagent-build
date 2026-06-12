# Day in the Life — four honest scenes

> Scripts of what the V2 product, as currently specced, actually does — written for
> the launch reality: **the parent is the customer** (bought it for homework help +
> insight), **the teen (13+) is a conscript** (sent by the parent, wants homework
> done, did not ask for a relationship). Verbatim copy is quoted from the spec/plans.
> Every place the documented path runs out is marked **[GAP n]** and listed in the
> Gap register at the end. Availability flags say which build stage a beat needs.

---

## Scene 1 — Jakub, 13. Day one. The conscript.

*His mother installed the app and told him to use it for his math homework. He opens
it expecting another school app. Skepticism: maximum.*

**[GAP 1]** Between sign-up/consent and the first real screen, nothing is specified.
The script resumes at the first designed frame:

He lands on the **Mentor tab** — not a dashboard, not a setup wizard. One warm card
owns the screen (spec §3.1, the cold-start card):

> **"Hi — what do you want to work on?"**
> *🎤 Tell me anything…*
> Not sure? Try one of these — or just type:
> `[ 📷 Homework help ]` `[ ✨ Learn something ]` `[ 💬 Ask a question ]`

He taps **Homework help**. The chip doesn't fire an action — it **types its words
into the input** and lights the send arrow; *he* presses send (training-wheels by
design: the chip teaches him the input is the app). The reply is instant — template,
no LLM wait:

> **"Sure thing — snap a picture of it 📷. Or if you'd rather just ask, tell me
> about it here."**

— with the camera as a big tappable affordance inside the reply. No "what subject
is it?" preamble. He snaps the worksheet.

**[GAP 2]** What he sees next is the *legacy* homework flow (`homework/camera.tsx`,
reused unmodified): photo upload, help-me vs check-answer, the homework session. It
works today — but no V2 doc describes how it looks or feels inside the new shell.
The first ten minutes of the conscript's experience run through the oldest unredesigned
screen in the product.

He gets help, the session winds down. **[GAP 3]** The wrap-up: the mentor is supposed
to say, once, in character — *"next time, just tell me what you need — anything"* —
and the first micro-celebration should land here. But the wrap-up surface (the old
3-screen exit funnel dissolving into a conversation turn) is designed in no plan.
As specced today, day one **ends on an undesigned screen**.

What he does NOT see: XP, streaks, points, a setup form, a subject picker, a tour.
Because real state now exists (first completed exchange), the cold-start card has
self-destructed forever — tomorrow he gets a real feed.

**Needs:** S1 (cold-start card, input bar) + existing homework flow. Gaps 1–3 are
the day-one risk surface.

---

## Scene 2 — Jakub. Day eight. Does the feed earn its place?

*This is the scene the whole bet rides on: the camera alone cannot cause an
unprompted return. Only the feed can.*

A push arrives (re-routed to the Mentor feed in S1) or he opens the app on his own.
The feed greets him with **one anchor + at most two smaller cards** (P6 budget):

- **Anchor:** *"Patch up linear equations — 5 min"* (`retention_due` — the spaced-
  repetition engine found a wobbly concept from his homework session). Every card is
  an action, never an announcement; every card is declinable.
- Module: *resume Tuesday's unfinished session* (`unfinished_session`).
- Module: a quiet `ledger_moment` — template-rendered, no LLM.

A calm **"on track" badge** sits where a streak counter would (no number, no fire
emoji). He taps the anchor, does the 5-minute review — and the noticing loop fires
(spec §2.1, all four channels):

1. The mentor closes its own loop: *"I asked you to patch up linear equations — you
   did, and it held. Last week you needed three hints; today, none."*
2. The anchor's arc **advances under his finger** — the node lights, "review due"
   steps toward "mastered," in the same beat (truth-caused, not decorative).
3. The plan audibly upgrades: *"Since that held, we can skip the easy run and go
   straight at the hard part Thursday."*
4. The celebratory message *arrives joyfully* — bubble motion, a small warm burst.
   (Interim carrier: the conversation surface. The mentor *character* is a separate,
   ruled brand project — no V2 beat waits on it.)

Credit goes to his choice, never to obedience: *"you decided to tackle it today;
that was your call, and it paid off."*

**The Bet-Sheet observable lives here:** if Jakub opens the app without being told
to and taps the anchor, the feed earned its place. If he only ever arrives via the
camera, V2 validly ends at a measured S2 (kill rule, Layer 3).

**Needs:** S0 (built ✓) + S1. **[GAP 4]** What the feed ranks for a *nearly* cold
profile (one subject, one session) is unspecified — day-two-to-seven feed content
is S0 ranking behavior nobody has described. **[OPEN §13.7]** All proposal copy
above uses the calm/invitational register; the assertiveness dial is unruled
(recommendation: adopt the spec's calm default — ledger).

---

## Scene 3 — Petra, 41. Day one. The customer.

*She saw "homework help — get your evenings back, know how school is going." She
installs first.*

⚠️ **Availability inversion (SURPRISE 1):** everything in this scene is **S4/S5 —
the identity-blocked back half**. If V2 launches at S1–S3, Petra's experience is
the **legacy V1 surfaces** (parent home, Recaps tab, proxy mode) — functional, but
none of what follows. This scene is the *designed* state.

Her Mentor tab shows the **variant-zero anchor**: `[ + Add my child ]`, with
positive-only trust copy (spec §3.2):

> *"You'll see her recaps, progress and wins. And she always knows what you see."*

Below it, a **greyed ghost-preview recap** — *"Example — this is what you'll see
after Jakub's first session"* — so the empty state sells the destination. One
question routes the tier: *"Does Jakub use his own phone and login?"* → at 13+,
yes → the **Approve** path: Jakub gets his own account, she approves the link in a
**linking ceremony where both sides see the same contract** (never one-tap).

Her card for Jakub then **morphs through a lifecycle** (one card per child, never a
pile): `invite sent → review & approve → "Help Jakub get started" → warm feed`.
If he stalls, the **Kickstart** beat: she suggests a topic and it arrives as a
fillable chip **in his cold-start card** — `[ 💛 Petra suggested: equations ]` —
which types the words into *his* input for *him* to send. Her nudge becomes his
choice. **[GAP 6]** How that chip sits among his three example chips is one line
in the spec — thin, but not script-breaking.

If Jakub ignores the app for a week, her card **de-escalates, never escalates**
(spec §3.2 stale-idle arc): honest status (*"most teens start within the first
week, usually when homework gets hard"*) → "start together" → "try it yourself" —
and a promise that genuinely fires: *"We'll let you know the moment Jakub starts."*
What she is never shown: whether he opened the app and closed it. Parent-visible
state is **binary** (started / hasn't) — an explicit anti-surveillance choice she
should hear about at the sales pitch, not discover.

**Needs:** S4/S5 + identity cutover (CUT-A/CUT-B). At launch without them: V1
surfaces carry this promise.

---

## Scene 4 — Petra. Week one. The insight promise.

*"Free time + insight into the child's learning" — the second half of what she paid
for.* Same availability flag as Scene 3 (S4/S5).

Her shell is the same three tabs, with a **scope chip**: `[ Support hub ] [ Jakub ]`
(+ `[ Me ]` only if she ever studies herself). In **Jakub's scope**:

- **Subjects:** his actual subject hubs, **structurally rendered** — chapters,
  mastery states, activity, next-up. The same component he sees, server-masked:
  **no notes, no chat, no artifacts** — not hidden client-side; no read path exists.
- **Mentor:** her feed *about* him — attention items, milestones. The input bar
  talks to **her** mentor *about* Jakub: *"how is Jakub really doing in math?"* →
  a curated, pedagogically framed interpretation of his data — not raw exhaust,
  and never his conversations.
- **Journal:** the **shared record** — every report ever made to her about him,
  and he can see the same facts rendered for him (two-way transparency: nothing is
  said about him behind his back).

What she can never see, by design (spec §6.1): his notes, his mentor-memory, his
transcripts — and his confided self-doubt is **never reported in the first place**
(sealed class; server-side allow-list). If she doesn't trust the summary, the
**appeal affordance**: a logged "detailed attention report" — richer structure,
fuller write-up, still no artifacts. Safety escalations cross every wall; his
Journal carries the kid-facing line: *"your space is private, unless you're not
safe."*

**The second Bet-Sheet observable lives here:** can Petra answer "what did Jakub
actually work on this week, and is it going okay?" from the app alone, in under a
minute? That — plus Scene 2's unprompted return — is the whole launch promise made
testable.

---

## Gap register (all eight, from the spec/plan audit)

| # | Gap | Where it bites | Severity |
|---|---|---|---|
| 1 | Onboarding/sign-up → cold-start card handoff unspecified | Scene 1 opening | **Script-breaking** |
| 2 | Post-camera homework round-trip never described in V2 terms (legacy screen reused silently) | Scene 1 core | **Script-breaking** |
| 3 | First-session wrap-up surface undesigned (teach line + first celebration have no home) | Scene 1 ending | **Script-breaking** |
| 4 | Near-cold feed ranking (days 2–7, one subject) unspecified | Scene 2 | Medium |
| 5 | "Learn something" / "Ask a question" chip paths unscripted (first-conversation-creates-first-subject is not designed) | Scene 1 alt paths | Medium |
| 6 | Kickstart chip's rendering inside the kid's cold-start card is one line | Scene 3 | Low |
| 7 | Mentor character: ruled but unscheduled; all warmth rides on bubble motion + copy until the brand project exists | Scenes 1–2 | Watch |
| 8 | §13.7 assertiveness dial unruled; one calm copy set assumed everywhere | Scene 2 | Low (recommendation exists) |

Gaps 1–3 are exactly where the Layer-2 prototype should force decisions: the
prototype cannot be built without choosing what those frames show — which is the
cheapest possible place to choose.

Last updated: 2026-06-12
