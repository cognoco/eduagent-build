# What You Need To Legally Launch An App For Minors — Plain-Language Guide

**Last updated:** 2026-06-05
**Scope:** EU/EEA (you are based in Norway) + UK + USA. AI tutoring app, sold to consumers, used by children.

> **Read this first.** This is a plain-language summary of real laws so *you* can see what to do and where. It is **not** legal advice. Two of the items below (the DPIA and the DPO) literally require a qualified privacy professional to sign off — budget for a few hours of a privacy lawyer's or consultant's time before launch. Everything here is traceable to a real law; the short "**Law:**" tag on each item is just so your lawyer can find it fast.

---

## How to use this document

There are **two lists**:

- **LIST A — Launch at 13+.** Everything you need to go live with a 13-and-over app. This is your main checklist.
- **LIST B — The extra load if you also let in 11–12 year olds (under-13).** Everything in List A *still applies*. List B is **only the genuinely heavier, significantly stricter things** that switch on when you allow children under 13. (The small differences that aren't worth tracking separately — I've just folded the stricter version straight into List A, so you can do it once and be covered for both.)

**Status tags used below:**

| Tag | Meaning |
|---|---|
| 🔴 **BLOCKER** | Must be done before you launch. No exceptions. |
| 🟠 **DEADLINE / IF-TRIGGERED** | Required, but either has a future deadline or only applies if a specific thing is true. |
| 🟢 **EASY / DONE** | Already handled, or a one-time settings/checkbox task. |

---

## What "data lifecycle" means

**Data lifecycle** means the whole route a child's information takes through the product: when you first ask for it, what you use it for, where it is stored, who else processes it, how long it stays there, what the parent can do with it, and how it is deleted. It is bigger than "what is in the database."

For MentoMate, think about every child-data category this way:

| Lifecycle stage | Plain-language question | What you need to decide/build |
|---|---|---|
| Collection | What do we ask before the child can use anything? | Date of birth, country/residence, parent contact/consent data, and only the minimum needed before consent. No open-ended child tutoring input before the gate is satisfied. |
| Creation | When does a real child profile exist? | For 13+, profile can exist after age/country gate and any required parent consent. For 10-12, prefer only a pending consent shell until VPC is complete. |
| Use | What do we use the data for? | Tutoring, progress, safety, family administration, support, and billing. No targeted ads or unrelated profiling. |
| Processing / sharing | Who else receives or processes it? | Clerk, email provider, store/RevenueCat, Sentry/telemetry if allowed, LLM provider, OCR/STT providers if enabled, support tooling. Each needs a processor/child-data decision. |
| Storage | Where can copies live? | Main DB, object storage/photos, transcripts, summaries, device storage, caches, logs, Sentry events, support systems, LLM/provider logs, backups. |
| Parent control | What can the parent do later? | Review relevant child data, revoke consent, delete the child profile/data, and request export/review where required. |
| Retention | How long do we keep it? | Separate retention rules for pending consent, active profile data, learning history, raw photos/audio, transcripts, support tickets, telemetry/logs, and backups. |
| Deletion / withdrawal | What happens if consent is denied, absent, or withdrawn? | Stop processing, block LLM/provider calls, delete or archive according to the policy/grace period, and keep only minimal audit/legal records. |
| Audit trail | How do we prove we did it correctly? | Store consent receipt, policy version, age/country decision snapshot, processor posture, and deletion-job evidence. Add tests for "no access before consent." |

This is why the 10+ stack is bigger than VPC: VPC proves the parent authorized something, but the lifecycle defines **what** they authorized, **where** the data goes, and **when** it disappears.

---

# LIST A — Launch at 13+

## Group 1 — People and paperwork you must have in place

### A1. 🔴 Do a "DPIA" (a written risk assessment) before launch
- **What it means:** A document where you write down what data you collect on kids, what could go wrong, and how you protect them. The law treats your app as high-risk (it profiles children with AI), so this is **mandatory, not optional** — and it must exist *before* the first child uses the app.
- **What you do:** Hire a privacy consultant/lawyer for a few hours to help you write it. It's a fill-in-the-blanks risk document. Keep it on file and update it when the app changes.
- **Where it lives:** A standalone document in your company records. You only show it to a regulator if asked.
- **Why it's first:** Nothing else is "signed off" until this exists. It's the master gate.
- **Law:** GDPR Article 35.

