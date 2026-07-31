# US Deep Dive — Post-DPO-Response Legal Surface (2026-07-30)

**Prepared:** 2026-07-30 (desk research, sources dated inline; agent-drafted for management)
**Trigger:** DPO consolidated response 2026-07-30 — Stephan concurred on the GDPR element only and expressly disclaimed US federal/state law ("my confirmation as DPO cannot constitute substantive legal clearance under US federal or state law"). US admission is therefore a pure management decision under Route 2 of the perimeter ruling, resting on the screen record + signed risk acceptance.
**Relation to `2026-07-26-us-launch-screen-record.md`:** deepens and partially supersedes the criterion-(c) table; the screen record remains the admission instrument. Findings below must be folded into it before the risk acceptance is signed.

## Frame: who owns what

| Layer | Owner | Status |
|---|---|---|
| GDPR applied to US users (Art 8 threshold-13 reading) | DPO advice → management | Concurred 2026-07-30 (reasoned interpretation, 5 conditions) |
| US federal/state law | **Management alone** (+ local counsel only where a named material question remains — narrowing reading pending, reply Q2) | This document |
| Contractual capacity of minors to subscribe | Management (billing-model design) | §6 below |

## 1. App Store Accountability Acts — timeline SHRANK; Texas is live NOW

Verified 2026-07-30:

