# Verification Pass — 2026-06-05

**Method:** every factual claim in `data.json` was decomposed into 70 atomic claims, then run through a
verify → adversarial-challenge → tiebreaker-judge workflow (`wf_4fef9b60-754`, plus 2 claims salvaged from
earlier runs). Verifiers researched against primary sources (statutes, regulators, court opinions, current
platform terms); every claim a verifier could not confirm at ≥0.90 was attacked by an independent
adversarial challenger; material verifier/challenger disagreements went to a tiebreaker judge.
Trusted overlay: the 45-claim verified findings from `docs/meetings/2026-06-04-age-floor-decision-minutes.md`.

**Outcomes:** 26 confirmed ≥0.9 · 38 corrected · 3 adjudicated · 1 refuted · 2 from prior runs.
`data.json` was updated in lockstep (v0.3.0-poc): cell rules corrected, confidences recomputed as the
minimum over each cell's verified backing claims, jurisdiction headers re-sourced to primaries.

**Raw evidence:** `verification-2026-06-05-verdicts.json` (full per-claim verdicts incl. evidence URLs).

## Headline corrections

1. **Denmark consent age is 15, not 13** (LOV nr 1783 af 28/12/2023, eff. 2024-01-01). EDPB tracker and
   Datatilsynet's own English PDF are stale. All DK cells re-thresholded.
2. **Estonia resolved: 13** (PDPA §8(1), in force 15.01.2019). The matrix's load-bearing "?" is closed.
3. **Slovakia 16 verified** (Act 18/2018 §15, consolidated slov-lex.sk) — the README's #1 flagged open cell.
4. **Gemini API under-18 prohibition binds in BOTH knowledge states** — objective "directed towards or
   likely to be accessed by under-18s" test; the synthesis "Gap A" actual-knowledge-trigger framing is
   REFUTED. Biggest consent-architecture consequence in the matrix.
5. **UK consent-age citation was wrong**: 13 comes from UK GDPR Art 8(1) as amended by SI 2019/419;
   DPA 2018 s.123 is the Children's Code provision. (CWSA 2026 added an SoS power to adjust within 13–16.)
6. **ICO Snap/BeReal "enforcement notices" refuted**: preliminary notice (Snap, closed compliant May 2024)
   and informal letters (BeReal) only; the £12.7M TikTok fine had its targeted-ads finding dropped.
7. **COPPA 2025 amendments fully in force** (compliance deadline 22 Apr 2026 passed): written-retention-policy
   duty + indefinite-retention ban (NO numerical cap); targeted-ads disclosure is a separate-VPC gate, not a ban.
8. **CA AADC posture updated to 9th Cir. NetChoice v. Bonta No. 25-2366 (12 Mar 2026)**: age-estimation/
   defaults/notices in effect; data-use restrictions, dark patterns, DPIAs enjoined; severability remanded.
9. **EDPB Guidelines 05/2020 citation fixed**: the consent-verification analysis is §7.1.3–7.1.4, not §3;
   the platform-credential-insufficiency point is matrix inference, not EDPB text.
10. **Irish DPC TikTok fine: Sept 2023** (not 2024), €345M verified, incl. €65M Family Pairing component.
11. **AI Act**: Commission Guidelines C(2025) 5052 now exist for Art 5(1)(b) (no tutor safe harbor);
    Annex III §3 likely does NOT cover a non-grading B2C tutor; Digital Omnibus defers standalone
    high-risk compliance to 2 Dec 2027 (pending OJ).
12. **EE marketing cells populated** (were "?"): Reklaamiseadus §8 is the load-bearing statute
    (not Tarbijakaitseseadus, as the gap note guessed).
13. **New state-law layer the corpus missed**: CA SB 243 (1 Jan 2026) + NY GBL §1700 (5 Nov 2025)
    companion-chatbot crisis duties can reach an emotionally-supportive tutor; NY CDPA, MD Kids Code, FL HB3.

## Still below 0.9 after verification (scoped uncertainty, not unverified citation)

