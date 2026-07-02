# Q6 — Process/state integrity (timeboxed)

## Question
Does Cosmo state match reality for the relevant workstreams and high-impact work items?

## Scope
- Included: WS-18 (identity cutover) + WS-28 (v2 finalization) full item rosters with
  Stage/State/Resolution; cross-check against DB reality (Q2/Q3), the canonical plan doc (Q5),
  and git.
- Excluded (prep): WS-25 review backlog full read; per-item comment/AC deep read (Fable lead).
- Timebox: roster + state table + contradiction list.

## Method
- Notion REST (`NOTION_TOKEN`, bulk MCP plan-gated) — DB `f170be9e04ae45d4961828f2438666bd`,
  filtered by `Workstream` relation to WS-18 (`3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8`) and
  WS-28 (`38f8bce9-1f7c-8185-96b2-e79cb1a458fe`). Raw: `artifacts/cosmo-ws28.tsv`, `cosmo-ws18.tsv`.
- Timestamp: 2026-07-02.

## Findings

| ID | Claim | Severity | Confidence | Evidence | Gap / caveat |
| --- | --- | --- | --- | --- | --- |
| Q6-F1 | **The dropped-legacy-table hazard already caused a LIVE PROD incident.** WI-1255 (Closed/Done, = origin/main tip a52b8282f): *"v1-pinned scheduledDeletion resumes into dropped legacy tables — LIVE prod 500 + GDPR-deletion may silently not complete."* | critical | high | `cosmo-ws18.tsv` WI-1255; commit a52b8282f | Fixed, but proves Q1's live-legacy-reader risk is real, not theoretical. Are there more un-swept v1-pinned paths? → WI-1254/WI-1239 open. |
| Q6-F2 | **Legacy-reader convergence is NOT complete — actively in progress.** WI-1239 (Executing): "Converge legacy-identity-table READERS (account/consent/billing non-v2) to v2-only". WI-1254 (Ready): "779 §7.3 exhaustive legacy-reader sweep + remediation". | high | high | `cosmo-ws18.tsv` | Directly answers Q1 at the process level: cutover-completeness is an OPEN workstream, not done. Corroborate with Q1 code sweep. |
| Q6-F3 | **Every DB divergence I found is a KNOWN, tracked item** — not undiscovered drift. stg orphan `subscriptions` → WI-1250 (Captured); dev on legacy → WI-1141 (Backlog) + WI-1139 (Ready, remove legacy schema defs); freeze-repoint → WI-1128. | info | high | `cosmo-ws18.tsv` cross-ref Q2/Q3 | Reframes Q2/Q3 severity: managed backlog, not silent corruption. Still LIVE/unclosed. |
| Q6-F7 | **STALE-CAPTURE CORRECTION (freeze SHA `145e74d5e`):** the `cosmo-ws18.tsv` snapshot (captured ~08:00, WI-1128=Blocked) is superseded by git. A **WI-1128 deploy-unblock slice LANDED** at 11:42 (`56b9ded15`) making the committed journal tail replayable (see Q3-F7). **WI-367** (exact-birth-date age gating) also landed (`145e74d5e`) — was Executing in the capture. The *full* WI-1128 freeze-repoint promotion is still NOT done (freeze-only 0117/0118/0119 remain out-of-journal). | info | high | `git log a4798547e..origin/main`; `git show 56b9ded15`, `145e74d5e` | Cosmo captures age fast on this active workstream; git is the fresher source. |
| Q6-F4 | **Canonical plan doc is STALE vs Cosmo.** The 2026-06-30 "living priority plan" marks T3/WI-1170, T4/WI-1171, T7/WI-1174 as unchecked `[ ]`; Cosmo marks all three **Closed/Done**. | medium | high | `docs/plans/2026-06-30-v2-publish-readiness-canonical-plan.md` (origin/main) vs `cosmo-ws28.tsv` | Likely closed *after* the 2026-06-30 snapshot; but the doc calls itself "living / update item by item". Q5 coherence signal. |
| Q6-F5 | **Data-hygiene: WI-1249 is a blank work item** (no Name, Stage, State, Resolution) in WS-18. | low | high | `cosmo-ws18.tsv` WI-1249 row all-empty | Cosmo record hygiene; not a code risk. |
| Q6-F6 | **WS-28 had 5 open items at capture** (Executing/Refining): WI-1207 (Practice access on Journal), WI-1175 (publish-readiness review itself), WI-1124 (cross-writer lifecycle test + GC6), WI-1120 (card/celebration animation), WI-904 (dictation pacing, Refining). | medium | high | `cosmo-ws28.tsv` | The v2-finalization workstream is not closed. Ship decision must account for these. **STALE-CAPTURE (freeze `145e74d5e`, cf. Q6-F7):** WI-1207 code LANDED (`0c053c06f` + `8060b4ae0`) and WI-1120 code LANDED (`ed3806ef6` reduced-motion assertion) — Cosmo may lag the merges. Verify Cosmo status vs git before counting them open. |

