# Google Play territory configuration manifest — 2026-07-30.1

- **Owner of console application:** **OPQ-108 — territory configuration operator**

**Status:** Prepared fail-closed manifest — **zero territories activatable now**

This manifest translates the active launch-country rulings into a Play
distribution posture. It does not activate countries and must not be read as
legal advice or proof of residence enforcement.

```yaml
manifest_version: 2026-07-30.1
policy_sources:
  - docs/compliance/2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md
  - docs/compliance/2026-07-23-13-plus-eea-launch-country-ruling.md
  - docs/compliance/evidence/2026-07-30-country-register-reverification-procedure.md
default: disabled
activatable_now: []
route_1_candidates_disabled_pending_common_gates:
  - BE
  - EE
  - FI
  - IS
  - LV
  - MT
  - "NO"
  - PT
  - SE
route_2_candidates_disabled_pending_conditions:
  - US
higher_threshold_disabled:
  - AT
  - BG
  - CY
  - IT
  - LT
  - ES
  - CZ
  - DK
  - FR
  - GR
  - SI
  - HR
  - DE
  - HU
  - IE
  - LI
  - LU
  - NL
  - PL
  - RO
  - SK
explicitly_disabled_non_eea:
  - CH
  - GB
all_other_territories: disabled_unscreened
```

`NO` is quoted because YAML parsers can otherwise interpret it as a boolean in
older YAML modes.

## Why the activatable set is empty

The nine Route 1 rows are candidates only. The governing EEA ruling records
`enabled_eea_country_allowlist = []`, and each candidate still requires common
gates, localization, and a launch-day legal-source recheck. Norway and Portugal
have named unstable-law rechecks.

The United States is provisionally screened, not finally admitted. It remains
disabled until the five conditions in the 2026-07-30 US screen are closed,
including the Texas age-signal work, companion-chatbot ruling/trigger,
KOSA/KIDS recheck, minors-never-payers verification, and signed management risk
acceptance. Any required local-counsel confirmation must also be recorded.

The production enforcement evidence is incomplete: the re-verification
procedure states that the DB country-policy resolver is called only from tests.
Play country selection can restrict distribution, but cannot substitute for an
in-app habitual-residence gate.

## Activation rule

OPQ-108 may move a country into an operator change set only when all of these
are attached for that country:

- dated source re-verification and `legalReviewedAt`/validity evidence;
- active-ruling route and threshold;
- common privacy/legal/DPO gates closed;
- native-reviewed notice and support coverage for the launch language(s);
- tested in-app residence/age/consent enforcement evidence;
- management approval and, for Route 2 where required, local-counsel input;
- before/after Play territory export or screenshots;
- rollback owner and verification time.

If any field is stale, unsupported, unknown, legally unverified, or above the
implemented consent threshold, the country remains disabled.

## Storefront is not residence

The Play account/storefront country is a distribution signal. It is not
authoritative habitual residence and must not populate or override the
application’s residence-jurisdiction decision. A user can travel, change store
country, use a family payment profile, or access an already-installed app.
Server enforcement must use the approved residence determination and fail
closed independently of Play availability.

## Operator application record

Do not fill this table until the two-key gate authorizes a console change.

| Applied at | Operator | Before export | Countries changed | After export | Residence-gate evidence | Rollback verified |
| --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — |
