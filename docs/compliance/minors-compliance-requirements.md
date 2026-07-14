# What You Need To Legally Launch An App For Minors — Plain-Language Guide

> **STATUS UPDATE (2026-07-14): LIVE COMPLIANCE CHECKLIST; IMPLEMENTATION ANNOTATIONS NEED REFRESH.** Launch is ratified at 13+ and the under-13 managed tier is dormant. Current consent decisions are jurisdiction/regime policy-engine owned, not the older location-blind ≤16 posture below. BYOK waitlist erasure is implemented and the legacy organizations-table gap no longer applies. Retention/short-quote age-out is tracked by **`WI-1194` — retention closure; active backlog**; country/store hard blocks by **`WI-1115` — availability controls; active**. Provider eligibility comes from `docs/registers/llm-models/master.md`. External counsel/store/DPA/TIA gates remain live. Verify or capture a dedicated measurable under-13 rejection event.

**Last updated:** 2026-06-07
**Scope:** EU/EEA (you are based in Norway) + UK + USA. AI tutoring app, sold to consumers, used by children.

> **2026-06-07 change:** added **A24** (storage limitation, proportionality, and purpose-fencing of the persistent learning memory), prompted by a code-verified retention/erasure audit — see `docs/audits/2026-06-07-data-retention-and-erasure-audit.md`. That audit confirmed account-deletion cleanly cascades the whole learning memory, but surfaced three live issues: the Clerk login identity is never deleted in-app (Art 17 gap), verbatim learner answers survive the "30-day transcript" purge indefinitely (misleading-notice risk), and the 30-day purge sits behind an env flag that defaults OFF and must be verified in production.
>
> **2026-06-08 update (historical):** the Clerk Art 17 gap was fixed and the purge flag confirmed. The A24-b age-out residue is now tracked by WI-1194. Later identity-v2 deletion work implemented BYOK waitlist erasure and removed the obsolete organizations-table premise.

> **Read this first.** This is a plain-language summary of real laws so *you* can see what to do and where. It is **not** legal advice. Two of the items below (the DPIA and the DPO) literally require a qualified privacy professional to sign off — budget for a few hours of a privacy lawyer's or consultant's time before launch. Everything here is traceable to a real law; the short "**Law:**" tag on each item is just so your lawyer can find it fast.

---

## How to use this document

There are **two lists**:

- **LIST A — Launch at 13+.** Everything you need to go live with a 13-and-over app. This is your main checklist.
- **LIST B — The extra load if you also let in 10–12 year olds (any under-13 child).** Everything in List A *still applies*. List B is **only the genuinely heavier, significantly stricter things** that switch on when you allow children under 13. (The small differences that aren't worth tracking separately — I've just folded the stricter version straight into List A, so you can do it once and be covered for both.)

**Status tags used below:**

| Tag | Meaning |
|---|---|
| 🔴 **BLOCKER** | Must be done before you launch. No exceptions. |
| 🟠 **DEADLINE / IF-TRIGGERED** | Required, but either has a future deadline or only applies if a specific thing is true. |
| 🟢 **EASY / DONE** | Already handled, or a one-time settings/checkbox task. |

---

## Who and where — reading each item's scope

Two fair questions come up when reading the lists: *"isn't this one only for the USA?"* and *"isn't this one only for teens who can't consent for themselves?"* So every item below carries two extra tags:

- **Where:** which countries or users switch the duty on — and whether you can make it go away by not serving a market.
- **Who:** which user category triggers it — everyone, all minors (under-18), only teens below their country's self-consent age, or only under-13s.

### The four rules that explain almost every tag

1. **GDPR follows the company, not the user.** You are established in Norway (inside the EEA), so the GDPR paperwork — DPIA, DPO, ROPA, breach plan, privacy policy, consent quality, provider contracts, minimisation, the Article 9 decision — applies to everything you do, for every user on Earth. Even a hypothetical US-only launch would not remove a single one of these. They are tagged **Everywhere (company-level)**.
2. **COPPA follows the US child, not the company.** Being Norwegian does not exempt you: one US-resident under-13 in the app and COPPA applies in full. That is why nearly all of List B is, in practice, "US under-13" law — and why a strict under-13 block keeps it dormant.
3. **UK and EU items follow their users.** The UK representative (A6) and the UK Children's Code (A15) bind you because you serve UK users; the EU AI Act items (A10, A14) bind you because you serve EU users. Skip those markets and these genuinely fall away — they are the only items in List A that work like that.
4. **Store rules follow the stores.** Apple and Google policies (A18, B6) apply worldwide, whatever the law of the user's country says — and are often stricter than the law.

### The user-category ladder

