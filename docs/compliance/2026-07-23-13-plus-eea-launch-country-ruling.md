# 13+ EEA Launch Perimeter — Child Consent Ages and Country Ruling

**Status:** Product/compliance ruling for launch planning; external privacy and AI-regulatory counsel sign-off still required  
**As of:** 2026-07-24 — launch/expansion and pre-launch status clarified<br>
**Scope:** EEA residents only (EU-27 + Iceland, Liechtenstein, Norway)  
**Explicitly excluded:** United Kingdom  
**Controller assumed:** ZWIZZLY AS, established in Norway  

> This is a primary-source regulatory research note, not legal advice or a
> legal-safety guarantee. “Launch” below means a country may enter a technical
> allowlist only after the common launch gates and any country caveats in this
> note are closed.

## Ruling

### Intended age brackets

MentoMate's launch age policy is:

| Age | Product status | Consent treatment |
|---|---|---|
| 0–12 | **Unavailable at launch in every country.** | No account creation, guardian workaround, or store availability should enable use. |
| 13–17 | **Minor.** | At initial launch, the learner is eligible only where their age has reached a currently verified Article 8 threshold of 13 for their country of habitual residence. Higher-threshold countries remain disabled until the later expansion phase supplies verified guardian authorization. Under-18 safety, transparency, profiling, and billing protections continue even where self-consent is valid. |
| 18+ | **Adult.** | Adult consent/capacity rules apply. |

There is no single EEA-wide “teen” consent age. Within the 13–17 bracket, the
product must compute:

```text
guardian_authorization_required =
  learner_age < article_8_age_for_residence_country
```

At initial launch, a `true` result means the country/age combination is
unavailable. In the later expansion phase, it enters the jurisdiction-correct
guardian-authorisation flow.

The comparison must use exact date of birth, not birth year. The governing
product input is habitual residence, not nationality, UI language, IP address,
or app-store country. Unknown or conflicting residence must fail closed.

This is consistent with the current [ROPA](./ropa.md), which assigns consent
under GDPR Article 6(1)(a) to minor learning data and profiling and expects the
teen or guardian to grant it according to consent capacity.

### Country decision

MentoMate will use one **13+ product floor across all enabled countries**, but
the initial launch and later expansion have different enablement rules.

**Initial launch:** enable only EEA countries whose current, verified Article 8
threshold is 13. A 13–17-year-old in those countries may self-consent. Every
higher-threshold, unknown, stale, unsupported, or legally unverified country
remains disabled.

**Later expansion:** add further countries MentoMate can lawfully and
operationally support after the DB-mastered country matrix/resolver and the
jurisdiction-correct guardian-authorisation flow are implemented, legally
verified, tested, and enabled. In that phase:

- threshold 13: ages 13–17 may self-consent;
- threshold 14: age 13 requires guardian authorization;
- threshold 15: ages 13–14 require guardian authorization; and
- threshold 16: ages 13–15 require guardian authorization.

All 30 EEA countries remain within the **future support research perimeter**,
subject to the common gates and country caveats below. Only the nine age-13
countries are candidates for the **initial launch allowlist**. This is an
operational risk-reduction decision, not a claim that a 13+ service can never
operate in higher-threshold countries.

**Portugal's current threshold is 13, but it requires a launch-day legal
refresh.** Its Parliament is actively considering
[Bill 398/XVII/1](https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheIniciativa.aspx?BID=304173)
— proposed child protection rules for digital environments; in committee-stage
scrutiny during 2026. Portugal is not excluded merely because the bill is
pending, but it must not be enabled until counsel confirms the then-current
threshold and any additional enacted duties. The bill is not treated here as
enacted law.

**Norway's current threshold is 13, but that rule is not stable enough to cache.**
The Ministry of Justice's 2025 proposal to raise the threshold to 15 remains
under consideration. Norway remains in the EEA policy perimeter because the
proposal is not enacted and the controller is established there. Counsel must
recheck the proposal and current statute immediately before launch; if the
threshold changes, ages 13–14 require guardian authorization or must remain
unavailable.

**The UK stays denylisted.** This note neither analyzes nor clears UK GDPR, the
Children's Code, UK representative requirements, consumer law, or Online Safety
Act obligations.

