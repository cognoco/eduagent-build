# Re-dispatch Queue — orphaned Work Item detection (WI-1216)

**What this is.** The mechanism that keeps a Work Item **owned, or explicitly re-claimable**,
across the execute→review→reject transition. When an executor claims a WI, completes it to
`Stage=Reviewing`, and the reviewer bounces it back to `Stage=Executing`, the item lands with no
agent responsible for it — the claim was already released by `complete()` on the Executing→
Reviewing leg, and a reviewer's `rework` disposition does not re-establish one. Left alone, a
rejected item just sits, invisible, until someone happens to notice. This doc defines the
detector, the Cosmo view surfacing it, and the reconcile process that acts on it across three
trigger tiers. Relates: WI-1226 (standing-lane lifecycle — this queue is exactly that shape: it
never "closes," it has a checkpoint cadence instead), WI-1238 (closed — the `Claim Expired`
formula this detector uses), `library/liveness-checker.md` (WI-1313 — the L2 claim-TTL checker;
same predicate family, different altitude: L2 diagnoses one executor's liveness mid-audit, this
doc defines the standing queue every agent can pick from), WI-1156 (workstream lease — orthogonal,
governs shepherd exclusivity, not item-level claims).

## The detector

**Authoritative predicate:** `Stage = Executing AND no live claim`. This is the only signal that
also catches a silently-crashed executor (no event fires on crash — Stage alone is what's left to
check).

**"No live claim" is a compound, not a single field.** The schema's `Claim Expired` formula
(`WI-1238`, closed) is `if(empty(Claimed At), false, dateAdd(dateAdd(Claimed At, 3h), 1min) < now())`
— it reads **false**, not true, when `Claimed At` is empty. That is correct for its own purpose
(the L2 claim-TTL checker in `library/liveness-checker.md` needs to distinguish a genuinely
never-set claim from an expired one), but it means a literal `Claim Expired = true` filter alone
**misses** the reviewer-reject case: `complete()` clears `Claimed By`/`Claimed At` on the
Executing→Reviewing leg, and `review.ts`'s `rework` branch (`stage: "Executing", tags: [...,
"rework"]`) does not re-set them — so a rejected item sits at `Stage=Executing` with `Claimed By`
empty and `Claim Expired=false`.

Verified live against the real work-items DS (2026-07-03, 14 rows at `Stage=Executing`):

| WI | Claimed By | Claim Expired | Case |
|---|---|---|---|
| WI-1340, WI-1336, WI-1306, WI-528 | set | **true** | stale claim (executor died / never renewed) |
| WI-1316, WI-752 | **empty** | false | reviewer-rejected, unclaimed — the WI's own motivating scenario |
| WI-1216, WI-1415, WI-1380, … | set | false | live claim — must NOT appear |

The **logical predicate** is therefore:

```
Stage = "Executing" AND ( "Claimed By" is_empty OR "Claim Expired" = true )
```

This is a **strict superset** of the literal "Claim Expired=true" reading in the AC's deliverable
bullet — every item that filter would surface still appears (second OR-arm), plus the empty-claim
rework-bounce items the AC's own predicate bullet names. It uses only existing properties
(`Claimed By`, `Claim Expired`) — no schema change, matching "no further schema prerequisite for
this WI." The `Claim Expired` formula itself is untouched (out of scope, and load-bearing for
L2's separate defect-flag distinction).

**Platform limitation — this predicate cannot be a Notion query `filter`, only client-side
logic.** Verified live (2026-07-03): Notion's REST `/data_sources/{id}/query` endpoint rejects
filtering on the `Claim Expired` formula outright — `"Unable to filter based on a formula of
unknown type"` — reproduced against both the `2025-09-03` and legacy `2022-06-28` API versions
and every filter-type key tried (`checkbox`/`boolean`/`string`). This is not specific to the
compound OR-shape: even the AC's own literal single-clause reading (`Claim Expired = true` alone,
no OR) fails identically. Reading the formula's already-computed *value* from a query response
row is unaffected — only using it as a filter *criterion* is rejected. So `needsReclaim()`
(`_quartet/clacks/lease.ts`) is implemented as a plain function applied to each row **after**
fetching `Stage=Executing` (a plain, reliably-filterable select) — never as a query filter object.
Both `reconcileWorkstream` (tier a's underlying reconcile call) and the tier-(b) sweep call this
same function, so the predicate stays single-sourced even though it can't be pushed down into
Notion's own filter.

**`rework` tag is enrichment, not a filter arm.** It distinguishes *why* an item is orphaned
(bounced-from-review vs. crashed-mid-work) once it's already in the queue — it is not part of the
predicate. Counter-example proving this: WI-1257 sits at `Stage=Executing`, `Claimed By` empty,
**no** `rework` tag, and is still a legitimate orphan. Show the tag as a column; never filter on
it.

## Cosmo view

**Status: created.** https://www.notion.so/f170be9e04ae45d4961828f2438666bd?v=3938bce91f7c8117971b000cd2fd7fbc
(view id `3938bce9-1f7c-8117-971b-000cd2fd7fbc`), built by the orchestrator per the spec below.
Re-queried the identical filter via REST post-creation: `Stage = "Executing" AND "Claimed By"
is_empty` correctly surfaced 7 live rows including a real discriminating example (a
rejected-and-unclaimed rework-tagged WI) and excluded every live-claimed `Executing` item —
matching the "Verification once created" checklist below.

**Exact spec:**
- **Name:** `Re-dispatch Queue`
- **Type:** table
- **Target:** work-items data source `36fd1119-9955-4684-8bfe-deb145e6a21f` (database
  `f170be9e04ae45d4961828f2438666bd`)
- **Filter:** `Stage = "Executing" AND "Claimed By" is_empty` — the mechanically real subset of
  the logical predicate (§ The detector). The `Claim Expired` formula arm can**not** be expressed
  as a Notion filter at all (verified live — see below), so it is intentionally **left out of the
  view's own filter**; the view still surfaces the discriminating reviewer-reject case (WI-1316/
  752/1257-shaped rows) with full precision, at the cost of not mechanically excluding a
  still-live-but-old claim. Do not attempt to add a `Claim Expired = true` OR-arm — it will be
  rejected by Notion with `"Unable to filter based on a formula of unknown type"` if attempted via
  the same code path the REST query hit; if `notion-create-view`'s underlying API differs and
  successfully accepts it, prefer the full compound filter (`Claimed By is_empty OR Claim
  Expired = true`) — test on creation before trusting either form.
