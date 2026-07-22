# Data-Breach Response Plan

**Checklist item:** A4 · **Law:** GDPR Articles 33 & 34 · **Status:** DRAFT for DPO sign-off.
**Controller:** **ZWIZZLY AS**, org.nr **811696072**, Fiskekroken 3B, 0139 Oslo, Norway. **Lead regulator:** Norwegian Datatilsynet (Norwegian Data Protection Authority).

> A personal-data breach = any security incident leading to accidental or unlawful **destruction, loss, alteration, unauthorised disclosure of, or access to** personal data. This includes a leaked database, a misconfigured store, a stolen laptop with credentials, a vendor breach (Clerk, Neon, an LLM provider, etc.), or accidental sending of one family's data to another. **The 72-hour clock is short — this plan exists so nobody has to think about the process during the incident.**

## Roles

| Role | Who | Responsibility |
|---|---|---|
| **Breach Lead** | DPO (`[DPO name — TODO before launch]`, `[dpo@…]`) | Owns the response end-to-end; makes the notify/don't-notify call; signs the regulator notification. |
| **Technical Responder** | Engineering on-call | Detect, contain, preserve evidence, scope which data and how many people are affected. |
| **Comms** | Founder / DPO | Drafts the message to affected families if Art 34 notification is required. |

## The 72-hour timeline (clock starts when you become *aware* a breach has likely occurred — not when you finish investigating)

1. **Detect & log (hour 0).** Anyone who spots it records: what happened, when noticed, systems involved. Open an incident record (date/time-stamped). Notify the Breach Lead immediately.
2. **Contain (hours 0–4).** Technical Responder stops the bleeding: rotate the leaked secret (via Doppler — see `docs/` secrets process), revoke tokens, close the misconfiguration, isolate the affected system. **Do not destroy logs** — they are the evidence.
3. **Assess severity (hours 4–24).** Determine:
   - **What data?** (account email, learner DOB, learning content, billing — see `ropa.md` for the categories.)
   - **Whose, and how many?** Adults? Minors? (A minor breach is almost always "high risk.")
   - **Likely consequences?** Identity exposure, safety risk to a child, financial.
4. **Notify Datatilsynet (within 72 hours of awareness)** — GDPR Art 33 — **unless** the breach is unlikely to risk people's rights and freedoms (document that reasoning if you decide not to notify). Use Datatilsynet's online breach-notification form. If you don't have all facts in 72h, file what you have and supplement — late-but-filed beats waiting.
5. **Notify affected families (without undue delay)** — GDPR Art 34 — **only if** the breach is **high risk** to individuals (very likely whenever children's data is exposed). Plain-language message: what happened, what data, what they should do, your contact. If notifying each family individually is disproportionate, a public notice can substitute.
6. **Document everything (Art 33(5)).** Every breach — even ones you decide not to report — goes in the breach register: facts, effects, remedial action, and the reasoning for the notify decision. Datatilsynet can ask to see this.

## Extra notices that may stack on top

- **US users affected** → US **state breach-notification laws** add their own notices (timing and content vary by state). Flag to counsel if any affected user is US-resident.
- **Processor breach** → if the breach is at a vendor (Clerk, Neon, RevenueCat, an LLM provider, Sentry, Resend, Inngest, Voyage, Cloudflare), their DPA (A11) should oblige them to notify *you* without undue delay; **your** 72-hour clock to Datatilsynet starts when they make you aware. Keep their breach-contact details with their DPA.

## Pre-filled facts (so they're not looked up mid-incident)

- **Regulator:** Datatilsynet — www.datatilsynet.no — breach form on their site.
- **Controller:** **ZWIZZLY AS**, org.nr **811696072**, Fiskekroken 3B, 0139 Oslo, Norway.
- **DPO contact:** `[dpo@… — TODO]`.
- **EU/UK representative:** `[Art 27 rep — TODO if serving UK]`.
- **Processor breach-contacts:** maintained in each provider's DPA file (see `ropa.md` recipients column).

---

**Sign-off:** DPO. ☐ Adopted · Name: ____________ · Date: ________ · Review annually.