| Category | Who they are | What they add on top of the row above |
|---|---|---|
| **Adult (18+)** | Self-serve user | Baseline privacy + consumer law |
| **Self-consenting teen** | 13+ and at/above their country's consent age (Norway & UK: 13 · Spain: 14 · France: 15 · Germany/Netherlands/Ireland: 16 · USA: 13 for privacy purposes) | The "all minors" design/marketing/billing items — but **no** parent-consent step is legally required |
| **Non-self-consenting teen** | 13+ but *below* their country's consent age (e.g. a 14-year-old in Germany) | Parent/guardian authorization — **A8 is the only List-A item that exists purely for this category** |
| **Under-13** | Below 13, anywhere | All of List B. US-resident: full COPPA (heavy VPC). Elsewhere: parent authorization of the lighter GDPR kind |

### Scope at a glance

| Scope bucket | Items |
|---|---|
| **Everywhere — company-level GDPR** (your Norwegian seat carries these into every market; no launch shape removes them) | A1, A2, A3, A4, A5, A9, A11, A13, A23, A24 |
| **Everywhere — universal law or store rules** | A7, A16, A17, A18, A20, A21, A22 |
| **EEA/UK data leaving for the US** (your AI providers) | A12 |
| **EU users only** | A10, A14 |
| **UK users only** | A6, A15 |
| **US users only** (specific states — and note: covers ALL minors under 18, not just young kids) | A19 |
| **Non-self-consenting teens only** (countries with consent age above 13) | A8 |
| **US under-13s only** | B1, B2, B3, B4, B7, B8 |
| **All under-13s, everywhere** (infrastructure + store policy) | B5, B6 |

Two honesty notes:

- Both lists are conditional — "if you launch at this floor, this is what applies." They do **not** record the age-floor decision itself; that is tracked in the 2026-06-04 minutes and is not yet cemented.
- One deliberate over-compliance to keep in mind: the current build asks parent consent for **everyone ≤16, location-blind** — stricter than the law (a Norwegian or UK 13-year-old may self-consent). The **Where/Who** tags below describe the *legal minimum*, not today's product behaviour.

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
| Retention | How long do we keep it? | Separate retention rules for pending consent, active profile data, learning history, raw photos/audio, transcripts, support tickets, telemetry/logs, and backups. **Code-verified state (2026-06-07; purge confirmed live 2026-06-08):** raw transcripts purge at 30 days — the `RETENTION_PURGE_ENABLED` flag defaults OFF but is confirmed `true` in prod Doppler; the persistent **learning memory** (notes, summaries, extracted facts, mastery, challenge-round quotes) currently has **no retention rule and no age-out** — see A24 and the audit doc. |
| Deletion / withdrawal | What happens if consent is denied, absent, or withdrawn? | Stop processing, block LLM/provider calls, delete or archive according to the policy/grace period, and keep only minimal audit/legal records. **Code-verified state (2026-06-07; updated 2026-06-08):** account deletion cleanly FK-cascades the entire learning memory (good) **and now also deletes the Clerk login identity** (R1 resolved, commit `9137c7961`). Still surviving: an orphaned org row and BYOK-waitlist emails — see A24 / audit doc item R3. |
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
- **Where:** Everywhere (company-level). GDPR follows your Norwegian seat, so this is required no matter which countries you serve; UK GDPR expects the same document for UK users — one DPIA covers both.
- **Who:** One document covering all users. It is mandatory (not just best practice) because you profile minors with AI.
- **Law:** GDPR Article 35.

### A2. 🔴 Appoint a Data Protection Officer (DPO)
- **What it means:** A named person responsible for privacy. Because you continuously monitor children's learning, the law requires you to have one.
- **What you do:** Either name someone internally, or (cheaper and common for small companies) pay an **outsourced DPO service** on a monthly retainer. Publish their contact email.
- **Where it lives:** Their contact goes in your privacy policy. The appointment is an internal record. This person owns the DPIA (A1).
- **Where:** Everywhere (company-level) — required by your Norwegian establishment regardless of which markets you open.
- **Who:** Triggered by large-scale, ongoing monitoring of learners — minors make it unavoidable. One DPO serves all users.
- **Law:** GDPR Article 37.

### A3. 🔴 Keep a "record of processing" (ROPA)
- **What it means:** A simple internal register listing what personal data you hold, why, who you share it with, and how long you keep it.
- **What you do:** A spreadsheet or template document. Your DPO/consultant can set it up in an hour.
- **Where it lives:** Internal company records.
- **Where:** Everywhere (company-level).
- **Who:** All users — one register covering every data category, adult and child.
- **Law:** GDPR Article 30.

### A4. 🔴 Have a data-breach plan (72-hour rule)
- **What it means:** If data leaks, you must tell the regulator within **72 hours**, and tell affected families if it's serious. You need a plan ready *before* it happens.
- **What you do:** Write a one-page "if we have a breach, here's who does what and who we contact" procedure. Know your regulator is **Datatilsynet** (the Norwegian data authority).
- **Where it lives:** Internal procedure document.
- **Where:** Everywhere (company-level). The 72-hour rule runs to Datatilsynet; if US users are affected, US state breach-notification laws add their own notices on top.
- **Who:** All users.
- **Law:** GDPR Articles 33 & 34.