- **Sort:** `Claimed At` ascending (oldest/empty claims surface first; a human scanning the view
  picks up the stale-but-claimed cases the filter can't mechanically reach).
- **Columns shown:** `Claimed By`, `Claimed At`, `Claim Expired`, `Tags`, `Workstream`, `Name`.
- **Verification once created:** re-query the DS with the identical filter (or
  `notion-query-database-view`) and confirm: an item at `Stage=Executing` with `Claimed By` empty
  (e.g. a WI-1316/752/1257-shaped row, if still live at creation time) appears; a live-claimed
  Executing item (e.g. this WI's own claim while in flight) does NOT.

Pickable by any agent — standing-lane style (WI-1226): it has no close ceremony, only a
checkpoint cadence (see tier (b) below).

## Reconcile — one predicate, three trigger tiers

The same predicate runs regardless of what fires it — only the trigger differs (AC D2):

**(a) Managed lane — already exists, not rebuilt here.** A shepherd's standing Cosmo-Stage
monitor (`clacks/monitor-hygiene.md`), e.g. `_WIP/bellwether/_quartet/lanes/thesis/_state/
cosmo-stage-watch.mjs` — a per-lane, session-scoped differ that polls the DS filtered by
Workstream and prints a line on any Stage/Claimed-By change. It already catches a reviewer bounce
as an ordinary Stage-change event; the shepherd picks it up the normal way (`/cosmo:execute
claim`) same as any Ready item. Nothing to add — this doc documents the tier, not a new build.

**(b) Ad-hoc automated — the new minimal piece.** `_quartet/scripts/orphan-reconcile-sweep.ts` —
a standing, low-frequency sweep **independent of any execution session**: it fetches
`Stage=Executing` (the only part Notion will let it filter server-side) and applies the shared
`needsReclaim` predicate (`_quartet/clacks/lease.ts`) to each row client-side, printing one report
line per orphan (WI id, name, claim state, rework tag). No auto-re-dispatch, no Cosmo writes —
pure detection, so it is safe to
run from any external low-frequency trigger (a host cron entry, Windows Task Scheduler, or a
manual `bun run` at session start) without depending on a live shepherd/orchestrator session. Kept
intentionally thin per AGENTS.md simplicity: one query, one filter, one report — `cosmo:execute`
itself stays fire-and-forget and gains no monitor burden.

**(c) Ad-hoc zero-infra — operator manually re-invokes.** No tooling: an operator (or any agent)
opens the "Re-dispatch Queue" view directly in Notion and picks an item by eye. This tier exists
precisely because (a) and (b) can both be down/unavailable and the queue must still be
recoverable by a human with nothing but Notion access.

## Actor sequence on bounce (D4)

```
reviewer disposition = rework
  -> releases claim (Claimed By/Claimed At already cleared by the prior complete() call;
     review.ts's rework branch does not re-set them) + Stage=Executing + tags += "rework" + note
  -> item satisfies the re-dispatch predicate -> appears in the queue (view/sweep, tier a/b/c)
  -> picked up by a FRESH executor (never the dead/original one)
  -> new executor claims fresh via the normal `/cosmo:execute claim` mechanic
```

**Note on "appears in the queue" for this specific sequence.** Every D4 rework-bounce item has `Claimed By` empty (rework never re-sets it), so it always falls inside the Cosmo view's own real filter (`Claimed By is_empty` — § Cosmo view) — no gap for this actor sequence specifically. The view's narrower scope (vs. the full logical predicate) only matters for the *other* orphan case — a crashed executor whose claim is still set but stale — which the view alone does not surface; that case relies on the sweep (tier b) or tier (a)'s monitor, both of which apply the full `needsReclaim` predicate.

**Re-claim is the sole precondition to resume, and it is owner-agnostic.** Resumption requires a
live claim by whoever resumes — not lane ownership. A terminated session cannot self-resume; the
durable queue is what lets a fresh agent (or the original shepherd, on a later pass) pick the item
up later. This is additive, not a gate: nothing here changes the normal claim mechanic
(`/cosmo:execute claim`) — the queue just makes the item *visible* to it.