## Launch enforcement condition

This ruling determines which country-and-age combinations may be enabled. It
does not itself enable a country.

Before launch, the approved release must:

- obtain an exact date of birth and habitual-residence country;
- resolve an effective, legally verified country rule from a DB-mastered
  registry;
- allow initial access only where the person is at least 13 and has reached
  that country’s Article 8 threshold;
- fail closed for unknown, unsupported, stale, unverified, or disabled rules;
- preserve the policy version and jurisdiction used for the decision; and
- enforce the same country decision at onboarding, AI processing, and store
  availability.

The launch evidence must demonstrate those outcomes against the exact release
and configuration submitted for approval. Internal delivery status is tracked
separately and is not part of this policy ruling.

## What Article 8 does — and does not — answer

[GDPR Article 8](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679)
sets a default age of 16 when all of the following are true:

- the service is an information-society service offered directly to a child;
- the processing relies on consent under Article 6(1)(a); and
- national law has not lowered the threshold, which it may do only as far as
  age 13.

Below the applicable age, authorization must come from the holder of parental
responsibility and the controller must make reasonable efforts to verify it.
Article 8(3) expressly leaves national contract law untouched.

The [EDPB's Guidelines 05/2020](https://www.edpb.europa.eu/documents/guideline/guidelines-052020-on-consent-under-regulation-2016679_en)
confirm that Article 8 is limited to consent-based processing for a directly
offered information-society service. Other lawful bases are not prohibited in
principle, but they are not a shortcut around child protection, fairness,
necessity, or national capacity rules. Because MentoMate's present ROPA uses
consent for learning data and profiling, this ruling applies the Article 8
threshold rather than attempting a launch-time lawful-basis change.

The [European Commission's child-data guidance](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data/are-there-any-specific-safeguards-data-about-children_en)
also requires reasonable age-verification efforts and child-facing information
in clear, plain language.

Accordingly:

- “13+” is a product floor, not an EEA-wide self-consent rule.
- An app-store age rating is not proof of age or parental responsibility.
- A guardian checkbox alone is not verified authorization.
- Self-consent under Article 8 does not prove capacity to buy a subscription or
  enter every contractual term.
- Choosing contract or legitimate interests for a purpose does not make child
  safeguards disappear; any lawful-basis change requires a purpose-by-purpose
  ROPA/DPIA and counsel review.

## EEA country and consent matrix

“13 self-consent?” below concerns only consent-based processing within Article
8. It does not mean that a 13-year-old can independently buy the service or
that the country has no additional child rules.

| Residence country | Article 8 age | Can a 13-year-old self-consent? | Guardian authorization band within a 13+ product | Primary source | Launch disposition / caveat |
|---|---:|---|---|---|---|
| Belgium | 13 | Yes | None within 13–17 | [Belgian Data Protection Authority — consent](https://www.dataprotectionauthority.be/professioneel/avg/rechtsgronden/toestemming) | May be enabled after common gates; guardian-free at 13. |
| Estonia | 13 | Yes | None within 13–17 | [Personal Data Protection Act §8, current consolidated Riigi Teataja text](https://www.riigiteataja.ee/en/eli/507112023002/consolide) | May be enabled after common gates; guardian-free at 13. |
| Finland | 13 | Yes | None within 13–17 | [Data Protection Act §5, Finlex](https://www.finlex.fi/en/legislation/2018/1050) | May be enabled after common gates; guardian-free at 13. |
| Iceland | 13 | Yes | None within 13–17 | [Act 90/2018 Article 10, current Alþingi law collection](https://www.althingi.is/lagas/nuna/2018090.html#G10) | May be enabled after common gates; guardian-free at 13. |
| Latvia | 13 | Yes | None within 13–17 | [Personal Data Processing Law §33, Likumi](https://likumi.lv/ta/en/en/id/300099-personal-data-processing-law) | May be enabled after common gates; guardian-free at 13. |
| Malta | 13 | Yes | None within 13–17 | [Malta IDPC — national legislation, including S.L. 586.11](https://idpc.org.mt/our-office/legislation/) | May be enabled after common gates; guardian-free at 13. Counsel should retain the operative subsidiary legislation in the launch evidence pack. |
| Norway | 13 under current law | Yes under current law | None within 13–17 under current law | [Personal Data Act §5, Lovdata](https://lovdata.no/dokument/NLE/lov/2018-06-15-38/%C2%A75); [official proposal to raise the threshold to 15](https://www.regjeringen.no/no/dokumenter/horing-endringer-i-personopplysningsloven-aldersgrense-for-barns-samtykke-ved-bruk-av-informasjonssamfunnstjenester-sosiale-medier-mv/id3114264/) | May be enabled after common gates, but launch-day counsel must confirm the proposal remains unenacted and update the threshold if needed. |
| Portugal | 13 | Yes under current law | None within 13–17 under current law | [Law 58/2019, Diário da República](https://diariodarepublica.pt/dr/detalhe/lei/58-2019-123815982); [official education authority summary](https://www.dge.mec.pt/node/2941) | May be enabled after common gates and a launch-day recheck of [Bill 398/XVII/1](https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheIniciativa.aspx?BID=304173) and the Diário da República. |
| Sweden | 13 | Yes | None within 13–17 | [Swedish Authority for Privacy Protection — consent](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/samtycke/) | May be enabled after common gates; guardian-free at 13. Capacity for consent outside Article 8 and contracting remains context-specific. |
| Austria | 14 | No | Age 13 | [Austrian DPA decision applying DSG §4(4), RIS](https://www.ris.bka.gv.at/JudikaturEntscheidung.wxe?Abfrage=Dsk&Dokumentnummer=DSBT_20250211_2024_0_195_679_00) | Enable only with the age-13 guardian flow and national review. |
| Bulgaria | 14 | No | Age 13 | [Personal Data Protection Act Article 25c, CPDP](https://cpdp.bg/en/legislation/personal-data-protection-act/) | Enable only with the age-13 guardian flow and national review. |
| Cyprus | 14 | No | Age 13 | [Cyprus DPA — child registration guidance](https://www.dataprotection.gov.cy/dataprotection/dataprotection.nsf/page1g_gr/page1g_gr?OpenDocument) | Enable only with the age-13 guardian flow and national review. |
| Italy | 14 | No | Age 13 | [Privacy Code Article 2-quinquies, Garante](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9536089) | Enable only with the age-13 guardian flow, age-appropriate notices, and national review. |
| Lithuania | 14 | No | Age 13 | [Law on Legal Protection of Personal Data Article 6, e-Seimas](https://e-seimas.lrs.lt/rs/legalact/TAD/3e1ba58238c711edbf47f0036855e731/) | Enable only with the age-13 guardian flow and national review. |
| Spain | 14 | No | Age 13 | [AEPD FAQ applying Organic Law 3/2018 Article 7](https://www.aepd.es/preguntas-frecuentes/10-menores-y-educacion/FAQ-1001-cual-es-la-edad-para-que-los-menores-puedan-prestar-consentimiento-para-tratar-sus-datos-personales) | Enable only with the age-13 guardian flow and national review. |
| Czechia | 15 | No | Ages 13–14 | [Act 110/2019 §7, official e-Sbírka](https://e-sbirka.gov.cz/sb/2019/110?zalozka=text) | Enable only with the ages-13–14 guardian flow and national review. |
| Denmark | 15 | No | Ages 13–14 | [Data Protection Act, consolidated 2024 text](https://www.retsinformation.dk/eli/lta/2024/289); [Danish DPA consent guidance](https://www.datatilsynet.dk/Media/0/C/Samtykke%20%283%29.pdf) | Enable only with the ages-13–14 guardian flow. Note that Denmark raised the threshold from 13 to 15 effective 2024. |
| France | 15 | No | Ages 13–14 | [Data Protection Act Article 45, CNIL](https://www.cnil.fr/fr/le-cadre-national/la-loi-informatique-et-libertes) | **Special implementation:** below 15, the statute requires joint consent of the child and holder of parental authority, not a parent-only grant. |
| Greece | 15 | No | Ages 13–14 | [Law 4624/2019 Article 21, Hellenic DPA](https://www.dpa.gr/el/polites/prostasia) | Enable only with the ages-13–14 guardian flow and national review. |
| Slovenia | 15 | No | Ages 13–14 | [ZVOP-2 Article 8, official PISRS gazette](https://pisrs.si/api/uradni-list/objava/u2022163.pdf) | Enable only with the ages-13–14 guardian flow and national review. |
| Croatia | 16 | No | Ages 13–15 | [Implementation Act Article 19, Croatian DPA](https://azop.hr/national-legislation/) | Enable only with the ages-13–15 guardian flow; threshold text is tied to children permanently resident in Croatia. |
| Germany | 16 | No | Ages 13–15 | [BfDI GDPR/BDSG guide, Article 8](https://www.bfdi.bund.de/SharedDocs/Downloads/DE/Broschueren/INFO1.pdf?__blob=publicationFile&v=27) | Enable only with the ages-13–15 guardian flow and national review. |
| Hungary | 16 | No | Ages 13–15 | [NAIH GDPR handbook](https://naih.hu/files/handbook_the_gdpr_made_simpler_for%20smes_eng.pdf) | GDPR default applies; enable only with the ages-13–15 guardian flow and national review. |
| Ireland | 16 | No | Ages 13–15 | [Irish DPC parental-consent guide](https://www.dataprotection.ie/sites/default/files/uploads/2023-04/DPC_ChildrensData_ParentalConsent.pdf) | **High-scrutiny enablement.** In addition to guardian consent, perform a documented gap review against the DPC's [Children's Fundamentals](https://www.dataprotection.ie/en/dpc-guidance/blogs/the-children-fundamentals). |
| Liechtenstein | 16 | No | Ages 13–15 | [Consolidated Data Protection Act, official legislation portal](https://www.gesetze.li/konso/2018272000) | No lowering provision was located in the consolidated national act, so the GDPR default is used. Enable only with the ages-13–15 guardian flow and counsel confirmation. |
| Luxembourg | 16 | No | Ages 13–15 | [CNPD — consent and children](https://cnpd.public.lu/en/professionnels/obligations/liceite/consentement.html) | Enable only with the ages-13–15 guardian flow and national review. |
| Netherlands | 16 | No | Ages 13–15 | [Dutch Government GDPR manual](https://open.overheid.nl/documenten/ronl-dd12795b-eaa8-4e23-b552-96ef285cb9ad/pdf) | Enable only with the ages-13–15 guardian flow and national review. |
| Poland | 16 | No | Ages 13–15 | [Polish UODO — child consent](https://uodo.gov.pl/pl/493/2261) | Enable only with the ages-13–15 guardian flow and national review. |
| Romania | 16 | No | Ages 13–15 | [Romanian DPA FAQ](https://www.dataprotection.ro/index.jsp?page=IntrebariFrecvente1) | Enable only with the ages-13–15 guardian flow and national review. |
| Slovakia | 16 | No | Ages 13–15 | [Act 18/2018 §15, Slov-Lex](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2018/18/?ucinnost=21.05.2026) | Enable only with the ages-13–15 guardian flow and national review. |

Count check: 30 EEA states = 9 at age 13, 6 at age 14, 5 at age 15,
and 10 at age 16.

## Implementation sequence

The initial launch is limited to the verified threshold-13 countries below.
Higher-threshold countries are later expansion waves, not members of the
initial launch allowlist. Every country remains technically disabled until its
common gates, national review, localisation, and applicable consent controls
are complete.

### Wave 0 — Norway home-market pilot

**Norway** is the lowest-friction first jurisdiction:

- the controller is established there;
- the current Article 8 threshold is 13;
- there is no within-product guardian-consent band for a 13+ service; and
- the regulator and governing national law are known.

This is still not a declaration that Norway is launch-ready. The common privacy,
AI, consumer, safeguarding, security, and operational gates below still apply.
The pending proposal to raise Norway's threshold to 15 must be rechecked
immediately before launch, and the 13–14 cohort must fail closed if the law
changes.

### Wave 1 — remaining guardian-free-at-13 countries

The remaining low-friction implementation wave is:

- Belgium
- Estonia
- Finland
- Iceland
- Latvia
- Malta
- Sweden

These countries share the key advantage that every eligible launch user
(13+) has reached the national Article 8 threshold. They still require
localized child-facing notices and withdrawal/deletion paths.

Portugal can be included once the live legislative proposal is rechecked and
counsel confirms the launch-day position.

### Wave 2 — age-14 and age-15 consent bands

Add only after verified guardian authorization is implemented and evidenced
for launch:

- Age 14: Austria, Bulgaria, Cyprus, Italy, Lithuania, Spain
- Age 15: Czechia, Denmark, France, Greece, Slovenia

France needs a country-specific joint-consent state: child plus parental
authority for ages 13–14. A generic “guardian approved” boolean is not enough
to evidence that sequence.

### Wave 3 — age-16 consent band

Add only after the same guardian system, national review, and stronger
child-design evidence:

- Croatia, Germany, Hungary, Ireland, Liechtenstein, Luxembourg, Netherlands,
  Poland, Romania, Slovakia

Ireland should be its own sub-wave because the DPC's Children's Fundamentals
apply broader, documented expectations to services directed at, intended for,
or likely to be accessed by children.

## Establishment and representative analysis

### GDPR / EEA

The GDPR was incorporated into the EEA Agreement by
[EEA Joint Committee Decision 154/2018](https://www.efta.int/sites/default/files/documents/legal-texts/eea/other-legal-documents/adopted-joint-committee-decisions/2018%20-%20English/154-2018%20-declaration.pdf).
ZWIZZLY AS is therefore an EEA-established controller.

[GDPR Article 27](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679)
requires a representative for controllers or processors not established in the
territory covered by the Regulation when Article 3(2) applies. On the stated
facts, serving EEA residents from the Norwegian establishment does **not**
create a separate GDPR representative requirement in every EU/EEA country.
The main-establishment/one-stop-shop mechanism in Article 56 may make the
Norwegian Datatilsynet the lead supervisory authority for cross-border
processing, subject to the factual location of central administration and
decision-making. It does not remove local complaint or supervisory powers.

This conclusion is limited to GDPR representation. It does not clear local
consumer, tax, education, advertising, accessibility, or child-protection
requirements.

### AI Act — a separate representative risk that must not be missed

As of this note, the EU AI Act is still
[under scrutiny for EEA incorporation](https://www.efta.int/eea-lex/32024r1689);
it is not yet incorporated into the EEA Agreement. For EU-market purposes a
Norwegian provider may therefore be a third-country provider under the EU act.

Application dates are moving and must not be reduced to one launch-day
assumption. The current
[EU AI Act text](https://eur-lex.europa.eu/eli/reg/2024/1689/) states general
application from **2 August 2026**, with staged exceptions in Article 113.
Article 50 requires users interacting directly with an AI system to be informed
unless that fact is obvious. Following the 7 May political agreement, the
[Council gave final approval on 29 June 2026](https://www.consilium.europa.eu/en/press/press-releases/2026/06/29/artificial-intelligence-council-gives-final-green-light-to-simplify-and-streamline-rules/)
to an amending regulation that moves the stand-alone Annex III high-risk rules,
including education, to **2 December 2027**. The Council stated that the act
would enter into force three days after Official Journal publication. The
Official Journal citation, entry-into-force date, consolidated text, and EEA
status must therefore be checked rather than relying on either the original
Article 113 date or a press release alone. Article 22 requires a third-country
provider of a **high-risk AI system** to appoint an authorized representative
established in the EU before making that system available on the EU market.

MentoMate's classification cannot be assumed from the label “AI tutor.”
Annex III includes certain educational systems used to evaluate learning
outcomes or steer learning processes in educational and vocational training
institutions, while the precise intended purpose and institutional context
matter. Therefore, before any EU-country launch:

1. counsel must document whether MentoMate is outside Annex III, is listed but
   qualifies for Article 6(3)'s no-significant-risk exception, or is high-risk;
2. if it is high-risk while ZWIZZLY AS remains a third-country provider for EU
   AI Act purposes, the EU authorized-representative requirement must be
   resolved; and
3. the assessment and any required Article 49 registration must be retained.

This issue does **not** block a Norway-only pilot on the same EU-market theory,
but Norwegian implementation and EEA-incorporation status must be rechecked at
that pilot's launch date.

## Common gates before any country is enabled

The country matrix answers only the child-consent-age question. No country
becomes “safe” until all of the following are closed:

1. **External privacy/legal review and accountable approval.** Obtain the
   appointed DPO’s advice where applicable and counsel input where required;
   accountable management approves the ROPA, DPIA, lawful bases, international
   transfers, retention, child notices, and consent evidence.
2. **AI Act classification and territorial analysis.** Close the Article 22,
   Article 49, Article 50, and Annex III questions above before an EU launch.
3. **Reliable age and residence assurance.** Record exact age and habitual
   residence with a risk-proportionate assurance method; fail closed on
   ambiguity; re-evaluate jurisdiction changes and birthdays.
4. **Verified guardian authorization.** Before enabling a country for any age
   below its national threshold, verify both adult identity/age and parental
   responsibility, bind the grant to child, purpose, policy version,
   jurisdiction, threshold snapshot, assurance method, and time, and support
   withdrawal. France also needs the child's grant.
5. **Child-facing transparency.** Localize the privacy/consent experience in
   language a child in the target market can readily understand. An
   English-only legal notice is not a pan-EEA launch surface.
6. **Adult-owned commercial relationship at first launch.** Treat Article 8
   self-consent as a data-protection result, not contractual capacity. Until
   national teen contract-capacity and digital-content rules are reviewed,
   require an adult to be the subscriber/payer for paid plans. App-store
   billing does not by itself settle the underlying capacity question.
7. **No advertising or behavioral-marketing expansion by inference.** This
   research does not clear targeted advertising, third-party tracking, or
   marketing profiling of minors.
8. **Country allowlist enforcement.** Gate onboarding and store distribution
   using a DB-mastered, effective-dated resolver and an independently
   configured store allowlist. Explicitly deny the UK,
   Switzerland, the US, and every other non-EEA jurisdiction not separately
   cleared. Store listing is an interim compliance-load-bearing control, not a
   permanent substitute for server enforcement.
9. **Operational rights and incident readiness.** Test access, export,
   correction, deletion, consent withdrawal, guardian-authority changes,
   processor incidents, and regulator/contact paths before launch.
10. **Launch-day legal refresh.** Recheck national thresholds, Norway's
    threshold proposal, Portugal's bill, EU AI Act/EEA status, and regulator
    guidance immediately before each country wave.

## Decision record

The launch-country policy produced by this ruling is:

```text
minimum_age = 13
future_eea_support_research_perimeter = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU",
  "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE"
]
enabled_eea_country_allowlist = []
initial_launch_candidate_threshold = 13
article_8_threshold_by_residence = {
  13: ["BE", "EE", "FI", "IS", "LV", "MT", "NO", "PT", "SE"],
  14: ["AT", "BG", "CY", "IT", "LT", "ES"],
  15: ["CZ", "DK", "FR", "GR", "SI"],
  16: ["HR", "DE", "HU", "IE", "LI", "LU", "NL", "PL", "RO", "SK"]
}
launch_day_live_law_recheck = ["NO", "PT"]
denylist = ["GB"]
non_eea_countries = "disabled unless separately ruled"
```

The future-support perimeter expresses the intended expansion scope, not the
initial launch. The empty enabled allowlist records the current implementation
truth: no country is enabled by this document alone. For initial launch, add
only threshold-13 countries after their common gates, launch-day legal review,
and localisation are complete. Add higher-threshold countries only in the later
expansion phase after their jurisdiction-correct guardian flow is implemented,
legally verified, tested, and enabled. The UK and every other non-EEA country
require a separate ruling before support.

## Primary framework sources

- [GDPR, including Articles 3, 6, 8, 12, 13, 27, 35, 37, and 56 — EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679)
- [EDPB Guidelines 05/2020 on consent](https://www.edpb.europa.eu/documents/guideline/guidelines-052020-on-consent-under-regulation-2016679_en)
- [European Commission — safeguards for children's data](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data/are-there-any-specific-safeguards-data-about-children_en)
- [EEA Joint Committee Decision 154/2018 — GDPR incorporation](https://www.efta.int/sites/default/files/documents/legal-texts/eea/other-legal-documents/adopted-joint-committee-decisions/2018%20-%20English/154-2018%20-declaration.pdf)
- [EU AI Act — EUR-Lex](https://eur-lex.europa.eu/eli/reg/2024/1689/)
- [EFTA EEA-Lex status for the EU AI Act](https://www.efta.int/eea-lex/32024r1689)