- DSA Art 28(2) applicability to a private AI tutor (0.6) — "online platform" definition + micro/small exemption.
- Annex III record-keeping (0.55) — conditional on a high-risk classification that likely does not apply.
- Crisis-escalation Gap C instruments (0.78) — gap is real; which instrument binds structural routing is open.
- NO 3b account posture (0.78) — genuine regulatory silence.
- COPPA actual-knowledge organizational-awareness mechanics (0.83); US 3b posture (0.83).

## Per-claim verdict table

| Claim | Status | File conf | Verified conf |
|---|---|---|---|| `ee-gdpr-art8-derogation-unknown` | ADJUDICATED | 0.55 | 0.98 |
| `dk-markedsforingsloven-not-researched` | ADJUDICATED | 0.5 | 0.95 |
| `dk-gdpr-art8-age-13-derogation` | ADJUDICATED | 0.7 | 0.98 |
| `edpb-account-existence-not-consent-signal` | CONFIRMED | 0.75 | 0.85 |
| `aiact-eea-incorporation-pending-norway` | CONFIRMED | 0.55 | 0.9 |
| `ftc-section-5-residual` | CONFIRMED | 0.85 | 0.86 |
| `aiact-art5-1f-emotion-inference-education` | CONFIRMED_HIGH | 0.85 | 0.92 |
| `gdpr-art5-1e-storage-limitation` | CONFIRMED_HIGH | 0.55 | 0.9 |
| `aiact-annex-iii-3-education-high-risk` | CONFIRMED_HIGH | 0.7 | 0.92 |
| `consent-cannot-unlock-aiact-art5` | CONFIRMED_HIGH | 0.85 | 0.92 |
| `aiact-art26-deployer-notification` | CONFIRMED_HIGH | 0.65 | 0.92 |
| `aiact-art5-not-consent-unlockable` | CONFIRMED_HIGH | 0.85 | 0.93 |
| `openai-model-spec-root-u18-protections` | CONFIRMED_HIGH | 0.85 | 0.92 |
| `anthropic-csam-reporting-commitment` | CONFIRMED_HIGH | 0.85 | 0.93 |
| `ico-tiktok-fine-apr-2023` | CONFIRMED_HIGH | 0.75 | 0.97 |
| `uk-childrens-code-likely-accessed-scope` | CONFIRMED_HIGH | 0.8 | 0.97 |
| `aiact-art50-transparency-obvious-from-context` | CONFIRMED_HIGH | 0.85 | 0.92 |
| `sk-gdpr-art8-age-16-unverified` | CONFIRMED_HIGH | 0.4 | 0.97 |
| `coppa-directed-or-actual-knowledge-jurisdiction` | CONFIRMED_HIGH | 0.85 | 0.95 |
| `matrix-dimensions-160-cells` | CONFIRMED_HIGH | 1 | 0.99 |
| `us-coppa-age-13` | CONFIRMED_HIGH | 0.85 | 0.99 |
| `coppa-2025-separate-vpc-targeted-ads` | CONFIRMED_HIGH | 0.7 | 0.92 |
| `gr-sk-unpopulated-skeletons` | CONFIRMED_HIGH | 1 | 0.99 |
| `no-popplyl-s5-age-13` | CONFIRMED_HIGH | 0.8 | 0.92 |
| `coppa-vpc-methods` | CONFIRMED_HIGH | 0.85 | 0.95 |
| `ee-art8-default-16-until-derogation-research` | CONFIRMED_HIGH | 0.55 | 0.97 |
| `fr-gdpr-art8-age-15-derogation` | CONFIRMED_HIGH | 0.75 | 0.95 |
| `coppa-2025-biometric-govid-pii` | CONFIRMED_HIGH | 0.85 | 0.95 |
| `gr-gdpr-art8-age-15-derogation` | CONFIRMED_HIGH | 0.4 | 0.96 |
| `se-gdpr-art8-age-13-derogation` | CONFIRMED_HIGH | 0.8 | 0.97 |
| `datatilsynet-june-2024-nordic-declaration` | CORRECTED | 0.55 | 0.9 |
| `aiact-annex-iii-high-risk-record-keeping` | CORRECTED | 0.6 | 0.55 |
| `no-3b-account-posture-unclear` | CORRECTED | 0.65 | 0.78 |
| `fr-code-consommation-marketing-minors` | CORRECTED | 0.5 | 0.86 |
| `actual-knowledge-modifier-changes-cell` | CORRECTED | 0.85 | 0.6 |
| `ee-marketing-tarbijakaitse-gap` | CORRECTED | 0 | 0.83 |
| `ee-aiact-regulatory-sandbox` | CORRECTED | 0.65 | 0.82 |
| `ee-dsa-art28-profiling-ad-ban-eu-ms` | CORRECTED | 0.6 | 0.9 |
| `platform-terms-jurisdiction-independent` | CORRECTED | 0.75 | 0.85 |
| `apple-family-sharing-google-family-link-not-blessed` | CORRECTED | 0.75 | 0.9 |
| `datatilsynet-age-assurance-effective-not-nominal` | CORRECTED | 0.7 | 0.8 |
| `crisis-escalation-prompt-only-gap-c` | CORRECTED | 0.85 | 0.78 |
| `se-marknadsforingslagen-not-researched` | CORRECTED | 0.5 | 0.8 |
| `irish-dpc-tiktok-fine-2024` | CORRECTED | 0.7 | 0.98 |
| `gdpr-art6-9-lawful-basis-third-party` | CORRECTED | 0.55 | 0.86 |
| `no-markedsforingsloven-minor-protection` | CORRECTED | 0.65 | 0.9 |
| `uk-dpa2018-s123-age-13` | CORRECTED | 0.8 | 0.97 |
| `de-gdpr-art8-age-16-no-derogation` | CORRECTED | 0.75 | 0.95 |
| `coppa-actual-knowledge-doctrine` | CORRECTED | 0.85 | 0.83 |
| `coppa-2025-retention-cap` | CORRECTED | 0.7 | 0.97 |
| `coppa-2025-third-party-profiling-restriction` | CORRECTED | 0.7 | 0.93 |
| `ca-aadc-netchoice-bonta-status` | CORRECTED | 0.6 | 0.8 |
| `can-spam-not-child-specific` | CORRECTED | 0.55 | 0.8 |
| `ftc-6b-ai-chatbot-inquiry-sept-2025` | CORRECTED | 0.75 | 0.8 |
| `us-3b-account-posture-arguable` | CORRECTED | 0.75 | 0.83 |
| `uk-childrens-code-profiling-off-by-default` | CORRECTED | 0.65 | 0.9 |
| `dsa-art28-2-profiling-ad-ban-minors-eea` | CORRECTED | 0.65 | 0.6 |
| `uk-childrens-code-standards-bundle` | CORRECTED | 0.8 | 0.9 |
| `uk-art8-2-reasonable-efforts-analogue` | CORRECTED | 0.7 | 0.86 |
| `uk-no-ai-act-equivalent` | CORRECTED | 0.8 | 0.86 |
| `gdpr-art8-2-reasonable-efforts` | CORRECTED | 0.75 | 0.9 |
| `edpb-guidelines-05-2020-child-or-platform-insufficient` | CORRECTED | 0.75 | 0.85 |
| `gdpr-recital-38-child-marketing-protection` | CORRECTED | 0.7 | 0.95 |
| `gdpr-art22-recital71-automated-decisions-children` | CORRECTED | 0.7 | 0.93 |
| `aiact-art5-1b-age-vulnerability-prohibition` | CORRECTED | 0.85 | 0.85 |
| `de-bdsg-child-provisions` | CORRECTED | 0.55 | 0.9 |
| `uk-gdpr-art5-1e-storage-limitation` | CORRECTED | 0.55 | 0.88 |
| `floor-13-assumption` | CORRECTED | 0.85 | 0.9 |
| `gemini-under-18-audience-prohibition` | REFUTED_OR_REWRITTEN | 0.85 | 0.97 |
| `ico-snap-bereal-notices-2023-2024` | REFUTED_OR_REWRITTEN | 0.6 | 0.92 |

