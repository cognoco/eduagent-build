# Age Assurance & Verifiable Parental Consent — Decision Brief (Spike)

**Status:** Research synthesis, NOT a ratified spec. **Date:** 2026-06-01
**Feeds:** reconstructed-PRD **§7** (Consent/COPPA — the load-bearing GAP), open questions **§11.3** (consent under own-logins) and **§11.6** (is ~13 legal or product).
**Vocabulary:** uses the workstream model — **Person** (Managed = no login / shared device; Credentialed = own login), **Organization**, **Membership** (roles Owner/Mentor/Student), **Subscription on the org**, **Adult/Minor** flag.
**Method:** 5 parallel cited-research passes (European law, US/COPPA, platform signals, vendors, OSS/standards + Clerk). Volatile items date-stamped. `[LEGAL REVIEW]` = needs counsel before it enters a spec. `[VENDOR OUTREACH]` = firm commercial fact not public.
**Out of scope (sibling spike):** AI-chat content-safety/moderation.

> **⚠ Vocabulary superseded + C7 resolved — folded into the ontology 2026-06-01 (Fold #2).** This is a **dated
> discovery artifact**; its decisions now live, in ratified terms, in `identity-ontology.md` (§R "Fold #2",
> §3.2, §4.26–30, §8 REQ-2/REQ-3) and `CONTEXT.md`. Two corrections the body does **not** reflect (left
> unrewritten on purpose): **(1) vocabulary** — `Credential` → **Login**, roles `Owner/Mentor/Student` →
> `{admin, learner}` + capacities, the `Adult/Minor` flag → the computed `requiresGuardianConsent`;
> **(2) C7** — every "**Clerk Orgs for access/identity**" line (§E, §G) is **superseded by MMT-ADR-0001** (own the
> graph in Neon; Clerk = auth + the resolved-decision JWT claims only). Read the ontology, not this file.

> ⚠️ The deep-research *workflow* harness failed mid-run (StructuredOutput incompatibility, ~3.4M tokens, no output). This brief was produced via direct parallel research agents instead. Same rigor, different vehicle.

---

## 0. TL;DR — the decisions this unblocks

1. **§11.6 answered: ~13 is BOTH a legal line and a product default — and a single "13" is _wrong_.** 13 is the floor in Norway, the UK, and COPPA; but the EU "digital consent age" runs **13→16**, and the big markets **Germany, Netherlands, Ireland, Poland are 16**. So the threshold **must be a per-jurisdiction policy value**, not a constant. Ship **worst-case (16) by default**, relax per-country as config. (§A1)
2. **The COPPA footgun is real and confirmed: consent must be _method-typed_, never a boolean.** COPPA requires Verifiable Parental Consent (VPC) for *any* collection from under-13s with **no contract/legitimate-interest escape**, plus **separate opt-in for AI training**. An EU-shaped "consent = true" model is a US-readiness bug. (§A2, §F)
3. **Two corrections to our earlier whiteboard** (be honest about these):
   - **Contract basis buys _less_ than we hoped.** EDPB + children's-capacity-to-contract law mean you cannot cleanly rest the *child's* core processing on the *parent's* contract. `[LEGAL REVIEW]` (§A1)
   - **Android-first does _not_ give you a European platform age signal.** Google's Play Age Signals API is **jurisdiction-gated to US-ASAA states + Brazil → returns null in NO/EU/UK**. Apple's Declared Age Range API is **global**. So in Europe, **iOS has the better platform signal, not Android.** (§C)
4. **Pick ONE provider for the VPC slot — KWS and k-ID are substitutes, not complements.** **KWS** is the cost frontrunner (free, no cap, COPPA Safe Harbor + GDPR-K + UK AADC) — but "free" is **Epic-subsidized strategic infrastructure**, so weight it on **counterparty durability + EU method coverage**, not on hunting for a price catch (§D). **k-ID** is the challenger worth pricing (free jurisdiction engine, reusable "AgeKey" token, strongest cert stack; VC-backed so its VPC flow is paid). `[VENDOR OUTREACH]` on both. (§D)
5. **Recommended shape: a `jurisdiction × age → policy` table (worst-case default), behind one `AgeConsentDecision` interface, fed by platform-signal-where-available + vendor-for-the-gap, with consent receipts in our own DB (ISO/IEC 27560).** Clerk carries the *decision* (3 small claims); we own the *audit*. (§F)
6. **A DPIA is effectively mandatory** (UK Children's Code + children + AI) and should gate launch. (§A1)

---

## A. Regulatory floor

### A1. Europe (Norway + EU + UK)

**Digital-consent age (GDPR Art 8) — the per-jurisdiction table (answers §11.6):**

| Age | Jurisdictions |
|----|----|
| **13** | **Norway**, **UK**, Belgium, Sweden, Denmark, Finland, Estonia, Latvia, Malta, Portugal |
| **14** | Spain, Italy, Austria, Bulgaria, Cyprus, Lithuania |
| **15** | France, Czechia, Greece, Slovenia |
| **16** | **Germany, Netherlands, Ireland, Poland**, Hungary, Luxembourg, Romania, Slovakia, Croatia |

- Norway has a bill to raise to **15** (social-media-focused) — *unenacted as of May 2026, monitor Stortinget* `(verify)`.
- **Binding-constraint design:** a Person who is a Minor below the *applicable* national age cannot self-consent; below-16 Germans/Dutch/Irish/Poles need parental consent even with their own login. Default the policy table to **16** and relax per verified country.

**Lawful basis — contract vs consent (the correction):**
- Art 6(1)(b) **contract** covers only processing *objectively necessary* to deliver the service (EDPB Guidelines 2/2019). It does **not** cover analytics, profiling, marketing, or **AI training** — those need consent or a children-specific legitimate-interest assessment.
- **The sharp edge:** Art 8(3) preserves national rules on a **child's capacity to contract**. ICO: a child's contract is typically *voidable* → contract basis "may not be valid." Relying on the **parent's** contract to ground the **child's** data processing is legally uncertain (the EDPB necessity test is keyed to the contract *with the data subject*, who is the child). **So we cannot assume "parent is account-holder ⇒ contract basis covers the child."** `[LEGAL REVIEW]`
- **Net:** the verifiable-parental-consent surface is **larger** than the optimistic read. Treat parental consent as load-bearing for the child's processing, not a thin backstop.

**UK Age-Appropriate Design Code (Children's Code):** in scope (service "likely to be accessed by children"). Requires high-privacy defaults, data minimisation, **profiling off by default**, proportionate age assurance, and — critically — a **DPIA before launch**. Children + AI + learning profiles ⇒ **DPIA effectively mandatory** (also UK GDPR Art 35). `(Data (Use and Access) Act got Royal Assent 2025-06-19; ICO guidance under review — verify.)`

**UK Online Safety Act:** "highly effective age assurance" applies to **pornographic / user-to-user** services. A **child↔AI study chat is not user-to-user** → **out of the HEAA duty.** BUT the **Crime and Policing Act 2026** (Royal Assent 2026-04-29) pulls AI chatbots into baseline **illegal-content duties** (CSAM/terror), and **Ofcom is consulting on child-AI-chatbot restrictions** via secondary regs — *monitor.* `[LEGAL REVIEW]`

**EU AI Act:** an AI study tutor is **not** Annex III high-risk *unless* its adaptive path **steers the curriculum / evaluates learning outcomes** (Annex III 3(b)) — then it likely is. `[LEGAL REVIEW]` **Transparency** (must disclose "this is AI") under Art 50 applies **from 2026-08-02**. High-risk obligations deadline pushed to **2027-12-02** (Digital Omnibus, provisional 2026-05). `(verify OJ publication.)`

### A2. US — COPPA (full, structural) + state scan

**COPPA = the architecture footgun.** For collecting *any* personal info from an under-13:
- **VPC is mandatory. There is no contract, legitimate-interest, or "necessary for service" basis.** (Sharpest divergence from GDPR.)
- **Age-gate must come _before_ collection** — collect *age range only* via a neutral mechanism; route under-13s to VPC *before* storing name/DOB/anything.
- **VPC methods** (2025 Rule): credit/debit card (no charge needed now), print-and-mail, phone/video, **KBA** (new), facial-match-to-ID + human review (new), and **email-plus / text-plus** — but the last two are **internal-use-only: unavailable if any third-party SDK (analytics/ads) receives child data.** A freemium app with analytics SDKs effectively needs card / KBA / facial / phone.
- **2025 amended Rule** (effective 2025-06-23, **compliance 2026-04-22**): biometrics + gov-ID added to "personal information"; **separate VPC opt-in required for third-party sharing, targeted ads, and _AI training_**; purpose-limited **data-retention + deletion policy**; written **security program**. AI-training-on-kids'-data needs its own consent layer. `[LEGAL REVIEW]` for our AI features.
- **Safe Harbor** (compliance presumption + enforcement shield): **PRIVO, kidSAFE, ESRB**. `[LEGAL REVIEW]` that their current guidelines cover AI.
- FTC posture: 6(b) AI-companion study (2025-09), $10–20M enforcement actions in 2025, "eager to enforce" post-2026-04. The FTC's 2026-02 age-verification carve-out is for **mixed/general-audience only — not child-directed**, so unavailable to us.

**US state scan — `(volatile, verify at launch)`:** App-Store-Accountability Acts push age+consent duties onto **Apple/Google** and expose signals to apps — **Utah (eff. 2027-05), Louisiana (2026-07), California DAAA (2027-01); Texas SB2420 enjoined (2025-12)**. **California AADC** partially revived (9th Cir. 2026-03 split ruling). State minor-data laws increasingly use **16/18** thresholds for targeted ads / data sale (relevant to monetization of 13–17s even outside COPPA). AI-chatbot disclosure laws (CA SB243, NY, UT) may apply to a "study companion."

**COPPA vs Europe — the seam that must exist in the data model:**

| | COPPA (US) | GDPR-K (EU/UK) |
|---|---|---|
| Legal bases | **VPC only** | consent / contract / LI (contract weak for kids — §A1) |
| Threshold | hard **<13** | **13–16** per state |
| Who consents | **always the parent** | parent <age; child ≥age in some states |
| AI training | **separate VPC** | general principles + AI Act |
| Collect-then-gate | **forbidden** (gate first) | gate first (best practice) |

---

## B. The §7 questions answered (consent under own-logins)

> Framed in the Person/Credential model. All `[LEGAL REVIEW]` before they enter the spec.

**(a) Who consents for a _Credentialed Minor_, and how is own-login signup age-gated?**
- Below the applicable national age (EU/UK) or under-13 (US): **the parent (an Adult) consents — mandatory, before processing begins.** The Minor cannot self-authorise.
- Signup flow must **age-gate first** (neutral DOB/age-range capture), then route under-threshold to a **parent-consent flow** (verify the consenter holds parental responsibility per Art 8(2) "reasonable efforts" / COPPA VPC). For primary-school ages, self-declaration is **not** proportionate — needs a real signal (platform `guardianDeclared`, vendor VPC, or card).
- At/above the national age (EU only): the Credentialed Minor may self-consent for consent-based processing — **country-dependent**, hence the policy table.

**(b) Does Managed→Credentialed _graduation_ re-trigger consent?**
- **Yes — re-assess and re-document the lawful basis.** New processing (own-login, own-device identifiers, possibly new consent-based features) needs its basis re-confirmed. If the Person is still below the national age, **renew parental consent for the credentialed context**; if now above, the Minor can self-consent to *new* features (legacy data lawfully held remains, same purpose). Use the transition as the moment to expose the child's data-rights tools (Children's Code std 15).

**(c) Cross-org consent (Minor invited into a second Organization, e.g. a tutor roster):**
- Each Organization is a distinct controller context. **Consent/authority does not automatically travel across orgs.** Whose consent governs which data must be modelled per-Membership, and a Minor joining a second org needs a basis for *that* org's processing. `[LEGAL REVIEW]` — this is genuinely unsettled and interacts with the §8 multi-org billing GAP.

**(d) "Minor signs up first on own device, no adult present":**
- **No lawful path without parental consent** (EU Art 8 + COPPA). Compliant pattern: create an **unverified/frozen** Person, **gate all processing** until a parent completes consent (email/closed-loop to a parent, then a verification step). There is **no forgiveness path** — data collected before consent is unlawfully processed until remediated.

---

## C. Platform signals — Apple vs Google (the correction)

**Headline: in Europe, Apple gives you a signal and Google does not (yet).**

| Capability | Google / Android | Apple / iOS |
|---|---|---|
| API | **Play Age Signals API** (beta) → `userStatus` ∈ {SUPERVISED, DECLARED, VERIFIED, null} + age band + `installId` + approval date | **DeclaredAgeRange** (iOS 26, WWDC25) → age band + `ageRangeDeclaration` ∈ {guardianDeclared, selfDeclared} + `declinedSharing` |
| **Europe coverage** | **NULL in NO/EU/UK** — gated to US-ASAA states + Brazil `(May 2026, verify)` | **Global** (iOS 26+) |
| Parental-consent signal | `SUPERVISED` (Family Link) / `SUPERVISED_APPROVAL_DENIED` (hard block) | `guardianDeclared` (parent set age) — *declared, not independently verified* in most regions |
| Assurance | VERIFIED (card/ID) only in law-states | method-of-assurance field only in UT/LA/BR/AU/SG |
| SSO age trap | Sign-in-with-Google ≠ age (People API `ageRange` needs extra scope, self-declared) | Sign-in-with-Apple ≠ age |
| Store-policy gate | **Play Families / "Designed for Families" is MANDATORY** (target-age decl., Data Safety form, certified ads SDKs, no AAID/IMEI/MAC/precise-loc) | App Store age bands now 4+/9+/**13+/16+/18+** (questionnaire deadline 2026-01-31) |

**Consequences for v1:**
- **Android-first Europe gets no usable Google age signal today.** Plan the parental gate as **in-app + vendor**, not platform-signal-dependent. (Google's API is a *US-compliance* tool, not a European capability.)
- **iOS fast-follow actually improves your European signal** via `DeclaredAgeRange` (global) — `guardianDeclared` is a decent low-friction consent hint (not high-assurance).
- **The hardest cohort — a child on the _parent's_ device (parent's adult account) — has NO platform signal on either OS.** This is exactly the **Managed Person** case; it must be handled by **in-app parental setup UX**, which is fine (the Adult is present and is the account holder).
- **Play Families compliance is a hard gate to ship on Android** regardless of everything else — treat as a v1 checklist item (no ad SDKs except certified; Data Safety form; no prohibited identifiers).

---

## D. Vendors — the freemium answer

**Decisive commercial variable (pricing unit) resolved:**

| Vendor | Fit | Coverage / certs | Pricing unit | Verdict |
|---|---|---|---|---|
| **KWS (Kids Web Services)** — **wholly-owned Epic Games subsidiary** (SuperAwesome's *ad* business demerged Jan 2024; **KWS stayed with Epic**) | VPC-as-a-service, jurisdiction thresholds, parent dashboard (AgeGraph). No facial estimation (card / carrier / SSN-US / CPF-BR / i-PIN-KR). | **COPPA Safe Harbor (ESRB + kidSAFE), ISO/IEC 27566-1, UK AADC, GDPR-K** | **FREE, no volume cap, self-serve** — Epic-subsidized strategic infra, not a metered service | **Default choice.** Only model that doesn't punish freemium. Parent PII stays in KWS. *Caveats below.* |
| **k-ID** | Most complete: AgeKit jurisdiction engine, Family Connect VPC, **OpenAge/AgeKey reusable token** (sub-1¢ at volume, Meta/Persona/Incode joining). | **ISO 27566-1, ACCS 3:2021, ESRB Kids, SOC2** (strongest stack) | **AgeKit free**; VPC/Family Connect **`[VENDOR OUTREACH]`** | **Strategic platform.** Reusable token is the freemium cost-amortizer. Get pricing. |
| **Yoti** | Facial **age estimation** (ACCS L2), Yoti Key reusable token | UK/EU strong; **FTC rejected its facial estimation as COPPA VPC (2024)** | enterprise `[VENDOR OUTREACH]` | EU/UK *estimation* layer only — **not** a US VPC provider. |
| **PRIVO** | Gold-standard US VPC | **FTC COPPA Safe Harbor since 2004**, GDPRkids, ACCS | enterprise `[VENDOR OUTREACH]` | US COPPA layer if KWS/k-ID insufficient. US-centric. |
| Veriff / Persona / Incode / Au10tix / Stripe Identity | Adult KYC/IDV | **no COPPA Safe Harbor / no kids VPC** (Stripe *prohibits* <13) | per-verification $0.80–$1.89 / $500-mo min | **Not fit** for kids consent. |

**KWS vs k-ID — substitutes, pick one.** Both cover the core slot (VPC ceremony + jurisdiction engine + parent dashboard + COPPA Safe Harbor + GDPR-K/UK-AADC). You deploy **one**, not both. Real deltas: k-ID adds child-side **age estimation** and an **open reusable token** (OpenAge/AgeKey); KWS has its own (walled) AgeGraph network and **no estimation**.

**Why KWS is free (and the real catch).** KWS is **Epic-subsidized strategic infrastructure** (the Epic Online Services "free dev tools to win the ecosystem" playbook) + the AgeGraph network moat — *not* a metered service with a hidden price. So the risk to weigh is **not** cost, it's: **(1) counterparty dependency** — wiring a legally load-bearing function to free infra whose continuation is Epic's strategic choice, not a paid contract (vs k-ID's opposite risk: a VC-backed startup that *must* monetize → runway/acquisition risk, which is *why* its Family Connect VPC is paid); **(2) EU method coverage** — KWS's surfaced methods skew US-SSN / Brazil-CPF / Korea-i-PIN / cell; the **NO/EU/UK** method (card? carrier? BankID-style?) and **completion rate** are the genuine unknown and could be the thing that tips you to k-ID; **(3) data/DPA posture** — heavily mitigated by Safe Harbor certs + parent-PII-stays-in-KWS, but review given the Epic/ad-adjacent lineage. `[LEGAL REVIEW]`

**Recommendation:** default to **KWS** (zero-cost, COPPA + GDPR-K + UK AADC, no freemium penalty); run a **k-ID** outreach call to price Family Connect and check whether estimation / OpenAge reuse / EU completion materially beat KWS for your markets. Layer **Yoti or Privately** for EU facial-estimation *only if* parent-verification completion needs it. `[VENDOR OUTREACH]`: KWS **EU method coverage + completion rates** and counterparty/SLA terms; k-ID, Yoti, PRIVO pricing.

---

## E. OSS / standards + Clerk

**Reusable open (build on these):**
- **Consent receipts → ISO/IEC TS 27560:2023** (free ISO standard) + Kantara reference API. This is our **consent-receipt schema** — store per-Person, method-typed, with an event log (given/withdrawn/expired).
- **Age-proof protocol/format (future):** OID4VP 1.0, **SD-JWT (RFC 9901)**, W3C VC 2.0, ISO 18013-5 mDL — production-grade OSS libs (walt.id, Sphereon, Spruce, EUDI EC repos). Lets us accept a wallet "over-13/16" proof with selective disclosure later.
- **EUDI Wallet age attestation:** pilot 2026, GA post-2026; **Norway (EEA) lags, UK separate (DIATF).** Design to *accept* it later; **not a day-1 dependency.**
- **euCONSENT/AgeAware:** interoperable token, proprietary governance — monitor.

**The proprietary wall (must be a vendor):** ID-document OCR + **liveness/anti-spoofing** + ML **age estimation**. **No production-grade OSS exists.** This is precisely the toxic-data step to offload (vendor returns a signed attestation; raw PII/biometrics never touch us).

**Clerk (resolves part of the §1 Clerk-Orgs-vs-own-DB fork):**
- **Carries the _decision_ cleanly:** put `ageBand`, `consentStatus`, `assuranceLevel` in `user.publicMetadata` → inject as custom **JWT claims** (3 small fields; mind the ~1.2KB session-token budget; 8KB metadata cap). Keep raw AV receipt IDs in `privateMetadata`. **Race note:** refresh token (`getToken({skipCache:true})`) after an AV write before reading claims.
- **Clerk Organizations** give orgs + multi-org memberships (native) + up to **10 custom roles** (`org:guardian/tutor/student`) + custom permissions in JWT + invitations + per-org SSO (schools). Membership metadata can hold `{consentGiven, consentTimestamp, guardianUserId}`.
- **But Clerk metadata is not a queryable, append-only audit log.** So: **hybrid** — lean on **Clerk Orgs for identity/access (who's in what org, what role)**; **own a Postgres table for consent receipts + AV audit records + the consent event log** (COPPA/GDPR demand an immutable, queryable audit trail). This is the concrete answer to "lean on Clerk Orgs or own it": *both, split by job.*

---

## F. Architecture synthesis — the recommended shape

**1. One decision interface (the COPPA-ready seam).** Everything in the app reads a single resolved object, never the method:
```
AgeConsentDecision {
  ageBand:        e.g. UNDER_13 | 13_15 | 16_17 | ADULT   // jurisdiction-relative
  consentStatus:  NOT_REQUIRED | REQUIRED_PENDING | GRANTED | REVOKED | EXPIRED
  assuranceLevel: SELF_DECLARED | PLATFORM_GUARDIAN | VENDOR_VERIFIED | VPC_VERIFIED
  consentMethod:  enum (card | KBA | facial+review | platform:guardianDeclared | vendor:KWS | ...)  // NEVER a bare boolean
  jurisdiction:   ISO country (drives the policy lookup)
  purposeScope:   { core, thirdPartyShare, targetedAds, aiTraining }  // per-purpose, COPPA 2025
  retentionExpiresAt, receiptId (→ ISO 27560 record)
}
```
**Consent is method-typed and per-purpose, never `consented=true`.** This is the single most important data-model decision for US-readiness.

**2. Policy as data, defaulted worst-case.** A `jurisdiction × ageBand → policy` lookup table (the thresholds in §A1). **Ship configured to strictest (16 / VPC-always), relax per verified country as config — never country-by-country code.** The evidence strongly supports this (k-ID's whole AgeKit product *is* this table; EDPB is pushing harmonization but it's not here yet).

**3. The blend (resolution order behind the interface):**
1. **Platform signal where available** — iOS `DeclaredAgeRange` (Europe ✓), Android Play Age Signals (US-states only). Cheap, low-friction.
2. **In-app parental setup** for the **Managed Person / shared-device** cohort (the Adult is present anyway) — no platform signal exists for it.
3. **Vendor VPC (KWS → k-ID)** for the gap: Credentialed Minor below threshold, no platform signal, higher-assurance moments. Verify **once per child at onboarding** (per-event/free), not per-MAU.
4. **Worst-case default** if nothing resolves: treat as below-threshold, gate processing.

**4. Data-model seams to build now (cheap now, expensive later):**
- Per-Person: `jurisdiction`, `ageBand`, and a **method-typed consent record** (not boolean).
- **Separate consent records per purpose** (core / third-party-share / targeted-ads / **AI-training**) — COPPA 2025 demands it even if you only use "core" at launch.
- **`data_retention_expires_at` per data category** (COPPA 2025 + minimisation).
- Consent linked to a **verified Adult (parent) identity**, not just the child Person.
- **ISO 27560 consent receipt** + append-only event log in our DB.
- **Age-gate precedes collection** — capture age-range first; do not persist name/DOB/learning data until basis is established.

**5. Freemium fit.** KWS-free (or k-ID AgeKey reuse) verifying **once per child at onboarding** bounds cost to *signups*, not MAUs — viable on a free tier. Freemium kills the "card-on-file = adult signal" lever; replace it with **iOS `guardianDeclared` + vendor VPC**, and keep the gate **after first value where law allows** (worst-case jurisdictions may require it before any processing — the policy table decides).

---

## G. Recommendation & the worst-case-vs-jurisdictional call

- **Adopt the worst-case-default policy table** (strict everywhere, relax per verified jurisdiction as config). It is the only design that is safe at launch *and* reversible without a rebuild, and it matches how the vendors model it.
- **Treat parental consent as load-bearing for the Minor's processing** (the contract-basis shortcut is too weak — §A1).
- **Build consent method-typed and per-purpose from day one** (COPPA-ready seam), even launching EU-first.
- **KWS now; k-ID conversation in parallel; own the consent-receipt/audit store; Clerk Orgs for access.**
- **Commission the DPIA in parallel** — it's effectively mandatory and will surface the same questions.
- **Launch sequencing unchanged:** EU-first is fine; the US becomes a config + a Safe-Harbor enrolment, not a re-architecture.

## H. Open items

**`[LEGAL REVIEW]` before entering the spec:**
1. Can contract basis (Art 6(1)(b)) carry *any* of the Minor's core processing via the parent's account, per relevant national contract law? (Likely no/limited.)
2. Cross-org consent (§7c) — whose consent governs a Minor's data in a second Organization.
3. Managed→Credentialed graduation — does the parent's original consent survive the credential-type change; legacy-data handling.
4. COPPA AI-training separate-consent applicability to our specific AI features.
5. EU AI Act high-risk trigger — does our adaptive path "steer" curriculum (Annex III 3(b))?
6. Ofcom secondary regulations on child-AI-chatbots (pending) — monitor.

**`[VENDOR OUTREACH]` for firm facts:**
- k-ID Family Connect / AgeKit+ pricing & OpenAge token economics; Yoti & PRIVO pricing; KWS EU method-coverage + parent-verification completion rates.

**Sibling spike (not researched here):** AI-chat content-safety / moderation / crisis handling.

---

## I. Key primary sources

*(full inline citations live in the per-angle research; key anchors below)*

- **EU/UK law:** [GDPR Art 8](https://gdpr-info.eu/art-8-gdpr/) · [EDPB Guidelines 2/2019 (contract)](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-22019-processing-personal-data-under-article-61b_en) · [ICO Children's Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/) · [EU AI Act Annex III](https://ai-act-service-desk.ec.europa.eu/en/ai-act/annex-3) · [EDPB Statement 1/2025 on Age Assurance](https://www.edpb.europa.eu/our-work-tools/our-documents/statements/statement-12025-age-assurance_en)
- **US:** [FTC COPPA](https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy) · [Federal Register COPPA Final Rule 2025](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule) · [FTC VPC methods](https://www.ftc.gov/business-guidance/privacy-security/verifiable-parental-consent-childrens-online-privacy-rule) · [Mayer Brown children's-privacy tracker](https://www.mayerbrown.com/en/insights/resource-centers/cybersecurity-and-data-privacy-resource-center/us-childrens-privacy-legislation-tracker)
- **Platform:** [Play Age Signals](https://developer.android.com/google/play/age-signals/overview) · [Google Play Families policy](https://support.google.com/googleplay/android-developer/answer/9893335) · [Apple DeclaredAgeRange](https://developer.apple.com/documentation/declaredagerange/) · [WWDC25 299](https://developer.apple.com/videos/play/wwdc2025/299/) · [Apple age requirements (UT/LA/BR/AU/SG)](https://developer.apple.com/news/?id=f5zj08ey)
- **Vendors:** [KWS](https://www.kidswebservices.com/) · [KWS free parent verification](https://www.superawesome.com/blog/free-parent-verification/) · [k-ID AgeKit](https://k-id.com/products/agekit) · [OpenAge/AgeKey](https://www.businesswire.com/news/home/20251110709762/en/Newly-Launched-OpenAge-Initiative-Introduces-AgeKey) · [PRIVO COPPA Safe Harbor](https://www.privo.com/coppa-safe-harbor-program) · [Yoti FTC VPC declined 2024](https://www.biometricupdate.com/202404/ftc-passes-on-biometric-age-estimation-approval-request-from-yoti-and-partners) · [ACCS registry](https://accscheme.com/registry/)
- **Standards/Clerk:** [ISO/IEC TS 27560](https://www.iso.org/standard/80392.html) · [RFC 9901 SD-JWT](https://datatracker.ietf.org/doc/rfc9901/) · [W3C VC 2.0](https://www.w3.org/press-releases/2025/verifiable-credentials-2-0/) · [EU Age Verification Blueprint](https://ageverification.dev/) · [Clerk customize session token](https://clerk.com/docs/guides/sessions/customize-session-tokens) · [Clerk Organizations](https://clerk.com/docs/guides/organizations/overview)
