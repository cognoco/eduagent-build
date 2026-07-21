# Web product checkpoint: parent control center first

**Status:** Operator-ratified checkpoint  
**Owner:** Product + platform  
**Review trigger:** The evidence predicate `T` below

## Current boundary

MentoMate learning remains mobile-first. This checkpoint authorizes no web
learning surface, web session UI, or web payment rail.

If a later review authorizes a web product, its first product shape is a parent
control center. Kid learning and sessions remain mobile. The parent control
center may be reviewed as a way to manage family settings, child access,
progress, reports, consent, or account administration; this document does not
authorize any of those capabilities to be built.

## Qualifying evidence predicate `T`

`T` is true only when at least one trigger below meets its decision metric with
current, attributable evidence. The evidence must name the blocked user or
commercial job and explain why a parent-facing web product is a credible
response.

| Trigger | Named evidence source | Decision metric |
|---|---|---|
| User or support research | An approved research synthesis, or support tickets tagged `web-parent-control` with unique household IDs | The same unmet parent administration job is evidenced by at least five independent households in a rolling 90-day window, with no adequate mobile workaround. |
| Qualified customer or partner requirement | A signed requirement, pilot brief, or opportunity record with a named customer/partner, accountable commercial owner, and target deployment | The requirement blocks a qualified deployment or go/no-go decision, and the owner confirms that a parent-facing browser surface is required rather than merely preferred. |
| External store, regulatory, or commercial constraint | A dated store-policy ruling, counsel/compliance memorandum, or approved commercial-channel decision | The source identifies a binding constraint or material exposure that cannot be satisfied through the current mobile channel, and names the decision deadline. |
| Product data plus a credible web hypothesis | An approved analysis or experiment brief containing the mobile baseline, affected parent cohort, and proposed parent-web mechanism | A named completion, abandonment, or support-contact rate misses its predeclared target, and the brief states a measurable web outcome and why browser affordances should improve it. |

An anecdote, competitor imitation, implementation convenience, reusable web
scaffolding, or an engineer's preference does not make `T` true. Multiple weak
signals cannot be added together to evade a row's evidence standard.

## What happens when `T` is true

`T` opens a new product and architecture review. It never authorizes
implementation automatically. The review must record:

1. the bounded web scope and explicitly excluded surfaces;
2. a baseline, target cohort, and measurable success metric;
3. the payment choice, including whether the dormant Stripe web rail is needed;
4. the browser authentication, role, token-storage, and session-security choices;
5. whether the parent-control-center boundary still holds and why;
6. the authorized decision, accountable owner, and linked Work Items.

Until that review lands, no web implementation work starts.

## One-way doors guarded by this checkpoint

- **Web learning:** a browser learning product creates a second learning channel
  and changes the mobile-first product commitment.
- **Web payment rail:** activating browser payments creates commercial,
  entitlement, compliance, and support obligations outside mobile IAP.
- **Web session UI:** a type-first or browser-voice session creates a second
  interaction model with separate accessibility, safety, and maintenance costs.

Each door requires the review above even if another door has already been
opened.

## Linked governance records

- [One-way-door risk register, risk 11](../audit/2026-07-12-one-way-door-risk-register.md)
- [One-way-door action ledger, web parent-control-center row](../plans/2026-07-12-one-way-door-risk-drain.md)
- [Existing web-port architecture analysis](../architecture.md#post-mvp-platform-decision-web-port-analysis)

The risk register and action ledger link back to this checkpoint so future
planning encounters the evidence gate from either direction.