- **Texas (SB 2420): in effect since 2026-01-01** — the Fifth Circuit stayed the preliminary injunction, so the law operates ([MoFo](https://www.mofo.com/resources/insights/251111-texas-targets-app-stores-with-new-accountability-law)). **Apple's developer-side rollout (age-category signals, consent status APIs, "significant change" notices) went live from 2026-06-04** ([Apple developer notice](https://developer.apple.com/news/?id=sg176nne)).
- **Utah: compliance deadline extended to 2027-05-06**; AG enforcement removed — **private right of action is now the exclusive enforcement mechanism** ([Alston & Bird](https://www.alstonprivacy.com/challenge-to-utahs-app-store-accountability-act-voluntarily-dismissed-following-statutory-amendments/), [Stoel Rives](https://www.stoel.com/insights/publications/utahs-app-store-accountability-act-goes-into-effect)).
- **Louisiana: delayed to 2027-07-01** ([Alston & Bird](https://www.alstonprivacy.com/louisiana-delays-app-store-accountability-effective-date-to-july-2027/)).

**Consequence for WI-1116 (US state age-signal handling):** launch-relevant scope is **Texas only**. Developer duties: (1) assign accurate age rating; (2) consume the store-provided age-category signal; (3) confirm store-obtained parental consent before minor download/purchase/IAP; (4) notify stores of significant changes to terms/privacy policy; (5) use age/consent signals only for age-gating, legal compliance, safety ([Wiley](https://www.wiley.law/alert-State-App-Store-Accountability-Acts-Introduce-New-Obligations-for-App-Developers), [FPF comparison chart](https://fpf.org/wp-content/uploads/2026/06/FPF-Legislation-TX-UT-LA-App-Store-Accountability-Act-Comparison-Chart.pdf)). Much of the burden sits with Apple/Google; our side is consuming the signals via the store APIs live since June 2026. UT/LA duties re-screen at their 2027 dates.

## 2. NEW — state AI-companion laws (NOT in the 07-26 screen; a category gap)

The 07-26 screen checked "state social-media minors laws" (correctly N/A — we have no social features) but did not screen the **companion-chatbot category**. Two laws are in force, **neither has a revenue/user threshold**:

### California SB 243 (companion chatbots) — effective 2026-01-01

- Scope: AI providing "adaptive, human-like social interactions" sustaining relationship-like exchanges; exemptions cover customer-service bots, limited-dialogue game characters, voice assistants — **no education exemption** ([Skadden](https://www.skadden.com/insights/publications/2025/10/new-california-companion-chatbot-law), [Gunderson](https://www.gunder.com/en/news-insights/insights/client-insight-california-sb-243-new-compliance-requirements-for-operators-of-ai-companion-chatbots)).
- Duties: clear disclosure of AI nature where a reasonable person could be misled; crisis/self-harm protocols (no responses to suicidal-ideation content; referral to crisis resources); minor-specific measures; annual reporting from 2027-07-01.
- Enforcement: **private right of action** — greater of actual damages or **$1,000 per violation** + attorney's fees ([Jones Walker](https://www.joneswalker.com/en/insights/blogs/ai-law-blog/ai-regulatory-update-californias-sb-243-mandates-companion-ai-safety-and-accoun.html)).

### New York GBL Art 47 (AI companions) — effective 2025-11-05

- Scope: three-part relationship-simulation test — (i) retains information across sessions to personalize; (ii) asks **unprompted emotion-based questions**; (iii) sustains ongoing dialogue about personal matters ([Fenwick](https://www.fenwick.com/insights/publications/new-yorks-ai-companion-safeguard-law-takes-effect), [Davis Polk](https://www.davispolk.com/insights/client-update/california-and-new-york-launch-ai-companion-safety-laws)).
- Duties: AI disclosure at session start **and every 3 hours**; suicidal-ideation detection + crisis referral protocols.
- Enforcement: NY AG, up to **$15,000/day**.

### Applicability to MentoMate — genuinely arguable, and coupled to the knows-me unlock

- **At launch under the DPO interim conditions, persistent memory + profiling are DISABLED** — prong (i) of the NY test (cross-session personalization) is then literally off, and the CA "sustained relationship" reading weakens correspondingly. A mentor that forgets between sessions is a much weaker companion-law target.
- **The moment the knows-me feature unlocks** (closing DPO actions 3/4/6), prong (i) is satisfied by design; "mentor" positioning, persona naming, and any unprompted emotional check-ins push toward scope. **Enabling persistent memory is therefore a US-law reassessment trigger, not just a GDPR one.**
- Mitigating posture already built: persistent in-chat AI disclosure (`ChatShell` aiDisclosure, satisfies the disclosure duty in substance), safety tripwire + crisis escalation (aligns with the required self-harm protocols). Gap analysis needed on: NY 3-hour re-disclosure cadence, CA minor break-reminders, CA 2027 annual report, and documented protocol records in the form the statutes require.
- Options if scope is conceded: comply (mostly incremental given built safety features) — geo-excluding CA/NY is NOT currently possible (residence gating is per-country, not per-state) and would gut the US market anyway.

## 3. KOSA / KIDS Act — still not law; contested

House passed the KIDS Act (H.R. 7757) 267–117 on 2026-06-29 (duty-of-care dropped; consolidates KOSA + COPPA 2.0 + data-broker registry + age-verification measures). Senate co-authors Blumenthal/Blackburn declared the House version unacceptable; Senate Commerce planned its own July markup with duty-of-care retained ([Crowell](https://www.crowell.com/en/insights/client-alerts/house-advances-bipartisan-kids-online-safety-bill-but-senate-showdown-looms), [The Hill](https://thehill.com/homenews/house/5946180-house-passes-kids-online-safety-package/), [EFF](https://www.eff.org/deeplinks/2026/07/house-passed-kids-act-senate-should-reject-it)). **Launch-day recheck stands** (screen condition (ii)); if enacted, 30-day re-screen per existing trigger.

## 4. State AADCs and privacy laws — thresholds still shield; one 2027 trigger added

- **Nebraska AADC (in effect 2026-01-01, AG penalties from 2026-07-01, up to $50k/violation):** applies only to businesses deriving **>50% revenue from selling/sharing personal data** — N/A to us ([WSGR](https://www.wsgr.com/en/insights/nebraska-and-vermont-pass-age-appropriate-design-codes.html), [FPF](https://fpf.org/blog/vermont-and-nebraska-diverging-experiments-in-state-age-appropriate-design-codes/)).
- **Vermont AADC: effective 2027-01-01**, under-18 scope, highest-privacy defaults — add to monitoring triggers (our GDPR child-safety defaults likely already conform; verify at trigger).
- CA/SC AADC + CCPA positions from the 07-26 screen unchanged (thresholds shield; monitor ~25k US users).

## 5. Smaller items confirmed or noted

- **Utah AI Policy Act (genAI disclosure):** satisfied in substance by the persistent AI disclosure.
- **State mental-health chatbot laws (IL, NV, UT):** target AI *therapy* services. Out of scope for an education product — **standing marketing constraint: never position MentoMate as mental-health or emotional-wellbeing support in the US**.
- **Subscriptions/auto-renewal:** all US billing runs exclusively through Apple/Google IAP (RevenueCat); the stores' consent, disclosure, and cancellation flows carry the state auto-renewal mechanics. Store-listing copy should be reviewed against the standard IAP disclosure checklist at store-submission time.

## 6. Contractual capacity of minors (DPO flagged, ours to resolve)

US infancy doctrine: contracts with minors are generally **voidable by the minor**. Exposure = a minor payer disaffirms and claims refunds; at our scale and price point the realistic exposure is small, but the clean answer is structural:

- **Rule: minors are never payers in the US.** Paid tiers for under-18s run through the parent/guardian owner account (payer≠user model — parent pays, learner uses). A 13–17 solo owner stays on Free; upgrading requires an adult owner (this also matches the TX ASAA store-level parental-consent flow for minor IAP).
- Verify current product state against this rule before the risk acceptance: whether a 13+ solo owner can reach a purchase surface, and whether the store-level minor-purchase consent (Apple/Google under TX ASAA) covers the residual path if so.

## 7. Revised condition set for US admission (feeds the risk acceptance)

| # | Condition | Status 2026-07-30 |
|---|---|---|
| 1 | WI-1116 — **narrowed to Texas**: consume store age-category + consent signals (Apple APIs live since 2026-06-04), accurate age rating, significant-change notices; UT/LA re-screen 2027 | Open — engineering decision + integration |
| 2 | Companion-chatbot ruling: adopt the position that launch-state MentoMate (memory off) is out of NY/CA scope; wire **knows-me unlock → mandatory re-assessment** (gap analysis: NY 3-hour cadence, CA minor break reminders, CA 2027 report) | New — this doc |
| 3 | KOSA/KIDS launch-day recheck | Standing |
| 4 | Minors-never-payers rule verified in product + billing | New — verify |
| 5 | Management risk acceptance signed (screen criterion d) | Pending 1–4 |

**New monitoring triggers to add to the screen record:** Vermont AADC 2027-01-01; UT ASAA 2027-05-06; LA ASAA 2027-07-01; knows-me/persistent-memory enablement (companion-law re-assessment); any US marketing copy implying emotional support.

## Bottom line

The US remains admissible on the screen-based route, and the 07-26 screen's conclusions hold — but two things it didn't see now shape the conditions: **Texas ASAA is already live** (WI-1116 is narrower but more urgent than assumed), and **companion-chatbot laws (CA SB 243, NY GBL 47) are the sharpest un-screened edge** — thresholds don't shield us, CA carries a private right of action, and applicability flips from "arguably out" to "likely in" the day persistent memory turns on. The risk acceptance should be signed against the §7 condition set, not the original four.