### A5. 🔴 Publish a privacy policy written so a parent (and a teen) can understand it
- **What it means:** A clear, honest explanation of what you collect, why, who you send it to (including the AI providers), and what rights families have.
- **What you do:** Write it in plain language, not legalese. Include the DPO contact, the list of AI providers you use, and how to delete an account. A child-friendly summary version is expected too.
- **Where it lives:** A public web page, linked from the app and the app stores.
- **Where:** Everywhere — GDPR requires it company-wide, the UK Children's Code shapes it for UK kids, and US law and both app stores expect the same public policy.
- **Who:** All users; the child-readable summary is for the minors.
- **Law:** GDPR Articles 13 & 14; UK Children's Code.

### A6. 🟠 Appoint a UK representative (only if you serve UK children)
- **What it means:** Because you're outside the UK but serve UK kids, the UK wants a local contact point.
- **What you do:** Pay a "UK GDPR representative" service (cheap, off-the-shelf). *(Note: you do NOT need an EU representative — being in Norway already counts as being inside the EU system. One less thing.)*
- **Where it lives:** Their address goes in your privacy policy.
- **Where:** UK only — and only because you serve UK users. Skip the UK at launch and this genuinely falls away.
- **Who:** All UK users (the duty is not child-specific — it triggers on serving the UK at all).
- **Law:** UK GDPR Article 27.

## Group 2 — Your sign-up and consent flow (inside the app)

### A7. 🔴 Ask for age at sign-up, and gate on it
- **What it means:** You must know roughly how old the user is, and block under-13s (at a 13+ launch).
- **What you do:** Ask date of birth (not just a yes/no "are you 13?"). If under 13 → politely refuse. **Count how many under-13s try** — that number tells you later if it's worth building the 10+ / under-13 version.
- **Where it lives:** The sign-up / onboarding screens.
- **Where:** Everywhere. One gate does triple duty: GDPR Article 8 in the EU/EEA, the neutral under-13 screen the US expects, and the stores' global rules.
- **Who:** Every user at sign-up, whatever their age.
- **Law:** GDPR Article 8; app store rules.

### A8. 🔴 Get parent/guardian authorization where local self-consent age is higher
- **What it means:** The "you can consent for yourself" age varies by country. Current checked examples: **Norway and UK = 13; Spain = 14; France = 15; Germany, Netherlands, and Ireland = 16.** So a flat "13+" is **not** enough everywhere — some 13–15 year-olds still need a parent/guardian to approve.
- **What you do:** At launch, the simple safe version is to require parent/guardian authorization through 16 unless and until you build country-specific consent rules. Email-link confirmation can be acceptable for this GDPR-style teen consent flow if counsel agrees; the heavier COPPA-grade VPC version is only mandatory for under-13 US children — see List B.
- **Where it lives:** The sign-up flow, triggered by age + country.
- **Where:** Only in countries whose self-consent age is above 13 — in this doc's scope that means the EU higher-age states (Spain 14; France 15; Germany/Netherlands/Ireland 16). NOT needed in Norway or the UK (both 13), and the US has no federal version (US teen rules live in A19). Other regions add similar gates (Quebec, South Korea, Australia…) — see the country matrix in the 2026-06-04 minutes.
- **Who:** ONLY non-self-consenting teens — 13+ but below their country's consent age. This is the single List-A item that exists purely for that category. (Today's build over-complies: parent consent for everyone ≤16, location-blind — a product simplification, not a legal demand.)
- **Law:** GDPR Article 8(1)–(2).

### A9. 🔴 Build consent as a real choice — not buried in Terms & Conditions
- **What it means:** Your legal ground for profiling a child **cannot be "it's in our contract."** Regulators have said that doesn't work for personalising/improving a service. It must be **consent** that the family actively gives.
- **What you do:** A clear, separate "I agree to [the learning data use]" step — not a pre-ticked box, not hidden in the T&Cs. Record when/what they agreed to.
- **Where it lives:** The sign-up flow + your consent records.
- **Where:** Everywhere (company-level GDPR duty).
- **Who:** Every minor's consent flow — the teen signs where self-consent applies, the parent where it doesn't.
- **Law:** GDPR Article 6 (consent, not contract).

### A10. 🟠 Tell users they're talking to an AI (deadline: 2 August 2026)
- **What it means:** The EU AI law will require chatbots/tutors to make clear the user is talking to an AI, not a human — and the bar is *higher* for children.
- **What you do:** Add a clear "this is an AI tutor" indicator. Not enforced until **2 Aug 2026**, but build it in now.
- **Where it lives:** The chat/tutor screen.
- **Where:** EU users (EU AI Act). No UK/US equivalent yet — but build it once and show it globally; honesty about AI costs nothing and US regulators expect it informally anyway.
- **Who:** All users; the transparency bar is explicitly higher for children.
- **Law:** EU AI Act Article 50.

