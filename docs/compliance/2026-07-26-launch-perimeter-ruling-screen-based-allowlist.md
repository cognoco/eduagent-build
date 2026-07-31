# Launch Perimeter Ruling — Screen-Based Allowlist

**Ruled by:** Zuzana Kopecna (operator), 2026-07-26
**Status:** Active ruling. Supersedes the conflict between the 2026-07-12 GTM ruling ("worldwide incl UK/US") and the 2026-07-23 EEA country ruling (EEA threshold-13 only) by combining them: the EEA analysis stands, and non-EEA countries are admitted individually via a documented screen.
**Related:** `2026-07-23-13-plus-eea-launch-country-ruling.md` (EEA analysis — unchanged and incorporated), `2026-07-26-us-launch-screen-record.md` (first non-EEA screen application), DPO Interim DPIA Advice Record item A2 / confirmation M3.

> **DPO response 2026-07-30.** Stephan agreed with the allowlist methodology but revised the M3 wording (his text is authoritative — see "M3 response text" below): the **US is provisionally screened, NOT finally admitted** until WI-1116, the launch-day rechecks, and the signed management risk acceptance close; Route 2 admissions may additionally require local-counsel confirmation "where material local-law questions remain" (our narrowing reading — counsel only where the screen names an unresolved material question management cannot risk-accept — is with him for confirmation, reply Q2 of 2026-07-30). He concurred on the Norwegian Art 8 threshold-13 reading for non-EEA minors, with five conditions and only as a *reasoned legal interpretation* covering the GDPR element alone — it does not establish US-law compliance or a minor's contractual capacity to subscribe. The DPO-agreement scope amendment below is superseded by his replacement wording (accepted verbatim, see `DPO exchanges/2026-07-30-reply-consolidated-response-draft.md` §5).

## The rule

The launch perimeter is an **allowlist** (enforced via store distribution config + in-app residence gating, per the 07-23 ruling's control model). A country enters the allowlist through exactly one of two routes:

**Route 1 — EEA:** the country's current, verified Article 8 self-consent threshold is 13, per the country register in the 07-23 ruling, with its common gates, launch-day recheck, and localisation complete.

**Route 2 — non-EEA screen:** a dated, per-country screen record concluding ALL of:

- **(a) Age:** the country's child-consent / child-privacy age requirements are satisfied by our 13+ floor and existing age gate;
- **(b) No local footholds required:** no local representative, registration, DPO-equivalent, or licensing requirement applies to us at our scale;
- **(c) No material extra regime:** no child-safety, AI, or platform regime imposes material obligations beyond what our GDPR-level controls already deliver — including threshold analysis where local laws only bind businesses above revenue/user counts (record the thresholds and a monitoring trigger);
- **(d) Risk acceptance:** management signs the screen record, accepting residual risk and the named revisit triggers.

Countries are screened **on demand** — no attempt to screen the world up front. Any country not on the allowlist is unavailable (store-level + residence gate).

## GDPR baseline (applies to every user, everywhere)

Because ZWIZZLY AS is EEA-established, GDPR governs all processing regardless of user location. The screen never replaces GDPR compliance; it only checks what local law **adds**. For non-EEA minors, the working position is that the Norwegian Article 8 implementation (threshold 13) applies as the law of the controller's establishment — **DPO concurred 2026-07-30** as a reasoned legal interpretation (no CJEU/EDPB authority on point), conditional on: the individual actually being 13+, consent otherwise GDPR-valid, the purpose genuinely relying on consent, age assurance proportionate to risk, and the Norwegian threshold unchanged at launch. Covers the GDPR element only.

## Launch-day perimeter under this ruling

| Set | Countries | Route | Status |
|---|---|---|---|
| EEA threshold-13 | Per 07-23 register (Norway, Sweden, Portugal, …) | 1 | In, subject to that ruling's common gates + launch-day recheck |
| United States | US | 2 | **Provisionally screened (DPO 2026-07-30), not finally admitted** — pending WI-1116 closure, launch-day rechecks, signed risk acceptance |
| United Kingdom | UK | — | **Out at launch.** Fails (b) (Art 27 rep) and (c) (ICO Children's Code, Online Safety Act). Expansion candidate; reopens WI-1110 when triggered |
| Poland + other EEA higher-threshold | PL, DE, FR, etc. | — | **Out at launch.** Fails Route 1 (threshold >13). Expansion wave 1 once the guardian-authorization flow ships and per-country review completes |
| Switzerland | CH | — | **Out at launch.** Fails (b) (representative requirement); FADP screen possible later |
| Everywhere else | — | — | Out until screened on demand |

## GTM consequence (accepted)

Poland ad spend begins at expansion wave 1 (guardian-consent flow shipped + PL screen), not at day 1. Launch-day marketing focuses on the EEA threshold-13 set + US organic. The 2026-07-12 GTM ruling's market-focus logic (PL = paid focus, US = organic tail) is retained; only the day-1 availability changes.

## M3 response text (for the DPO Advice Record — DPO's revised wording, adopted 2026-07-30)

> Confirmed with revision: Management has adopted an allowlist-based launch perimeter consisting of (i) EEA countries whose launch-day verified Article 8 self-consent threshold is 13, subject to the maintained country register and the applicable common launch gates, and (ii) non-EEA jurisdictions individually assessed through a dated admission screen. Admission under route (ii) requires closure of all identified conditions, documented management risk acceptance and, where material local-law questions remain, confirmation from appropriately qualified local counsel. The DPO's confirmation is limited to GDPR and EEA/Norwegian data-protection aspects and does not constitute legal clearance under non-EEA law. The United States has been provisionally screened as the first Route 2 candidate but is not finally admitted until the outstanding conditions in the US screen, including WI-1116, the launch-day rechecks and signed management risk acceptance, have been closed. Uncertain, higher-threshold and unscreened countries remain unavailable, enforced through store-distribution configuration and in-app residence gating.

*(Our originally proposed M3 text of 2026-07-26 is superseded by the above.)*

## Proposed DPO services agreement amendment (scope clarification)

In "DPO tasks — Information and advice", change:

> "…obligations under the GDPR, the Norwegian Personal Data Act and other applicable data-protection requirements"

to:

> "…obligations under the GDPR, the Norwegian Personal Data Act and other applicable EEA/Norwegian data-protection requirements. Compliance with non-EEA legal regimes (including US federal and state law and UK law) remains the Company's responsibility and is outside the statutory DPO scope, without prejudice to the GDPR's application to all of the Company's processing regardless of user location."

## Revisit triggers

- Any admitted country's law changes (register re-verification procedure, 07-23 ruling).
- US: KOSA/KIDS Act enactment; reaching ~25k US users (approach of CA/SC consumer-count thresholds); Colorado AI Act effective 2027-01-01.
- Norway raising its threshold to 15 (pending proposal) — would reshape Route 1's home-market anchor.
- Guardian-authorization flow shipping → opens expansion wave 1 (PL + other higher-threshold EEA).
