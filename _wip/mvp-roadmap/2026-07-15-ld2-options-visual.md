# LD2 options — visual

**The dependency graph is identical under both options** (it's now live in Cosmo). The only thing that changes is *when the legal clocks start* — so the graph once, then the two calendars.

> **Status update 2026-07-21:** WI-1559's controller identity is resolved as ZWIZZLY AS, org.nr 811696072, Fiskekroken 3B, 0139 Oslo, Norway, with Norwegian Datatilsynet as lead authority; the active-document reconciliation is complete. The graph below preserves the dependency edge until lifecycle review closes the item.

## Dependency graph (both options)

```mermaid
flowchart LR
    subgraph B1["Bucket 1 — internal rulings (days)"]
      W1559["WI-1559 entity — resolved"]
      W1111["WI-1111 Art 9 doc"]
      W1115["WI-1115 country cfg"]
      W2064["WI-2064 token posture"]
    end
    subgraph B2["Bucket 2 — GDPR/COPPA counsel (weeks)"]
      W1105["WI-1105 DPO"]
      W1106["WI-1106 DPIA"]
      W1107["WI-1107 ROPA"]
      W1108["WI-1108 breach plan"]
      W1109["WI-1109 privacy policy"]
      W1192["WI-1192 DPAs / TIAs"]
    end
    subgraph B3["Bucket 3 — other legal (external calendar)"]
      W1659["WI-1659 AI-Act memo"]
      W1764["WI-1764 crisis helplines"]
    end
    W1114["WI-1114 store declarations"]
    DEV["DEV BATCH A — Compliance-Eng chain, Stream 2,
    store infra, dogfood — NEVER WAITS"]
    subgraph GATES["The three gates (the only things that wait)"]
      W1577{{"WI-1577 FINAL GATE"}}
      W1335{{"WI-1335 store submission"}}
      W1506{{"WI-1506 closed beta"}}
    end
    W1105 --> W1106
    W1105 --> W1109
    W1111 --> W1106
    W1559 --> W1106
    W1559 --> W1109
    W1559 --> W1577
    W1106 --> W1577
    W1107 --> W1577
    W1108 --> W1577
    W1109 --> W1577
    W1109 --> W1114
    W1114 --> W1335
    W1115 --> W1335
    W1192 --> W1577
    W1659 --> W1577
    W2064 --> W1577
    W1577 --> W1335
    W1764 --> W1506
    DEV --> W1506
```

## Option 1 — adopt spine + register, clocks start this week

*Durations illustrative (DPO retainer ~2 wks, DPIA ~4 wks, DPA loops the wildcard).*

```mermaid
gantt
    title Option 1 — legal starts 16 Jul, gates land as dev finishes
    dateFormat YYYY-MM-DD
    axisFormat %d %b
    section Internal
    Reconcile WI-1559 + doc WI-1111   :i1, 2026-07-16, 3d
    WI-1115 / WI-1110 (market ruling) :i2, 2026-07-20, 3d
    WI-2064 token posture             :i3, 2026-07-20, 4d
    section Counsel
    WI-1105 DPO engagement            :c1, 2026-07-16, 12d
    WI-1106 DPIA                      :crit, c2, after c1, 26d
    WI-1107/1108/1109 short items     :c3, after c1, 14d
    WI-1192 DPA/TIA loops (wildcard)  :crit, c4, 2026-07-16, 42d
    WI-1659 AI-Act memo               :c5, 2026-07-21, 25d
    WI-1764 helplines                 :c6, 2026-07-24, 15d
    section Dev
    Batch A — full speed, no waits    :active, d1, 2026-07-16, 42d
    section Gates
    WI-1577 FINAL GATE re-run         :crit, g1, after c2, 5d
    WI-1335 store submission          :crit, g2, after g1, 4d
    WI-1506 closed beta               :g3, after g2, 12d
```

## Option 2 — spine only, register advisory (legal starts "whenever" — shown as +4 wks drift)

```mermaid
gantt
    title Option 2 — same durations, gates slip by the un-started lead time
    dateFormat YYYY-MM-DD
    axisFormat %d %b
    section Internal
    Reconcile WI-1559 + doc WI-1111   :i1, 2026-08-13, 3d
    section Counsel
    WI-1105 DPO engagement            :c1, 2026-08-13, 12d
    WI-1106 DPIA                      :crit, c2, after c1, 26d
    WI-1107/1108/1109 short items     :c3, after c1, 14d
    WI-1192 DPA/TIA loops (wildcard)  :crit, c4, 2026-08-13, 42d
    WI-1659 AI-Act memo               :c5, 2026-08-18, 25d
    WI-1764 helplines                 :c6, 2026-08-21, 15d
    section Dev
    Batch A — done, then idle         :active, d1, 2026-07-16, 42d
    DEV IDLE AT GATES                 :crit, d2, 2026-08-27, 26d
    section Gates
    WI-1577 FINAL GATE re-run         :crit, g1, after c2, 5d
    WI-1335 store submission          :crit, g2, after g1, 4d
    WI-1506 closed beta               :g3, after g2, 12d
```

**Read:** under Option 2 the red "DEV IDLE AT GATES" band is pure calendar loss — dev finishes late Aug either way; only the legal start date decides whether the gates are ready to receive it. The Datatilsynet prior-consultation tail risk (months) attaches to the DPIA bar in both charts.