## Group 3 — Your deal with the AI providers (contracts + what you send them)

### A11. 🔴 Sign a proper data contract with each AI provider, on the right product/contract route
- **What it means:** When a child's words go to an AI provider, that provider is your "data processor." You must have a signed data agreement (a "DPA") or equivalent processor terms, and the exact product terms must allow a teen/minor-facing app. **Consumer/free tiers are not enough.**
- **What you do:** Use only a paid/business/enterprise route whose terms allow this use case, and keep a list of which providers and sub-processors touch the data. Do **not** treat "Gemini exists for minors" as automatic permission to use Gemini API or Google Cloud Generative AI Services in MentoMate: Google's own Gemini Apps / Workspace for Education routes can serve minors under different Google-controlled terms, but the public Gemini API and Google Cloud generative-AI service terms restrict apps directed to or likely accessed by under-18s unless you have different written terms/permission. OpenAI/Anthropic-style API routes still need DPA/no-training/retention controls and child-safety safeguards.
- **Where it lives:** A contract you accept in each provider's console / legal page. Keep copies.
- **Where:** Everywhere. The GDPR contract duty is company-level, and the provider-terms problem (e.g. Google's under-18 restriction) is contractual — it follows the contract, not any country's law.
- **Who:** All users whose words reach a provider; the under-18 clauses are what make it minor-critical.
- **Law:** GDPR Article 28.

### A12. 🔴 Do a "transfer check" before sending kids' data to the US
- **What it means:** Sending EU children's data to US companies needs extra paperwork unless the provider is certified under the EU-US data deal ("DPF"). If they're not certified, you must do a short written **transfer risk check (TIA)** and rely on standard EU contract clauses.
- **What you do:** For each provider, check the official DPF certified list at launch time. If **yes** → lighter. If **no** → you need standard contractual clauses + a short transfer assessment. Your DPO/consultant does this. Do not rely on a one-time note about any provider's DPF status; it can change.
- **Where it lives:** A short assessment document per provider, kept on file.
- **Where:** Triggered by personal data leaving the EEA/UK for the US (your AI providers). As an EEA-established company, simplest is to treat your whole data flow uniformly rather than splitting by user origin.
- **Who:** All users' data in practice; the legal risk centres on EEA/UK residents.
- **Law:** GDPR Chapter V (Articles 44–46); "Schrems II" ruling.

### A13. 🔴 Send the AI providers as little personal data as possible
- **What it means:** Don't send a child's real name or anything you don't need. Minimise.
- **What you do:** Strip names and identifiers from what goes to the AI. For voice, send **only the text transcript** — never the raw audio for "mood/emotion" analysis (see A14).
- **Where it lives:** The code that builds the AI request (your team handles this — flag it as a requirement).
- **Where:** Everywhere (company-level GDPR duty; COPPA demands the same even harder for US under-13s — see List B).
- **Who:** All users; strictest for minors.
- **Law:** GDPR Article 5 (data minimisation).

### A14. 🟢 Never detect emotion from a child's voice
- **What it means:** Reading emotion from text is fine and legal. Reading emotion from *voice tone or face* is a high-risk/borderline-banned category. Avoid it entirely and you stay clear of the worst AI-law rules.
- **What you do:** Make a firm product rule: voice is for transcription only. Don't add "detect if the child is frustrated from their voice" features. Check any voice library you use doesn't do hidden emotion scoring.
- **Where it lives:** A product/design rule + a check on third-party voice tools.
- **Where:** EU users as hard law (the AI Act prohibition); make it a single global product rule — one app, one behaviour.
- **Who:** All users; the legal danger zone is doing it to minors.
- **Law:** EU AI Act Article 5(1)(f) / Annex III.

## Group 4 — How the app must be designed (children's design rules)

### A15. 🔴 Apply "child-friendly by default" design (UK Children's Code)
- **What it means:** The UK has 15 standards for any app likely used by under-18s: highest-privacy settings on by default, collect the minimum, no sharing by default, no location tracking by default, explain things in kid-friendly terms. **This binds you because you serve UK children, even from Norway.** The UK is actively fining companies for getting this wrong.
- **What you do:** Default every privacy setting to the safest option. Turn off any data sharing/tracking unless a family opts in. Have your DPO run the 15-standard checklist.
- **Where it lives:** Default settings in the app + a checklist document.
- **Where:** UK only as binding law — serving UK children binds you even from Norway. EU regulators expect very similar design through GDPR; California's copy of this code is tied up in litigation (watch item, don't build against it). Cheapest path: apply the UK standard globally.
- **Who:** All under-18 users.
- **Law:** UK Age-Appropriate Design Code (Children's Code).

### A16. 🔴 No manipulative or pressuring design aimed at kids
- **What it means:** No "your streak will die!" pressure, no tricks that push a child to keep using or to buy. Disengaging must be easy and guilt-free.
- **What you do:** Review your reminders, streaks, and prompts. Remove anything that pressures or guilt-trips a child. Make "stop / leave" as easy as "continue."
- **Where it lives:** Product/design review of all nudges and notifications.
- **Where:** Everywhere in practice — EU AI Act and consumer rules plus the UK Code say it explicitly, and the US FTC enforces against dark patterns aimed at kids under its general powers.
- **Who:** All minors; a healthy default for adults too.
- **Law:** EU AI Act Art 5; EU consumer rules; UK Children's Code.

### A17. 🔴 Use real age checking, not just "tick this box"
- **What it means:** For a higher-risk app, a regulator won't accept "the user said they were old enough" as your only age check.
- **What you do:** Ask for date of birth (A7), and treat a protection-lowering answer (claiming to be older) cautiously. You don't need invasive ID checks for a 13+ app, but a plain self-tick alone isn't enough.
- **Where it lives:** The sign-up flow.
- **Where:** UK + EU as explicit regulator guidance; since one sign-up flow serves every market, build it once globally.
- **Who:** Every user at sign-up.
- **Law:** UK Children's Code; EU regulator guidance.

## Group 5 — App store setup

### A18. 🔴 Declare your age group and tick the compliance boxes in both stores
- **What it means:** Apple and Google make you declare your target age and **promise in writing** that you comply with COPPA and GDPR. Get it wrong → they reject or pull the app.
- **What you do:** In **Google Play Console** and **Apple App Store Connect**, set the age rating / target audience and complete the kids/privacy declarations honestly.
- **Where it lives:** Play Console + App Store Connect settings.
- **Where:** Everywhere — store policies are global and often stricter than the law of any single country.
- **Who:** The app itself; every user passes through the declared age rating.
- **Law:** Google Play Families policy; Apple App Store rules.

### A19. 🟠 Adopt the new app-store age-signal tools for certain US states
- **What it means:** Some US states (Texas, Utah, Louisiana…) now require app stores to share an age signal and get parental consent for minors, with Apple/Google rolling out APIs (from Jan 2026) that developers must use.
- **What you do:** If you serve those states, integrate the platform age-signal APIs your developer connects. Watch this space — it's expanding.
- **Where it lives:** App integration (developer task) + store settings.
- **Where:** US only — and only specific states (Texas, Utah, Louisiana, expanding).
- **Who:** ALL minors under 18 in those states — including self-consenting 13–17-year-olds. Worth noticing: this is the one US-specific item that still bites at a 13+ floor; everything else US-specific lives in List B.
- **Law:** US state "App Store Accountability Acts."

## Group 6 — Money and subscriptions

### A20. 🔴 The paying account must be an adult's
- **What it means:** A child can't legally be tied to a paid subscription. The subscription/billing must sit with an adult.
- **What you do:** Make sure the account that pays is the parent/adult owner. Don't let a child set up their own paid plan.
- **Where it lives:** Your account/billing model.
- **Where:** Everywhere — minors' limited power to sign contracts is the rule in essentially every market; Norway's vergemålsloven is just the local name for it.
- **Who:** All minors — whoever the learner is, the payer must be an adult.
- **Law:** Minors' contract-capacity law (e.g. Norway's vergemålsloven).