### A2. 🔴 Appoint a Data Protection Officer (DPO)
- **What it means:** A named person responsible for privacy. Because you continuously monitor children's learning, the law requires you to have one.
- **What you do:** Either name someone internally, or (cheaper and common for small companies) pay an **outsourced DPO service** on a monthly retainer. Publish their contact email.
- **Where it lives:** Their contact goes in your privacy policy. The appointment is an internal record. This person owns the DPIA (A1).
- **Law:** GDPR Article 37.

### A3. 🔴 Keep a "record of processing" (ROPA)
- **What it means:** A simple internal register listing what personal data you hold, why, who you share it with, and how long you keep it.
- **What you do:** A spreadsheet or template document. Your DPO/consultant can set it up in an hour.
- **Where it lives:** Internal company records.
- **Law:** GDPR Article 30.

### A4. 🔴 Have a data-breach plan (72-hour rule)
- **What it means:** If data leaks, you must tell the regulator within **72 hours**, and tell affected families if it's serious. You need a plan ready *before* it happens.
- **What you do:** Write a one-page "if we have a breach, here's who does what and who we contact" procedure. Know your regulator is **Datatilsynet** (the Norwegian data authority).
- **Where it lives:** Internal procedure document.
- **Law:** GDPR Articles 33 & 34.

### A5. 🔴 Publish a privacy policy written so a parent (and a teen) can understand it
- **What it means:** A clear, honest explanation of what you collect, why, who you send it to (including the AI providers), and what rights families have.
- **What you do:** Write it in plain language, not legalese. Include the DPO contact, the list of AI providers you use, and how to delete an account. A child-friendly summary version is expected too.
- **Where it lives:** A public web page, linked from the app and the app stores.
- **Law:** GDPR Articles 13 & 14; UK Children's Code.

### A6. 🟠 Appoint a UK representative (only if you serve UK children)
- **What it means:** Because you're outside the UK but serve UK kids, the UK wants a local contact point.
- **What you do:** Pay a "UK GDPR representative" service (cheap, off-the-shelf). *(Note: you do NOT need an EU representative — being in Norway already counts as being inside the EU system. One less thing.)*
- **Where it lives:** Their address goes in your privacy policy.
- **Law:** UK GDPR Article 27.

## Group 2 — Your sign-up and consent flow (inside the app)

### A7. 🔴 Ask for age at sign-up, and gate on it
- **What it means:** You must know roughly how old the user is, and block under-13s (at a 13+ launch).
- **What you do:** Ask date of birth (not just a yes/no "are you 13?"). If under 13 → politely refuse. **Count how many under-13s try** — that number tells you later if it's worth building the 11+ version.
- **Where it lives:** The sign-up / onboarding screens.
- **Law:** GDPR Article 8; app store rules.

### A8. 🔴 Get verified parent permission for 13–15 year olds in "age-16" countries
- **What it means:** The "you can consent for yourself" age is **16 in Norway, Germany, France, Netherlands** (and others), and **13 in Ireland, Spain** (and others). So a flat "13+" is **not** enough for 13–15 year-olds in the age-16 countries — you need a parent to approve.
- **What you do:** For users who are 13–15 *and* in an age-16 country, add a step that emails/contacts a parent to approve. Email-link confirmation is acceptable here (the heavy "verifiable" version is only for under-13 — see List B).
- **Where it lives:** The sign-up flow, triggered by age + country.
- **Law:** GDPR Article 8(1)–(2).

### A9. 🔴 Build consent as a real choice — not buried in Terms & Conditions
- **What it means:** Your legal ground for profiling a child **cannot be "it's in our contract."** Regulators have said that doesn't work for personalising/improving a service. It must be **consent** that the family actively gives.
- **What you do:** A clear, separate "I agree to [the learning data use]" step — not a pre-ticked box, not hidden in the T&Cs. Record when/what they agreed to.
- **Where it lives:** The sign-up flow + your consent records.
- **Law:** GDPR Article 6 (consent, not contract).

### A10. 🟠 Tell users they're talking to an AI (deadline: 2 August 2026)
- **What it means:** The EU AI law will require chatbots/tutors to make clear the user is talking to an AI, not a human — and the bar is *higher* for children.
- **What you do:** Add a clear "this is an AI tutor" indicator. Not enforced until **2 Aug 2026**, but build it in now.
- **Where it lives:** The chat/tutor screen.
- **Law:** EU AI Act Article 50.

