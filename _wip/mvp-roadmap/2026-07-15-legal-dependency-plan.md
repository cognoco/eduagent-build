# Legal-dependency register & plan — MVP launch

**Status:** ACTIVE REGISTER (created at the 2026-07-15 lockdown sitting, LD2 input)
**Scope:** the 13 Compliance-Legal lane items + 3 counsel-gated strays (WI-1559, WI-1764, WI-2064). Companion: `2026-07-15-lockdown-lane-load-preread.md` §3.
**Mechanism:** dependency edges are encoded as native Cosmo `Blocked by`/`Blocking` relations (dual-linked) — this doc is the rationale and the plan; Cosmo is the live state.

## 0 · The core finding

**Counsel blocks gates, not dev.** Of the 16 items, none blocks a line of engineering work directly. They converge on three choke points:

- **WI-1577 — launch compliance closure FINAL GATE** (consumes DPIA, ROPA, breach plan, policy, DPAs, AI-Act go/no-go, entity fix, bearer-token posture)
- **WI-1335 — store submission** (consumes declarations, country config, published policy, and the WI-1577 gate itself)
- **WI-1506 — closed beta** (consumes crisis-helpline content via the shipped WI-1690 surface)

Everything upstream of those three gates — the entire Compliance-Eng chain, identity singletons, Core Learning Loop, Stream 2, store/billing infra setup — **runs at full speed with zero counsel input**. The plan is therefore: start the external clocks immediately, do the internal rulings this week, and sequence dev batches so nothing idles while paper rolls in.

## 1 · Classification (the three buckets)

### Bucket 1 — internal rulings/actions (we independently control) — lead time: DAYS

| WI | What | Note |
|---|---|---|
| WI-1110 | UK GDPR representative | The *decision* (serve UK at launch?) is internal; falls away if UK excluded. If IN: off-the-shelf service, fast |
| WI-1115 | Store country availability + hard-blocks | Console settings only; needs the launch-market ruling (same ruling as WI-1110) |
| WI-2064 | Consent-withdrawal bearer-token threat posture | Internal security ruling (owner + AC); engineering follows. STRICT docs tier (R1) |
| WI-1664 | School/institutional AI-Act tripwire | Internal docs gate; no MVP downstream edge (protects against *future* deployments) |

### Bucket 2 — GDPR/COPPA formalities (one set of external counsel + DPO) — lead time: WEEKS

| WI | What | Note |
|---|---|---|
| WI-1105 | Appoint outsourced DPO | **The longest pole's first segment** — the DPO owns the DPIA; nothing DPO-owned starts before engagement. Retainer procurement 1–2 wks |
| WI-1106 | Pre-launch DPIA | DPO-owned; needs WI-1105 + WI-1111 scope + WI-1559 entity. **Tail risk: if residual risk is judged too high, Datatilsynet prior consultation adds months** — the single worst-case calendar item |
| WI-1107 | ROPA | DPO/consultant templates in ~1 hr once engaged |
| WI-1108 | Breach response plan | One page + counsel review |
| WI-1109 | Privacy policy finalization + child summary | Draft exists (`docs/privacy-policy.html`); needs WI-1559 entity + WI-1105 DPO contact; counsel review then publish |
| WI-1192 | Art 28 DPAs + per-vendor TIAs | **External-calendar risk** — vendor signature loops are the least controllable multi-party tail. Carries OWD-T8b close criterion |
| WI-1194 | Counsel-approved retention periods (OPQ-24) | **Added at lockdown (2026-07-15, OPQ reconciliation)** — missed by the lane-scoped first pass: sits in Compliance-Eng, but its production retention values, purge and dormancy sweep are counsel-gated per category. The counsel dependency is intra-item (its own AC), so no WI→WI edge — OPQ-24 is the tracking vehicle |

### Bucket 3 — other legal rulings — lead time: EXTERNAL-CALENDAR

| WI | What | Note |
|---|---|---|
| WI-1659 | EU AI Act classification memo + obligation matrix | Specialist counsel question (may not be the GDPR counsel). Its go/no-go note feeds WI-1577; its matrix may mint follow-up WIs — a scope-discovery risk |
| WI-1663 | AI Act technical file / QMS skeleton | Mostly internal drafting, counsel review at the end; post-classification follow-on, no MVP gate edge |
| WI-1764 | Locale-correct crisis helpline content | Counsel packet answers (Q3, OPQ-22) determine jurisdictions + mandatory-reporting floor; then content sourcing. Feeds the shipped WI-1690 surface; must exist before real families use the app → gates WI-1506 |
| WI-1559 | Controller legal-entity ruling | **Re-bucketed at lockdown (2026-07-15): not internally rulable** — corporate-structure counsel question (which entity, which jurisdiction), distinct from the GDPR/COPPA counsel set. Already routed: the OPQ-22 counsel packet carries the controller-entity question. Still gates DPIA sign-off, policy publication, WI-1577 AC-4 |
| WI-1111 | Art 9 health/learning-disability ruling | **Re-bucketed at lockdown (2026-07-15): not internally rulable** — the 2026-06-08 OUT lean stands as input, but the ruling itself goes to counsel. Ride the OPQ-22 packet dispatch (add Art 9 as a packet question). Still gates WI-1106 DPIA scope. Tracked as OPQ-115 |