### A21. 🔴 Make cancellation and pricing crystal clear
- **What it means:** You must clearly show the price, that it auto-renews, and how to cancel — and cancelling must be easy.
- **What you do:** Show full price + renewal terms before purchase; link straight to the store's cancel screen; don't obstruct cancelling. (When billing runs through Apple/Google, the actual money is theirs, but **the clear disclosure is still your job**.)
- **Where it lives:** Your purchase/upgrade screens + settings.
- **Where:** US (ROSCA + state auto-renewal laws), EU/Norway consumer rules, UK (a new subscription regime is arriving under the DMCC Act). Effectively everywhere you sell.
- **Who:** The adult subscriber — this one protects the payer, not the child.
- **Law:** US ROSCA + state auto-renewal laws (e.g. California); EU/Norway consumer rules.

### A22. 🔴 Don't market or pressure-sell to children
- **What it means:** You can't aim "buy now!" pressure at kids.
- **What you do:** Keep upgrade prompts neutral and aimed at the adult. No urgency/pressure language on children's screens.
- **Where it lives:** Copy on upsell/upgrade screens.
- **Where:** Everywhere — EU consumer law outright blacklists "buy now" appeals to children, Norway and the UK have the same rule, and the US FTC polices it too.
- **Who:** All minors — purchase pressure may only ever face the adult.
- **Law:** Norway marketing law (markedsføringsloven); EU consumer rules.

## Group 7 — The one big decision you need to make