## Group 3 — Your deal with the AI providers (contracts + what you send them)

### A11. 🔴 Sign a proper data contract with each AI provider, on the business tier
- **What it means:** When a child's words go to Google/OpenAI/Anthropic, those companies are your "data processors." You must have a signed data agreement (a "DPA") with each. **Consumer/free tiers don't include one — you must use the business/enterprise tier.**
- **What you do:** Use the paid/business product (e.g. Google Vertex, OpenAI's business tier via OpenAI Ireland, Anthropic's commercial tier) and accept/sign their DPA. Keep a list of which providers (and their sub-contractors) touch the data.
- **Where it lives:** A contract you accept in each provider's console / legal page. Keep copies.
- **Law:** GDPR Article 28.

### A12. 🔴 Do a "transfer check" before sending kids' data to the US
- **What it means:** Sending EU children's data to US companies needs extra paperwork unless the provider is certified under the EU-US data deal ("DPF"). If they're not certified, you must do a short written **transfer risk check (TIA)** and rely on standard EU contract clauses.
- **What you do:** For each provider, check: are they on the official DPF certified list? If **yes** → lighter. If **no** (OpenAI was reported *not* listed) → you need standard contractual clauses + a short transfer assessment. Your DPO/consultant does this.
- **Where it lives:** A short assessment document per provider, kept on file.
- **Law:** GDPR Chapter V (Articles 44–46); "Schrems II" ruling.

### A13. 🔴 Send the AI providers as little personal data as possible
- **What it means:** Don't send a child's real name or anything you don't need. Minimise.
- **What you do:** Strip names and identifiers from what goes to the AI. For voice, send **only the text transcript** — never the raw audio for "mood/emotion" analysis (see A14).
- **Where it lives:** The code that builds the AI request (your team handles this — flag it as a requirement).
- **Law:** GDPR Article 5 (data minimisation).

### A14. 🟢 Never detect emotion from a child's voice
- **What it means:** Reading emotion from text is fine and legal. Reading emotion from *voice tone or face* is a high-risk/borderline-banned category. Avoid it entirely and you stay clear of the worst AI-law rules.
- **What you do:** Make a firm product rule: voice is for transcription only. Don't add "detect if the child is frustrated from their voice" features. Check any voice library you use doesn't do hidden emotion scoring.
- **Where it lives:** A product/design rule + a check on third-party voice tools.
- **Law:** EU AI Act Article 5(1)(f) / Annex III.

## Group 4 — How the app must be designed (children's design rules)

### A15. 🔴 Apply "child-friendly by default" design (UK Children's Code)
- **What it means:** The UK has 15 standards for any app likely used by under-18s: highest-privacy settings on by default, collect the minimum, no sharing by default, no location tracking by default, explain things in kid-friendly terms. **This binds you because you serve UK children, even from Norway.** The UK is actively fining companies for getting this wrong.
- **What you do:** Default every privacy setting to the safest option. Turn off any data sharing/tracking unless a family opts in. Have your DPO run the 15-standard checklist.
- **Where it lives:** Default settings in the app + a checklist document.
- **Law:** UK Age-Appropriate Design Code (Children's Code).

### A16. 🔴 No manipulative or pressuring design aimed at kids
- **What it means:** No "your streak will die!" pressure, no tricks that push a child to keep using or to buy. Disengaging must be easy and guilt-free.
- **What you do:** Review your reminders, streaks, and prompts. Remove anything that pressures or guilt-trips a child. Make "stop / leave" as easy as "continue."
- **Where it lives:** Product/design review of all nudges and notifications.
- **Law:** EU AI Act Art 5; EU consumer rules; UK Children's Code.

### A17. 🔴 Use real age checking, not just "tick this box"
- **What it means:** For a higher-risk app, a regulator won't accept "the user said they were old enough" as your only age check.
- **What you do:** Ask for date of birth (A7), and treat a protection-lowering answer (claiming to be older) cautiously. You don't need invasive ID checks for a 13+ app, but a plain self-tick alone isn't enough.
- **Where it lives:** The sign-up flow.
- **Law:** UK Children's Code; EU regulator guidance.

## Group 5 — App store setup

### A18. 🔴 Declare your age group and tick the compliance boxes in both stores
- **What it means:** Apple and Google make you declare your target age and **promise in writing** that you comply with COPPA and GDPR. Get it wrong → they reject or pull the app.
- **What you do:** In **Google Play Console** and **Apple App Store Connect**, set the age rating / target audience and complete the kids/privacy declarations honestly.
- **Where it lives:** Play Console + App Store Connect settings.
- **Law:** Google Play Families policy; Apple App Store rules.

### A19. 🟠 Adopt the new app-store age-signal tools for certain US states
- **What it means:** Some US states (Texas, Utah, Louisiana…) now require app stores to share an age signal and get parental consent for minors, with Apple/Google rolling out APIs (from Jan 2026) that developers must use.
- **What you do:** If you serve those states, integrate the platform age-signal APIs your developer connects. Watch this space — it's expanding.
- **Where it lives:** App integration (developer task) + store settings.
- **Law:** US state "App Store Accountability Acts."

## Group 6 — Money and subscriptions

### A20. 🔴 The paying account must be an adult's
- **What it means:** A child can't legally be tied to a paid subscription. The subscription/billing must sit with an adult.
- **What you do:** Make sure the account that pays is the parent/adult owner. Don't let a child set up their own paid plan.
- **Where it lives:** Your account/billing model.
- **Law:** Minors' contract-capacity law (e.g. Norway's vergemålsloven).

