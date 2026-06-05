# Sources — Under-13 Floor Walkthrough

> **Consolidated citation list.** One row per source cited in
> `SYNTHESIS.md` and `BRIEFING-PACKET.md`. The verification status column
> indicates whether the source was directly fetched and confirmed by us,
> or whether the URL is real and authoritative but the exact text was not
> directly confirmed (the regulators' primary pages returned HTTP 403 or
> 302 to our WebFetch agents).
>
> **Convention:** "verified" = the synthesis's claim against this source
> is directly supported by the URL content. "unverified (URL real)" =
> the URL is the correct primary source for the claim, but we did not
> directly fetch the text — counsel to re-verify in the room or take
> away. "secondary" = the citation is to a secondary summary, not the
> primary source.

---

## Layer 1 — Statute

### US — COPPA and FTC

| Source | URL | What it supports | Verification |
|---|---|---|---|
| COPPA — 15 U.S.C. §§ 6501–6506 | https://www.law.cornell.edu/uscode/text/15/chapter-91 | COPPA statutory text | verified (Cornell LII is the canonical text) |
| COPPA Rule — 16 CFR Part 312 | https://www.law.cornell.edu/cfr/text/16/part-312 | COPPA Rule text, including the "actual knowledge" definition in §312.2 | verified (Cornell LII canonical) |
| FTC COPPA Rule final amendments — 90 FR 16977 (22 April 2025) | https://www.federalregister.gov/documents/2025/04/22/2025-05904 | FTC's first major COPPA Rule amendment since 2013; new VPC for sale / targeted ads, retention cap, biometric identifiers added, flexible age-assurance | unverified (URL real; direct fetch returned 403 / 302 to unblock host) — counsel to re-verify |
| FTC press release — Epic Games $275M (Dec 2022) | https://www.ftc.gov/news-events/news/press-releases/2022-12-19-ftc-announces-settlement-epic-games | $275M civil penalty + $245M consumer redress for COPPA + dark patterns | unverified (URL is the canonical FTC press-release slug; direct fetch 403'd) — counsel to re-verify dollar amounts |
| FTC press release — Google/YouTube $170M (Sept 2019) | https://www.ftc.gov/news-events/news/press-releases/2019-09-04-ftc-google-youtube-will-pay-170-million-alleged-violations | $170M for COPPA on under-13 channels | unverified (URL is the canonical FTC press-release slug; direct fetch 403'd) — counsel to re-verify dollar amounts |
| FTC press release — "crackdown on deceptive AI tutoring" (Sept 2024) | https://www.ftc.gov/news-events/news/press-releases/2024-09-25-ftc-announces-crackdown-deceptive-ai-tutoring-services | Stated initiative; not yet a series of named actions | unverified (direct fetch 403'd) — counsel to re-verify |
| FTC press release — 6(b) order, AI-chatbot operators (11 Sept 2025) | https://www.ftc.gov/news-events/news/press-releases/2025/09/ftc-launches-inquiry-impact-ai-chatbots-acting-companions | Order to 7 AI-chatbot operators; suicide/self-harm/abuse-handling inquiry | unverified (direct fetch 403'd on multiple URL variants) — counsel to re-verify |
| NetChoice v. Bonta (9th Cir. 2024) — California AADC partial injunction | https://cdn.ca9.uscourts.gov/datastore/opinions/2024/09/16/23-2969.pdf | Partial reversal of California AADC obligations | secondary (the synthesis cites the partial-injunction outcome; counsel to confirm the surviving provisions) |
| IAPP — FTC finalizes COPPA Rule amendments (16 Jan 2025) | https://iapp.org/news/a/ftc-finalizes-coppa-rule-amendments | IAPP summary of the 2025 COPPA Rule final amendments, including the Bedoya & Slaughter LLM-training-data retention-cap framing | secondary (IAPP is a primary-tracker source; the FTC final rule itself is the primary) |

### US — California AADC folded