### A23. 🟠 Decide: are you collecting health / learning-disability signals?
- **What it means:** If your app records or *infers* things like dyslexia, ADHD, or a disability, that's "sensitive data" with much stricter rules — you'd need explicit consent and a heavier assessment. Even inferring it counts.
- **What you do:** **Make a clear product decision.** If you avoid health/disability labels, you stay in the lighter lane. If you want them, tell your DPO — it adds an explicit-consent step and expands the DPIA.
- **Where it lives:** A product decision + (if yes) extra consent + DPIA section.
- **Where:** Everywhere (company-level GDPR duty); US state privacy laws increasingly treat health signals as sensitive as well.
- **Who:** All users — inferring ADHD/dyslexia/disability about anyone triggers it; doing it to minors makes it more acute.
- **Law:** GDPR Article 9.

## Group 8 — The persistent learning memory (retention, proportionality, purpose)

### A24. 🔴 Set a retention rule, a proportionality justification, and a purpose-fence for the "the mentor remembers" data
- **What it means:** The product's core promise is that the tutor *remembers what the learner has covered* — so a derived **learning memory** (mastery state, notes, session summaries, LLM-extracted facts, challenge-round answer quotes) is kept long after the raw 30-day chat transcript is deleted. That surviving memory is **still the child's personal data**, and (because it tailors tuition to the child) it is **profiling**. Deleting the bulky transcript while keeping a lean summary is *good* privacy-by-design — but the surviving layer must stand on its own three legs below. A code-verified audit (`docs/audits/2026-06-07-data-retention-and-erasure-audit.md`) found it currently has **none of them documented**. (Note: this is profiling, but **not** Article 22 automated-decision-making — it only personalises teaching and carries no legal/similarly-significant effect — so the Art 22 prohibitions do not bite. The DPIA should still say so explicitly.)
- **What you do — three pieces, all into the DPIA (A1) and ROPA (A3):**
  1. **Retention rule (storage limitation).** Write down how long the learning memory is kept and the trigger that ends it. The defensible rule: **kept while the account is active, deleted/anonymised on account deletion or after a defined dormancy period** (the ~365-day inactivity-expiry, `E5` scheduler) — *not* "forever, detached from anything." Today there is no written rule and no age-out cron for `learning_profiles` / `memory_facts` / `topic_notes` / `session_summaries`. Add the rule; bind it to the account lifecycle.
  2. **Proportionality justification (the child-specific paragraph).** Because the data subject is a minor, the DPIA must explicitly argue *why* an indefinitely-held profile of a child's learning performance is necessary and proportionate to the tutoring purpose — the same way a school justifies keeping a pupil record. State the purpose (teaching continuity), why a shorter period would defeat it, and the mitigations (minimised content, no third-party disclosure, learner/guardian can view and correct, deleted on erasure). This is read strictly for under-18s.
  3. **Purpose-fence.** Record that the learning memory may be used **only** to power tutoring continuity. Deriving "concepts covered" from a conversation to feed the tutor is compatible-purpose processing and needs no new basis — but reusing it for model training, analytics, or marketing is a **new purpose** needing its own lawful basis and notice. Keep the internal use fenced; the vendor no-training / zero-retention posture (A11/A12, MMT-ADR-0016) already protects the external side.
- **Two live problems the audit found that this item also has to close:**
  - **Verbatim quotes survive the "30-day transcript deletion."** Word-for-word learner answers persist indefinitely in `learning_sessions.metadata` (challenge-round `learnerQuote`), `topic_notes.content`, and `session_summaries`. So a notice that says "we delete your chats after 30 days" is **misleading**. **Chosen fix:** (a) **now** — make the privacy notice (A5) accurate; (b) **fast-follow** — age-out/abstract those verbatim fields on the same 30-day clock so only non-reconstructible state survives. **(a) DONE 2026-06-08:** `docs/compliance/privacy-policy.html` rewritten — §8 now states a learning summary is retained and may include short quotes from the learner's own answers, plus the purpose-fence (A24-a). **(b) still open** as post-launch tightening (audit item A24-b) unless a regulator pushes back.
  - **Erasure is not fully complete.** Account deletion cascades the whole in-DB learning memory cleanly, but did **not** delete the **Clerk login identity**, an orphaned `organizations` row, or `byok_waitlist` emails. **Clerk gap RESOLVED 2026-06-08 (commit `9137c7961`):** a Clerk user-delete is now wired into the scheduled-deletion Inngest job with a red→green break test (audit item R1). The `organizations` row and `byok_waitlist` emails remain (audit item R3, still open).
- **30-day transcript purge — confirmed live (2026-06-08):** the purge sits behind `RETENTION_PURGE_ENABLED`, which defaults OFF, but is **confirmed `true` in production Doppler** — so transcripts do purge at 30 days (audit item R2, resolved). Residual hardening **also DONE 2026-06-08:** the flag is now in `.env.example` with a "required `true` in prod" note so it can't silently regress.
- **Where it lives:** The DPIA (A1) + ROPA (A3) for the written rule/justification/fence; the privacy policy (A5) for the accurate notice; the deletion job + a new age-out job in code for enforcement.
- **Where:** Everywhere (company-level GDPR) — storage limitation, purpose limitation, and erasure follow your Norwegian seat into every market.
- **Who:** All users; read strictly for minors (the proportionality paragraph exists because the data subject is a child).
- **Law:** GDPR Article 5(1)(e) (storage limitation), Article 5(1)(b) (purpose limitation), Article 17 (erasure), Article 35 (DPIA must record all of the above); Article 22 explicitly *not* engaged.