### WS-18 open items (identity cutover — not Closed)
| ID | Stage | State | Name |
| --- | --- | --- | --- |
| WI-1254 | Ready | Active | 779 §7.3 exhaustive legacy-reader sweep + remediation |
| WI-1250 | Captured | – | Drop orphaned legacy `subscriptions` table on staging (WI-779 strip step 4 slice) |
| WI-1239 | Executing | Active | WI-779-E converge legacy-identity READERS (account/consent/billing) to v2-only |
| WI-1162 | Captured | Active | Decide v2 payer fields in GDPR account export |
| WI-1141 | Backlog | Active | Dev: flip `IDENTITY_V2_ENABLED=true` for dev↔prod parity |
| WI-1139 | Ready | Active | WI-779-D remove legacy identity table defs from schema package (converges dev DB) |
| WI-1128 | Ready | **Blocked** *(capture ~08:00; a deploy-unblock SLICE landed 11:42 — see Q6-F7)* | Mechanical FK-repoint profiles.id→person.id + subscriptions.id→subscription (WI-779 residual / freeze 0117) |
| WI-779 | Ready | Active | WP-FLAG remove `IDENTITY_V2_ENABLED` + legacy schema/twins (umbrella residual) |
| WI-752 | Executing | Active | ADR governance correction & re-vetting |
| WI-367 | Executing | Active | Persist full birth date for exact age across age logic |

### High-signal CLOSED items (materialized seam bugs — evidence the seam is fragile)
- **WI-1255** live prod 500 + GDPR deletion gap (v1-pinned deletion → dropped tables).
- **WI-1161** `GET /v1/account/export` 500 — export-v2 parsed raw v2 subscription row against legacy-named schema.
- **WI-1138** consent-deny deleted payer subscription row without Stripe store teardown (GDPR provider leak).
- **WI-828** operator-executed 0118 legacy-identity-table drop; **WI-805** dropped legacy `subscriptions` + swept ~18 billing/quota readers.

## Contradictions
- **Canonical plan vs Cosmo** (Q6-F4) — resolved as: Cosmo is newer; plan checkboxes not updated. Recorded, not reconciled in code.
- Handover §4.5 named WI-1102/1118/1120 as process observations — confirmed present (WI-1102 Closed/Done; WI-1118 Closed/Done; WI-1120 still Executing). WI-1246 (commit `2b7fdf876`) confirmed in git — the `/commit` shared-main fork guard.

## Fable prompts
- Given WS-18 still has open items incl. WI-1239 (readers not converged) and the WI-1128 *full*
  freeze-repoint promotion (only the deploy-unblock slice landed — Q6-F7), is "identity cutover
  complete" defensible? What gates the remaining WI-1128 promotion? (Ties to WI-779 operator
  decision — read the raw WI-779 Cosmo record, not the §1-excluded analysis docs.)
- WI-1255 was a live prod incident from a v1-pinned path hitting dropped tables. Does WI-1254's "exhaustive sweep" have a completion gate, or could sibling un-swept paths still 500 in prod?
- Is the stale canonical plan (Q6-F4) a one-off or a pattern of doc/Cosmo drift across WS-28?
