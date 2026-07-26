# Non-EEA Admission Screen Record — United States

**Screen date:** 2026-07-26 (desk research; sources dated inline)
**Screened under:** `2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md`, Route 2
**Conclusion:** PASS, conditional on (i) DPO concurrence on the GDPR/Norwegian-threshold reading for non-EEA minors, (ii) launch-day recheck of the KOSA/KIDS Act, (iii) resolution of the App Store Accountability Acts item via WI-1116 (see table row — no thresholds shield us there), and (iv) the monitoring triggers below.
**Status:** Draft → send to DPO with the M1–M7 response package. Not final until management signs the risk acceptance (criterion d).

## (a) Age — PASS

- **COPPA** (federal) governs only under-13s. Our 13+ age floor with an age gate at registration keeps COPPA dormant, provided we avoid "actual knowledge" of under-13 users (existing posture; the age gate plus no under-13 marketing satisfies this). The 2025 COPPA Rule amendments did not change the under-13 scope.
- No US federal law sets a 13–17 consent age for a tutoring service; state minors' laws are addressed under (c).
- **GDPR side (applies regardless):** as an EEA-established controller we apply GDPR to US users. Working position: the Norwegian Article 8 implementation (threshold 13) applies as the law of our establishment for non-EEA residents, so a US 13-year-old may self-consent. **This reading is put to the DPO for concurrence — it is the one open legal question in this screen.**

## (b) No local footholds — PASS

- No US federal or state law requires a local representative, registration, or DPO-equivalent for a foreign consumer app at our scale.

## (c) No material extra regime at our scale — PASS with monitoring

| Regime | Status (as screened 2026-07-26) | Applies to us? |
|---|---|---|
| **CCPA/CPRA** (California) | Thresholds: >$25M revenue, or ≥100k CA consumers/households, or ≥50% revenue from selling/sharing personal data | **No** — pre-launch, far below all thresholds. Monitor. |
| **California AADC** (design code) | Ninth Circuit partially vacated the injunction 2026-03-12; mandate 2026-04-03 — coverage definition stands, several provisions (data-use restrictions, dark patterns) remain enjoined, age-estimation remanded ([Cooley](https://www.cooley.com/news/insight/2026/2026-03-30-netchoice-v-bonta-ninth-circuit-narrows-injunction-against-californias-ageappropriate-design-code-act), [Holland & Knight](https://www.hklaw.com/en/insights/publications/2026/03/ninth-circuit-issues-mixed-ruling-on-california-age-appropriate-design)) | **No** — applies only to CCPA "businesses"; we are below thresholds. Note: our GDPR-child-safety controls already deliver most AADC substance (DPIA, high-privacy defaults, no dark patterns). Monitor litigation + thresholds. |
| **South Carolina AADC** | Signed 2026-02-05, operational 2026-03-01; thresholds: >$25M revenue, or ≥50k consumers' data, or ≥50% revenue from data sales ([Goodwin](https://www.goodwinlaw.com/en/insights/publications/2026/07/alerts-technology-south-carolina-age-appropriate-design-code-how-impact-business), [Wilson Sonsini](https://www.wsgr.com/en/insights/south-carolina-becomes-fifth-state-to-enact-age-appropriate-design-code-law.html)) | **No** — below thresholds. Monitor (fifth state AADC; more expected). |
| **State social-media minors laws** (TX SCOPE, FL, UT, etc.) | Target social-media platforms (feeds, social interaction features) | **No** — a tutoring app without social features is outside their platform definitions. TODO: brief per-law confirmation at launch-day recheck. |
| **Colorado AI Act** | Amended + delayed to 2027-01-01 by SB 189 (signed 2026-05-14); narrowed to disclosure/transparency for certain automated decision systems ([Hunton](https://www.hunton.com/privacy-and-cybersecurity-law-blog/colorado-ai-act-amended-and-effective-date-delayed), [Clark Hill](https://www.clarkhill.com/news-events/news/colorados-ai-law-delayed-until-june-2026-what-the-latest-setback-means-for-businesses/)) | **Not at launch** — not in force until 2027; narrowed scope likely inapplicable (tutoring ≠ consequential decisions). Re-screen before 2027-01-01. |
| **KOSA / KIDS Act** (federal) | House passed the amended KIDS Act (H.R. 7757) 2026-06-29; Senate pending; **not law** ([Congress.gov](https://www.congress.gov/crs-product/IF12730), [The Hill](https://thehill.com/homenews/house/5946180-house-passes-kids-online-safety-package/)) | **Not now** — launch-day recheck required; if enacted, re-screen (duty-of-care provision was removed in the House version, reducing likely impact). |
| **App Store Accountability Acts** (TX SB 2420, UT, LA) | State laws requiring app stores to verify user age and obtain parental consent for minors' downloads; developer-side duties include consuming the store-provided age-category signal and honouring parental-consent status. **No revenue/user thresholds** — apply regardless of scale. | **OPEN — must be resolved before this screen is final.** Obligations fall primarily on Apple/Google, but the developer-side signal handling is ours. WI-1116 (decide + integrate US state age-signal handling) is the tracked resolution item; its outcome (integrate the store age signal, or document why our own 13+ gate + store-level consent flow satisfies the acts) must be attached to this screen before the risk acceptance is signed. |
| **FTC Act §5** (unfair/deceptive) | Always applies | Baseline: our privacy notices must match actual practice — already a GDPR requirement. No extra build. |

## (d) Risk acceptance — pending signature

Management accepts residual risk on the basis above, with these **monitoring triggers**:

1. **~25k US users** → re-run this screen (approach of the 50k SC / 100k CA consumer thresholds; design-code obligations would then apply and require a compliance review, not just a note).
2. **KOSA/KIDS Act enacted** → re-screen within 30 days.
3. **2026-12-01** → Colorado AI Act pre-effective re-screen.
4. **CA AADC litigation** movement on the remanded age-estimation provision → note-and-assess.

Signed (management): ____________________ Date: ____________