### A21. 🔴 Make cancellation and pricing crystal clear
- **What it means:** You must clearly show the price, that it auto-renews, and how to cancel — and cancelling must be easy.
- **What you do:** Show full price + renewal terms before purchase; link straight to the store's cancel screen; don't obstruct cancelling. (When billing runs through Apple/Google, the actual money is theirs, but **the clear disclosure is still your job**.)
- **Where it lives:** Your purchase/upgrade screens + settings.
- **Law:** US ROSCA + state auto-renewal laws (e.g. California); EU/Norway consumer rules.

### A22. 🔴 Don't market or pressure-sell to children
- **What it means:** You can't aim "buy now!" pressure at kids.
- **What you do:** Keep upgrade prompts neutral and aimed at the adult. No urgency/pressure language on children's screens.
- **Where it lives:** Copy on upsell/upgrade screens.
- **Law:** Norway marketing law (markedsføringsloven); EU consumer rules.

## Group 7 — The one big decision you need to make

### A23. 🟠 Decide: are you collecting health / learning-disability signals?
- **What it means:** If your app records or *infers* things like dyslexia, ADHD, or a disability, that's "sensitive data" with much stricter rules — you'd need explicit consent and a heavier assessment. Even inferring it counts.
- **What you do:** **Make a clear product decision.** If you avoid health/disability labels, you stay in the lighter lane. If you want them, tell your DPO — it adds an explicit-consent step and expands the DPIA.
- **Where it lives:** A product decision + (if yes) extra consent + DPIA section.
- **Law:** GDPR Article 9.

---

# LIST B — Extra requirements ONLY if you also allow 11–12 year-olds (under-13)

> **Everything in List A still applies.** Below are the genuinely **heavier** things that switch on the moment you accept children **under 13** — this is the US **COPPA** regime plus stricter store/state rules. This is why launching 13+ first is so much simpler: the items below are the real extra cost.

### B1. 🔴 Get *verifiable* parent consent BEFORE collecting anything (the heavy kind)
- **What it means:** For under-13s, a simple parent email isn't enough. US law requires a **stronger, verified** parental consent (e.g. payment-card check, ID check, signed form) *before* you collect any data from the child.
- **What you do:** Integrate a specialist **verifiable parental consent (VPC) vendor** (e.g. PRIVO, k-ID). This is a paid integration with per-check fees.
- **Where it lives:** A new, heavier consent step in sign-up + a vendor contract.
- **Law:** US COPPA (16 CFR Part 312).

### B2. 🔴 Get separate parent opt-in to send the child's data to the AI providers
- **What it means:** Sharing an under-13's data with outside companies (your AI providers) needs its **own** separate parental consent, on top of B1. And using that data to **train AI models is essentially never allowed** for children.
- **What you do:** Add a distinct "I allow my child's data to be sent to [AI providers]" consent. Make sure your provider contracts (A11) guarantee **no training** on the data.
- **Where it lives:** A separate consent toggle + provider contract terms.
- **Law:** US COPPA (2025 amended Rule — third-party disclosure consent).

