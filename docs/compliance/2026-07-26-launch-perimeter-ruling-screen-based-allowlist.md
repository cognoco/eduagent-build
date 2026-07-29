# Launch Perimeter Ruling — Screen-Based Allowlist

**Ruled by:** Zuzana Kopecna (operator), 2026-07-26
**Status:** Active ruling. Supersedes the conflict between the 2026-07-12 GTM ruling ("worldwide incl UK/US") and the 2026-07-23 EEA country ruling (EEA threshold-13 only) by combining them: the EEA analysis stands, and non-EEA countries are admitted individually via a documented screen.
**Related:** `2026-07-23-13-plus-eea-launch-country-ruling.md` (EEA analysis — unchanged and incorporated), `2026-07-26-us-launch-screen-record.md` (first non-EEA screen application), DPO Interim DPIA Advice Record item A2 / confirmation M3.

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

Because ZWIZZLY AS is EEA-established, GDPR governs all processing regardless of user location. The screen never replaces GDPR compliance; it only checks what local law **adds**. For non-EEA minors, the working position (pending DPO concurrence) is that the Norwegian Article 8 implementation (threshold 13) applies as the law of the controller's establishment.

## Launch-day perimeter under this ruling

| Set | Countries | Route | Status |
|---|---|---|---|
| EEA threshold-13 | Per 07-23 register (Norway, Sweden, Portugal, …) | 1 | In, subject to that ruling's common gates + launch-day recheck |
| United States | US | 2 | Screen record drafted 2026-07-26 → DPO review |
| United Kingdom | UK | — | **Out at launch.** Fails (b) (Art 27 rep) and (c) (ICO Children's Code, Online Safety Act). Expansion candidate; reopens WI-1110 when triggered |
| Poland + other EEA higher-threshold | PL, DE, FR, etc. | — | **Out at launch.** Fails Route 1 (threshold >13). Expansion wave 1 once the guardian-authorization flow ships and per-country review completes |
| Switzerland | CH | — | **Out at launch.** Fails (b) (representative requirement); FADP screen possible later |
| Everywhere else | — | — | Out until screened on demand |

## GTM consequence (accepted)

Poland ad spend begins at expansion wave 1 (guardian-consent flow shipped + PL screen), not at day 1. Launch-day marketing focuses on the EEA threshold-13 set + US organic. The 2026-07-12 GTM ruling's market-focus logic (PL = paid focus, US = organic tail) is retained; only the day-1 availability changes.

## Proposed M3 response text (for the DPO Advice Record)

> Confirmed with revision: the launch perimeter consists of (i) EEA countries whose launch-day verified Article 8 self-consent threshold is 13, per our maintained country register, and (ii) non-EEA jurisdictions individually cleared by a documented admission screen (procedure attached) confirming that our 13+ age floor satisfies local child-consent requirements, that no local representative or registration duties apply at our scale, and that no material local regime exceeds our GDPR-level controls. The United States is the first jurisdiction cleared under (ii) (screen record attached). Uncertain, higher-threshold, and unscreened countries remain unavailable, enforced by store distribution configuration and in-app residence gating.

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