*(T8c consent-floor question: accepted-as-governed under WI-1114 per sitting-1 R2 — no separate row.)*

## 2 · Dependency edges (wired in Cosmo)

Blocker → blocked (`Blocking`/`Blocked by` dual relations):

```
WI-1105 (DPO)          → WI-1106 (DPIA), WI-1109 (policy)
WI-1111 (Art 9)        → WI-1106
WI-1559 (entity)       → WI-1106, WI-1109, WI-1577
WI-1106 (DPIA)         → WI-1577
WI-1107 (ROPA)         → WI-1577
WI-1108 (breach plan)  → WI-1577
WI-1109 (policy)       → WI-1114 (declarations), WI-1577
WI-1192 (DPAs/TIAs)    → WI-1577
WI-1659 (AI Act memo)  → WI-1577
WI-2064 (bearer token) → WI-1577
WI-1114 (declarations) → WI-1335 (store submission)
WI-1115 (country cfg)  → WI-1335
WI-1577 (FINAL GATE)   → WI-1335
WI-1764 (helplines)    → WI-1506 (closed beta)
```

No edges: WI-1110 (falls away or trivially parallel), WI-1663, WI-1664 (no MVP-gated downstream).

## 3 · Earliest-start plan (start the clocks)

| When | Action | Why |
|---|---|---|
| **Now (this week)** | Engage DPO retainer (WI-1105) | First segment of the longest pole; DPIA/ROPA/policy all queue behind it |
| **Now (this week)** | Dispatch the OPQ-22 counsel packet — now carrying **both** DPIA-scoping questions: WI-1559 entity + WI-1111 Art 9 | The DPIA can't be scoped without either answer; both were re-bucketed to counsel at lockdown, so the packet's dispatch date IS the clock start for the whole DPIA path |
| **Now (this week)** | Kick off WI-1192 vendor DPA loops | Least controllable tail; every week of delay is a week of calendar risk |
| **Next** | Commission WI-1659 AI-Act memo | Specialist counsel; also the scope-discovery risk — the earlier the matrix exists, the earlier any surprise WIs surface |
| **Next** | Send counsel packet questions gating WI-1764 (Q3, OPQ-22) | Content sourcing is fast once jurisdictions are known |
| **With launch-market ruling** | WI-1110 decision + WI-1115 console config | One internal ruling clears both |
| **Ordinary flow** | WI-1107, WI-1108, WI-1109 as DPO/counsel capacity allows | Short items; sequence within the retainer |
| **Ordinary flow** | WI-2064 internal ruling | Security posture; needed before WI-1577 re-run, not before any dev |

## 4 · Safe dev batches (what proceeds while paper rolls in)

- **Batch A — zero legal dependency, start/continue immediately:** the whole Compliance-Eng chain (WI-1985 → WI-2058, WI-1442, WI-1987/1988/1990, WI-1989 IDOR), identity canon pair (WI-2055/2056), store/billing *infrastructure* (WI-1328 RevenueCat, WI-1337 push creds), WI-1503 dogfood, WI-1588 activation instrumentation, all of Stream 2, Core Learning Loop, Safety & Eval engineering (WI-1986 fix per LD3).
- **Batch B — needs an internal ruling only (days, ours):** WI-1115 console config, WI-1114 *prep* (age rating settable now; data-safety forms drafted, submitted once the policy URL is live), WI-2064 engineering criterion.
- **Batch C — the paper track:** buckets 2–3 run on their own calendar into WI-1577/WI-1335/WI-1506. **Only these three gates wait.** Everything in Batch A can be *done and verified* before the last DPA signature lands.

**Bottom line:** with the clocks started this week, the plausible critical path to store submission is WI-1105 → WI-1106 → WI-1577 → WI-1335 (DPO engagement + DPIA sign-off), with WI-1192 vendor loops as the wildcard. Dev is never the thing waiting — unless the DPIA triggers Datatilsynet prior consultation, in which case everything about the launch date reopens.

## 5 · Operator Queue reconciliation (ruled 2026-07-15, lockdown sitting)

The 2026-07-11 gate sweep filed OPQ rows only for human gates *embedded in agent work* — the wholly-operator legal items fell through (only OPQ-22 packet, OPQ-41 helplines, OPQ-24 retention existed). **Ruled: Option 1 — every legal-track item gets an OPQ row; the OPQ is the operator's single working queue; this register + the Cosmo `Blocked by` edges remain the dependency SoR.**

Filed: **OPQ-102..115** — WI-1105→102, WI-1106→103, WI-1107→104, WI-1108→105, WI-1109→106, WI-1110→107, WI-1115→108, WI-1114→109, WI-1192→110, WI-1659→111, WI-1663→112, WI-1664→113, WI-2064→114, WI-1111→115. Deadlines set on the two clock-starts (OPQ-102 DPO engagement, OPQ-110 DPA-loop kickoff: 2026-07-24). WI-1559 has no separate row — the OPQ-22 counsel packet already carries the entity question.

**Standing rule going forward:** a new Compliance-Legal (or otherwise wholly-operator) work item gets an OPQ row filed at capture — lane membership doesn't exempt it from the queue.