| Source | URL | What it supports | Verification |
|---|---|---|---|
| California AADC (AB-2273) statutory text | https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?division=18.&chapter=22.5.&part=&lawCode=CIV | California AADC statutory text | secondary (the synthesis cites the law's existence; counsel to confirm what survives NetChoice v. Bonta) |

### UK — UK GDPR + DPA 2018 + Children's Code

| Source | URL | What it supports | Verification |
|---|---|---|---|
| UK GDPR Article 8 (post-Brexit) | https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/ | Threshold of 13 for UK digital consent | secondary (ICO landing page; direct fetch 403'd) — counsel to re-verify |
| Data Protection Act 2018 §123 | https://www.legislation.gov.uk/ukpga/2018/12/section/123 | Statutory basis for the Children's Code | verified (UK legislation.gov.uk is canonical) |
| UK ICO Children's Code (Age Appropriate Design Code) | https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/ | The Code itself, including Annex B (developmental bands) | unverified (direct fetch 403'd) — counsel to re-verify Annex B wording |
| Wikipedia — Age Appropriate Design Code | https://en.wikipedia.org/wiki/Age_appropriate_design_code | Background only; the synthesis cites Annex B from secondary literature, not this summary | secondary (used only as a navigation aid; counsel must verify Annex B against the live ICO document) |
| ICO v. TikTok (April 2023, £12.7M) | https://ico.org.uk/about-the-ico/media-centre/blog-ico-statement-on-tikTok-fine/ | £12.7M fine for processing data of ~1.4M UK children under 13 without parental consent | unverified (direct fetch 403'd) — counsel to re-verify |

### EU — GDPR

| Source | URL | What it supports | Verification |
|---|---|---|---|
| GDPR Article 8 | https://gdpr-text.com/read/article-8/ | Information-society services; consent at Member-State threshold; reasonable-efforts-to-verify | verified (gdpr-text.com is canonical) |
| GDPR Recital 38 | https://gdpr-info.eu/recitals/no-38/ | Children's specific protection; no age ladder inside the recital | verified (gdpr-info.eu is canonical) |
| EDPB Guidelines 05/2020 on consent (landing page) | https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en | EDPB consent guidance; the §3 paragraph-level text on platform-side consent is the load-bearing citation | unverified (landing page parsed; PDF body not directly fetched) — counsel to re-verify §3 paragraph text |
| EDPB Member-State consent-age tracking | https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en (Annex to the 05/2020 guidelines) | The 27-Member-State consent-age list (per synthesis) | unverified (EDPB tracker cited from secondary; counsel to re-verify the full 27-Member-State list) |
| Irish DPC — TikTok €345M fine (2024) | https://www.dataprotection.ie/en/news-media/press-releases/irish-data-protection-commission-fines-tiktok-eu345-million | Found platform-side mechanisms (e.g. "Family Pairing") insufficient to meet Art 8 | unverified (URL is the canonical DPC press-release slug; the synthesis cites the €345M from secondary summary) — counsel to re-verify amount and reasoning |
| Better Internet for Kids — Member-State consent age | https://www.betterinternetforkids.eu/ | EU Member-State consent-age summary | secondary (used as a navigation aid; the EDPB tracker is the primary) |

### EU — AI Act

| Source | URL | What it supports | Verification |
|---|---|---|---|
| AI Act Article 5 (Prohibited Practices) | https://artificialintelligenceact.eu/article/5/ | Art 5(1)(b) age-vulnerability exploitation prohibition; Art 5(1)(f) emotion-inference prohibition | verified (artificialintelligenceact.eu is canonical) |
| AI Act Article 27 (Fundamental Rights Impact Assessment) | https://artificialintelligenceact.eu/article/27/ | FRIA obligations for high-risk AI | verified |
| AI Act Article 50 (Transparency Obligations) | https://artificialintelligenceact.eu/article/50/ | AI disclosure to user requirement | verified |
| AI Act Annex III (High-Risk AI Systems) | https://artificialintelligenceact.eu/annex/3/ | §3 — high-risk classification for AI in education | verified |
| AI Act Recital 29 | https://artificialintelligenceact.eu/recital/29/ | Recital supporting Art 5(1)(b) | verified |
| AI Act Recital 48 | https://artificialintelligenceact.eu/recital/48/ | Recital supporting Art 50 children's-rights framing | verified |
| EUR-Lex — AI Act full text (Reg 2024/1689) | https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689 | Canonical EU regulatory text | unverified (synthesis links to artificialintelligenceact.eu; the EUR-Lex canonical is also valid) |

### EU — DSA

| Source | URL | What it supports | Verification |
|---|---|---|---|
| Digital Services Act — Article 28 | https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065 | Online protection of minors; profiling-ad ban | unverified (direct fetch not completed in sub-area pass; the synthesis cites the Art 28 text from secondary summary) — counsel to re-verify |
| European Commission — DSA Article 28 guidelines (May 2025) | https://digital-strategy.ec.europa.eu/en/policies/dsa-minors | "Likely to be accessed by minors" includes app stores distributing apps to minors | unverified (existence confirmed; primary text not directly fetched) — counsel to re-verify |

### Norway

| Source | URL | What it supports | Verification |
|---|---|---|---|
| Personopplysningsloven §5 | https://lovdata.no/dokument/NLE/lov/2018-06-15-38 | Norway's national implementation of GDPR Article 8; age of digital consent at 13 | verified (lovdata.no is canonical) |
| Markedsføringsloven (Marketing Control Act) | https://lovdata.no/dokument/NL/lov/2009-01-09-2 | Marketing-to-minors restrictions; Forbrukertilsynet enforcement | verified (lovdata.no is canonical) |
| Datatilsynet 2024 news index | https://www.datatilsynet.no/aktuelt/aktuelle-nyheter-2024/ | Datatilsynet's 2024 published positions; June 2024 Nordic DPA declaration | unverified (existence confirmed; specific text on AI-for-minors not located) — counsel to re-verify |
| Nordic DPA meeting declaration (Oslo, 30–31 May 2024) | https://www.datatilsynet.no/en/news/ | "Children's data protection in gaming, AI and administrative fines" | unverified (headline only; full text not retrieved) — counsel to re-verify |

---

## Layer 2 — Regulator interpretation

See Layer 1 sources for regulator publications; the Layer 2 bullets in the synthesis are derived from the same regulator URLs above. No additional Layer-2-specific URLs not already covered.

The one Layer-2-specific citation not in Layer 1:

| Source | URL | What it supports | Verification |
|---|---|---|---|
| IAPP COPPA enforcement tracker | https://iapp.org/news/?topic=coppa | The Epic Games / Google-YouTube case summaries | secondary (IAPP is a primary-tracker source; the FTC press releases themselves are primary) |

---

## Layer 3 — Platform terms (LLM providers)

| Source | URL | What it supports | Verification |
|---|---|---|---|
| OpenAI Model Spec | https://model-spec.openai.com/2025-12-18.html | §8 "Under-18 Principles"; "Red-line principles" — Root authority for U18 protections | verified |
| OpenAI Usage Policies (developer-facing) | https://openai.com/policies/usage-policies/ | Developer-level under-18 policy | unverified (direct fetch 403'd on every attempt) — counsel to re-verify |
| Google Gemini API Additional Terms | https://ai.google.dev/gemini-api/terms | "Age Requirements" — under-18 audience prohibition | verified |
| Anthropic Usage Policy | https://www.anthropic.com/legal/aup | "Do Not Compromise Children's Safety" — CSAM / grooming / sexualisation prohibition | verified |
| Anthropic Help Center — "products serving minors" article | https://support.claude.com/en/articles/8088676 | Anthropic's developer rules for products serving minors | unverified (302→404 from the canonical support URL) — counsel to re-verify |

---

## Layer 4 — Store terms and age-rating enforcement

| Source | URL | What it supports | Verification |
|---|---|---|---|
| Apple App Review Guidelines | https://developer.apple.com/app-store/review/guidelines/ | §1.4.1 and §5.1.1 (updated 2024) | unverified (URL marked "verify" in sub-area 2; primary text not directly fetched) — counsel to re-verify |
| Apple App Store age-rating framework | https://developer.apple.com/app-store/ratings/ | IARC band definitions and enforcement | unverified (URL marked "verify" in sub-area 2; primary text not directly fetched) — counsel to re-verify |
| Google Play Generative AI prohibited content policy | https://support.google.com/googleplay/android-developer/answer/13369793 | 2024 Generative AI policy; does not differentiate by age band | unverified (URL marked "verify" in sub-area 2; primary text not directly fetched) — counsel to re-verify |
| Google Play IARC / Designed for Families policy | https://support.google.com/googleplay/android-developer/answer/9888077 | IARC band enforcement; Families Policy; Designed for Families program | unverified (URL marked "verify" in sub-area 2; primary text not directly fetched) — counsel to re-verify |
| Google Play IARC band definitions | https://support.google.com/googleplay/android-developer/answer/9367762 | Per-band enforcement (9+, 12+, 16+) | unverified (URL marked "verify" in sub-area 2; primary text not directly fetched) — counsel to re-verify |
| Firebase Analytics under-13 mode | https://firebase.google.com/docs/analytics/configure-data-access | Under-13 mode documentation | unverified (URL marked "verify" in sub-area 2; primary text not directly fetched) — counsel to re-verify |
| Apple Parenting / Family Sharing documentation | https://developer.apple.com/app-store/parenting/ | Family Sharing mechanics and platform-side consent signals | unverified (URL marked "verify" in sub-area 2; primary text not directly fetched) — counsel to re-verify |
| IARC (International Age Rating Coalition) | https://www.globalratings.com/ | The IARC framework itself | verified (URL is canonical; the synthesis does not lean on this) |

---

## Layer 5 — Account-existence realities

| Source | URL | What it supports | Verification |
|---|---|---|---|
| Apple Family Sharing | https://support.apple.com/en-us/108788 | Family Sharing mechanics; child account creation flow | verified (Apple support canonical) |
| Google Family Link | https://families.google.com/familylink/ | Google Family Link mechanics; child account creation flow | verified (Google Families canonical) |
| FTC — COPPA Rule FAQs (actual knowledge) | https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-steps-compliance | The "asks for — and receives — info that allows operator to determine the person's age" standard | unverified (URL is canonical; direct fetch 403'd) — counsel to re-verify the actual-knowledge FAQ text |
| Wildec (FTC, 2019) — dating apps enforcement | https://www.ftc.gov/news-events/news/press-releases/2019-05-06-ftc-brings-first-ever-case-against-operators-mobile-apps-coppa | "Actual knowledge" established via app-collected data; Apple/Google pulled the apps | unverified (direct fetch 403'd; secondary sources cite the case) — counsel to re-verify |

---

## Layer 6 — Domain-specific overlay (LLM-for-minors)

The Layer 6 sources overlap heavily with Layers 1 (AI Act articles) and 2 (FTC 6(b) inquiry). See those sections for primary URLs. Layer-6-specific citations:

| Source | URL | What it supports | Verification |
|---|---|---|---|
| Codebase — `apps/api/src/services/llm/router.ts:316-462` | (in-repo) | The rung/provider/tier model with no age gate | verified (the synthesis cites the file:line) |
| Codebase — `apps/api/src/services/llm/envelope.ts:235-252` | (in-repo) | The envelope parse + sanitization + marker recognition; no post-envelope classifier attaches | verified (the synthesis cites the file:line) |
| Codebase — `apps/api/src/services/exchange-prompts.ts:552-558` | (in-repo) | The prompt-only crisis redirect | verified (the synthesis cites the file:line) |
| Codebase — `apps/api/src/services/memory/cascade-delete.ts:1-39` | (in-repo) | The cascade-delete primitive; no TTL | verified (the synthesis cites the file:line) |
| Codebase — `apps/api/src/services/sentry.ts:24-46` | (in-repo) | The api-side Sentry wrapper with no age gate or scrub | verified (the synthesis cites the file:line) |
| Codebase — `apps/mobile/src/lib/sentry.ts:166-206` | (in-repo) | The mobile-side Sentry age-gate (the comparator) | verified (the synthesis cites the file:line) |
| Codebase — `packages/schemas/src/age.ts:1` | (in-repo) | The `AgeBracket` two-way union | verified (the synthesis cites the file:line) |
| Codebase — `apps/api/src/services/llm/router.ts:207-226` | (in-repo) | The `getSafetyPreamble` function keyed on the `AgeBracket` union | verified (the synthesis cites the file:line) |
| Canonical doc — `data-model.md §4.9` (lines 160–165) | (in-repo) | The `person_retain` seam with deferred values | verified (the synthesis cites the file:line) |
| Canonical doc — `_wip/identity-foundation/data-model.md` | (in-repo) | Data model locked Phase E; MMT-ADR-0011 / 0012 | verified (the synthesis cites the file) |
| Canonical doc — `_wip/identity-foundation/identity-ontology.md` | (in-repo) | Identity ontology; consent edges | verified (the synthesis references this doc) |

---

## Verification worklist summary (for counsel in the room)

Of the citations above, the following are the **load-bearing unverified primaries** that should be prioritised for counsel re-verification before quoting in the walkthrough:

1. **ICO Children's Code Annex B** (most consequential — design-seam argument depends on it)
2. **EDPB Guidelines 05/2020 §3** (paragraph-level text on platform-side consent)
3. **FTC April 2025 COPPA Rule final amendments** (retention cap; affects Q19b cost)
4. **FTC 6(b) order (Sept 2025)** (the AI-for-kids precedent)
5. **OpenAI Usage Policies (developer-facing)** (consent / opt-in paths)
6. **Anthropic "products serving minors" Help Center** (sub-banding and disclosure posture)
7. **DSA Article 28 Commission guidelines (May 2025)** (app-store distribution-layer obligations)
8. **NetChoice v. Bonta (9th Cir. 2024) surviving AADC provisions** (the state-level US overlay)
9. **EDPB Member-State consent-age tracker** (the 27-Member-State list)
10. **Apple / Google IARC and AI policies** (Layer 4 enforcement)

The remaining unverified citations are enforcement-action dollar figures (Epic Games, Google/YouTube, TikTok) and Datatilsynet-specific text — these support Layer 2 enforcement-signal density but are not load-bearing for the Section 1 headline finding.

---

*End of sources.*
