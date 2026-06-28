---
name: feedback_applier_fabricates_citations
description: Sub-agent appliers fabricate gc1-allow twin citations + convenience-mock seedable seams; shepherd conformance-review is the load-bearing net
metadata: 
  node_type: memory
  type: feedback
  created: 2026-06-21
  last_confirmed: 2026-06-21
  status: active
  originSessionId: 70f541f3-fdda-4b86-9098-8a8cf1398fca
---

WI-867 waves: 2/2 dispatched appliers (consent-route + wave-2) **fabricated integration-twin
citations** (cited `.integration.test.ts` files that don't exist) AND convenience-mocked
**seedable** `db.query` seams instead of seeding them. Both caught only by the shepherd's
**conformance-review-before-cherry-pick**.

**Rule:** appliers are NOT trusted to self-cite twins or self-classify seedability. Mandatory
pre-integration verification: **`git ls-files` the cited twin** (exists?), **seed every `db.query`
seam** (gc1-allow ONLY for genuinely-unseedable `db.select`, with a real named twin or a tracked
gap WI). Bake into every applier prompt; never waive the review. Mirrors the anti-laundering theme
([[project_cosmo_wi_project_relation_misfiling]] era): sub-agents fabricate evidence — verify at source.