---

# LIST B — Extra requirements ONLY if you also allow 10–12 year-olds (under-13)

> **Everything in List A still applies.** Below are the genuinely **heavier** things that switch on the moment you accept children **under 13** — this is the US **COPPA** regime plus stricter store/state rules. This applies the same way to 10, 11, and 12 year-olds. This is why launching 13+ first is so much simpler: the items below are the real extra cost.
>
> Two scope notes. **COPPA follows the child, not the company** — a Norwegian company serving a single US-resident 12-year-old is fully caught. And under-13s *outside* the US are not COPPA's problem, but they still need parent/guardian authorization of the GDPR "reasonable efforts" kind (lighter than VPC). So List B is mostly "US under-13" law, plus two items (B5, B6) that are global infrastructure and store policy.

### B1. 🔴 Get *verifiable* parent consent BEFORE collecting anything (the heavy kind)
- **What it means:** For under-13s, a simple parent email isn't enough. US law requires a **stronger, verified** parental consent (e.g. payment-card check, ID check, signed form) *before* you collect any data from the child.
- **What you do:** Integrate a specialist **verifiable parental consent (VPC) vendor** (e.g. PRIVO, k-ID). This is a paid integration with per-check fees.
- **Where it lives:** A new, heavier consent step in sign-up + a vendor contract.
- **Where:** The heavy VPC method is US law and bites for US-resident under-13s — your Norwegian seat does not exempt you. Under-13s elsewhere (EU/UK/Norway) still need parent authorization, but the lighter GDPR "reasonable efforts" kind, not VPC.
- **Who:** Under-13s only; the VPC grade specifically for the US-resident ones.
- **Law:** US COPPA (16 CFR Part 312).

### B2. 🔴 Decide and document the AI-provider consent scope
- **What it means:** Under COPPA, the hard question is whether the LLM provider is tightly contracted as integral/internal-operations support, or whether sending the child's conversation to that provider counts as a third-party disclosure needing its own parent opt-in. Using child data to train general AI models should be treated as off-limits.
- **What you do:** Assume you need a distinct "I allow my child's data to be sent to [AI providers]" consent unless counsel confirms the chosen provider route, contract, no-training terms, retention limits, and use restrictions keep it inside the allowed internal-operations/integral-service lane. Make sure your provider contracts (A11) guarantee **no training** on the data.
- **Where it lives:** Consent text/version + provider contract terms + counsel sign-off.
- **Where:** US — it is a COPPA legal analysis.
- **Who:** US under-13s; though the no-training contract terms it forces are good protection for every user.
- **Law:** US COPPA (third-party disclosure / support-for-internal-operations distinction).

### B3. 🔴 Write a formal information-security program
- **What it means:** A written security program with a named owner and a yearly review — not just "we use good security."
- **What you do:** Produce the document, name who owns security, schedule the annual risk review.
- **Where it lives:** A formal internal document.
- **Where:** US (COPPA 2025 Rule). GDPR already requires "appropriate security" everywhere — COPPA's extra demand is the formal written program with a named owner and an annual review.
- **Who:** Switched on by serving US under-13s; the program then covers the whole company.
- **Law:** US COPPA (2025 amended Rule); compliance deadline already passed (22 Apr 2026), so it's required day-one for under-13.

### B4. 🔴 Write and enforce a strict delete-when-done policy
- **What it means:** For under-13 data you must have a written rule that you keep it only as long as needed and then delete it. No keeping it indefinitely.
- **What you do:** Write the retention policy; make sure the app actually deletes per that schedule.
- **Where it lives:** A written policy + deletion behaviour in the app.
- **Where:** US (COPPA 2025 Rule). GDPR's "don't keep it longer than needed" principle already applies company-wide — COPPA's extra is the written child-specific schedule and provable deletion.
- **Who:** US under-13s' data.
- **Law:** US COPPA (2025 amended Rule — retention/deletion).

### B5. 🔴 Build country/residence routing for the under-13 flow
- **What it means:** COPPA is a US under-13 rule, but under-13 handling is not US-only if the app is available globally. You need country/residence logic for 13+ launch anyway; the under-13 version adds COPPA routing on top.
- **What you do:** Ask declared country/residence, use store/IP/billing signals as conflict checks where available, and fail closed when signals conflict or point to a stricter country. Route US under-13s into COPPA VPC; block or counsel-gate countries whose child rules are not mapped.
- **Where it lives:** Store availability + sign-up flow + backend policy decision snapshot.
- **Where:** Everywhere — this is infrastructure, not one country's legal duty: you cannot apply COPPA to the right children without knowing who lives in the US.
- **Who:** All under-13s; it also sharpens the A8 country logic for teens as a side benefit.
- **Law:** Needed to apply US COPPA and non-US child-data rules correctly.