### B3. 🔴 Write a formal information-security program
- **What it means:** A written security program with a named owner and a yearly review — not just "we use good security."
- **What you do:** Produce the document, name who owns security, schedule the annual risk review.
- **Where it lives:** A formal internal document.
- **Law:** US COPPA (2025 amended Rule); compliance deadline already passed (22 Apr 2026), so it's required day-one for under-13.

### B4. 🔴 Write and enforce a strict delete-when-done policy
- **What it means:** For under-13 data you must have a written rule that you keep it only as long as needed and then delete it. No keeping it indefinitely.
- **What you do:** Write the retention policy; make sure the app actually deletes per that schedule.
- **Where it lives:** A written policy + deletion behaviour in the app.
- **Law:** US COPPA (2025 amended Rule — retention/deletion).

### B5. 🔴 Turn country-detection back on
- **What it means:** COPPA is a US (under-13) rule, so you need to know who is a US under-13 to apply it. (You currently treat everyone the same, location-blind.)
- **What you do:** Re-introduce location/region detection so you can route under-13 US users into the COPPA flow.
- **Where it lives:** App logic (developer task).
- **Law:** Needed to apply US COPPA correctly.

### B6. 🔴 Meet the stricter store "Kids" rules
- **What it means:** Apps that actually serve under-13s fall into Apple's **Kids Category** and Google's stricter kids rules — which typically **ban third-party ads and most third-party analytics** and tighten what SDKs you can use.
- **What you do:** Remove/disallow third-party ad and analytics tools for the kids experience; re-check every embedded SDK is kids-policy-approved.
- **Where it lives:** App build + store category settings.
- **Law:** Apple Kids Category; Google Play Families (child-directed).

### B7. 🟠 Stronger US state age-verification for under-13
- **What it means:** The US state app-store and minor-protection laws (A19) get stricter for under-13 — more states, firmer parental-consent requirements.
- **What you do:** Confirm the platform age-signal/parental-consent integrations cover the under-13 case for the states you serve.
- **Where it lives:** App integration + store settings.
- **Law:** US state App Store Accountability Acts.

### B8. 🟠 Get a bounded COPPA legal review (and consider a "Safe Harbor")
- **What it means:** Going under-13 is the point where a short, specific US legal review is worth paying for — and joining an FTC-approved **"Safe Harbor"** program (PRIVO, kidSAFE) can make compliance cheaper and lower your risk.
- **What you do:** One-time legal engagement (low-thousands to low-five-figures) + optionally join a Safe Harbor scheme.
- **Where it lives:** External legal/consultant engagement.
- **Law:** US COPPA framework.

---

# Suggested order of attack

**For a 13+ launch, do these first (they gate everything else):**
1. Appoint the DPO (A2) → they drive the DPIA (A1).
2. Make the Art 9 decision (A23) — it changes how heavy A1 is.
3. Sign provider data contracts on business tier + transfer checks (A11, A12).
4. Build the consent flow correctly: age gate, parent consent for 13–15, real consent (A7, A8, A9).
5. Privacy policy + UK representative + ROPA + breach plan (A5, A6, A3, A4).
6. Design pass: child-friendly defaults, no manipulation, voice transcription-only (A14, A15, A16).
7. Store declarations + subscription/cancellation/marketing (A18, A20, A21, A22).
8. Build in the "you're talking to an AI" notice before 2 Aug 2026 (A10).

**Before adding 11+:** the whole of List B — with B1 (verifiable parental consent vendor) and B2 (separate AI-sharing consent + no-training guarantee) being the big, costly ones.

---

*Sources behind this guide: GDPR Articles 5, 6, 8, 9, 27, 28, 30, 33, 34, 35, 37, 44–46; EU AI Act Articles 5, 50; UK Age-Appropriate Design Code (Data Protection Act 2018) + Data (Use and Access) Act 2025; US COPPA (16 CFR Part 312, 2025 amended Rule); US ROSCA + state auto-renewal and App Store Accountability Acts; Norway angrerettloven & markedsføringsloven. Cross-checked against EDPB, ICO, CNIL, FTC and EUR-Lex primary materials, June 2026.*