### B6. 🔴 Meet the stricter store child-review rules
- **What it means:** Serving under-13s can trigger Apple's Kids Category / Made for Kids review posture depending on target audience, metadata, rating, and store answers. Google Play is more direct: if children are one of your target audiences, the Families Policy applies. These rules typically restrict third-party ads, analytics, APIs/SDKs, identifiers, and social features.
- **What you do:** Decide the store classification with counsel before allowing under-13s. Remove/disallow third-party ad and analytics tools for the kids experience unless the store policy explicitly permits them, and re-check every embedded SDK/API is approved for child-directed or mixed-audience use.
- **Where it lives:** App build + store category/age-rating/privacy settings + review notes.
- **Where:** Everywhere — Apple/Google policies are global.
- **Who:** Under-13s / any child-targeted classification of the app.
- **Law:** Apple App Review Guidelines / Kids Category; Google Play Families Policy.

### B7. 🟠 Stronger US state age-verification for under-13
- **What it means:** The US state app-store and minor-protection laws (A19) get stricter for under-13 — more states, firmer parental-consent requirements.
- **What you do:** Confirm the platform age-signal/parental-consent integrations cover the under-13 case for the states you serve.
- **Where it lives:** App integration + store settings.
- **Where:** US only — specific states; the stricter under-13 version of A19.
- **Who:** Under-13s in those states.
- **Law:** US state App Store Accountability Acts.

### B8. 🟠 Get a bounded COPPA legal review (and consider a "Safe Harbor")
- **What it means:** Going under-13 is the point where a short, specific US legal review is worth paying for — and joining an FTC-approved **"Safe Harbor"** program (PRIVO, kidSAFE) can make compliance cheaper and lower your risk.
- **What you do:** One-time legal engagement (low-thousands to low-five-figures) + optionally join a Safe Harbor scheme.
- **Where it lives:** External legal/consultant engagement.
- **Where:** US — COPPA is the regime being reviewed.
- **Who:** Switched on the moment you admit any US under-13s.
- **Law:** US COPPA framework.

---

# Suggested order of attack

**For a 13+ launch, do these first (they gate everything else):**
1. Appoint the DPO (A2) → they drive the DPIA (A1). Hand them the code-verified retention/erasure audit (`docs/audits/2026-06-07-data-retention-and-erasure-audit.md`) and A24 — the learning-memory retention rule, proportionality paragraph, and purpose-fence are DPIA content.
2. Make the Art 9 decision (A23) — it changes how heavy A1 is.
3. Sign provider data contracts on business tier + transfer checks (A11, A12).
4. Build the consent flow correctly: age gate, country/residence gate, parent/guardian authorization through 16 unless country rules lower it, and real consent (A7, A8, A9).
5. Privacy policy + UK representative + ROPA + breach plan (A5, A6, A3, A4).
6. Design pass: child-friendly defaults, no manipulation, voice transcription-only (A14, A15, A16).
7. Store declarations + subscription/cancellation/marketing (A18, A20, A21, A22).
8. Build in the "you're talking to an AI" notice before 2 Aug 2026 (A10).

**Before adding 10+:** the whole of List B — with B1 (verifiable parental consent vendor) and B2 (AI-provider consent scope + no-training guarantee) being the big, costly ones.

**What market choices can and cannot remove:**

- **No market choice removes the company-level GDPR stack** (A1–A5, A9, A11–A13, A23) — your Norwegian seat carries it into every launch shape, even a US-only one.
- **Skip the UK** → A6 and A15 fall away as legal duties. (Keep the UK design standard anyway — it is the best children's-design checklist available and EU regulators expect much the same.)
- **Open only consent-age-13 countries** (Norway, UK, the EU "13 group") → A8 stays dormant until you open Spain, France, Germany, the Netherlands, Ireland, or another higher-age country.
- **Block under-13 everywhere** → all of List B stays dormant; the only US-specific item still live is A19.

---

*Sources behind this guide: GDPR Articles 5, 6, 8, 9, 27, 28, 30, 33, 34, 35, 37, 44–46; EU AI Act Articles 5, 50; UK Age-Appropriate Design Code (Data Protection Act 2018) + Data (Use and Access) Act 2025; US COPPA (16 CFR Part 312, 2025 amended Rule); US ROSCA + state auto-renewal and App Store Accountability Acts; Norway angrerettloven & markedsføringsloven; Google Gemini API / Google Cloud Generative AI terms; Google Workspace for Education Gemini documentation; Apple App Review Guidelines; Google Play Families Policy. Cross-checked against EDPB, ICO, CNIL, FTC and EUR-Lex primary materials, June 2026.*
