# WI-3020 — conflict resolution against origin/main

Merge commit: `09b90423a0d91d3820cde48e23e389b7b2d362b8` (parents `98660f81e` + `85b3dc529`)
Branch: `jojorgen/wi3020-rework-embedding-gate` — pushed, PR 2987 now `MERGEABLE` (was `DIRTY`)

Merged, not rebased. Only `docs/compliance/privacy-publication-manifest.md` conflicted;
main's interim manifest correction (merge `e0169b53e`) touched exactly two hunks and both
of them conflicted, so nothing from main was silently dropped by basing the resolution on
this branch's side and grafting forward.

## Hunk 1 — claim row 13 (§2 claim-to-evidence map)

| Interim annotation (main) | Resolution |
|---|---|
| Status cell `**PARTIAL — not established for this claim**` | **Dropped.** Restored `code-verified (enforcement); contract-dependent (safeguards)` — the enforcement now exists. |
| `**This claim is NOT currently satisfied and must not be cited as if it were.**` | **Dropped.** Untrue as of this branch. |
| `**What is NOT gated:** the embedding provider boundary…` | **Dropped**, replaced by the forward description of boundary (b). |
| `Found by independent review of WI-3020 (rejected 2026-08-04, rework in progress)` | **Kept, re-tensed.** Now: *"Boundary (b) was added by the WI-3020 rework after independent review rejected the router-only first cut (2026-08-04)"*. The provenance survives; "rework in progress" does not. |
| Dropped clause *"— which is precisely why the stop is armed"* | **Restored** from this branch's side. |

## Hunk 2 — checklist item 9 (§3 publication checklist)

| Interim annotation (main) | Resolution |
|---|---|
| `*(WI-3020 — **PARTIAL, do not treat this item as satisfied**…)*` | **Dropped.** Restored *(implemented WI-3020; the control is armed, and the underlying safeguards are still pending)*. |
| `the §7 commitment is **not yet** enforced by the runtime for all learner-data egress` | **Dropped.** The forward text states the gate's scope positively and bounds it explicitly. |
| `**Gap, ahead of the fix:** generateEmbedding … never reads the lever` | **Dropped**, replaced by the Voyage bullet describing the gate that now exists. |
| `Found by independent review of WI-3020 (rejected 2026-08-04)` | **Kept, re-tensed**, inside the Voyage bullet: *"The first cut of WI-3020 gated the router only and left this boundary open; independent review found the gap (rework rejected 2026-08-04) and this is the fix."* |
| "Deliberately not gated" subsection (Resend / Expo push / Inngest) | **Kept in full** — not present on main's side; each still names what it carries and why it is excluded. |

No other row in the file was resolved by preference; nothing else in the file conflicted.

## Narrowed quantifiers — confirmed surviving

The two phrases this branch deliberately narrowed away are **absent from the pushed tree**
(`rg` over the file returns no match for either):

- `every outbound boundary that carries learner data` — introduced `2e3ac5de7`, narrowed `12bf60ee1`
- `every learner-data egress boundary`

What stands instead, unchanged from this branch's side:

- row 13: *"runtime-enforced at both model-provider egress boundaries — and deliberately not at three others (Resend email, Expo push, Inngest)"*
- item 9: *"asserted at both outbound boundaries that carry learner data to an international **model provider**"* and *"The gate's scope is those two boundaries and no others"*

Also checked: the prose does not name `assertLearnerDataEgressAllowed`, whose name reads as
exactly the over-broad quantifier that was narrowed away. It cites the file, not the symbol.

## Coherence pass (both sections read end to end, against the code)

Cross-section consistency holds: both places name two gated boundaries and the same three
ungated ones, both carry the provenance, and row 13's pointer to *"§3 item 9 → Deliberately
not gated"* resolves (§3 begins at the *Publication checklist* heading; item 9 is in it).

Swept the whole file, not just the conflict regions, for `launch-stop|WI-3020|transfer-evidence|embedding|Voyage|not gated|ungated`.
§4 *Known repo-owned divergences* carries no embedding entry, so main's interim gap language
left no residue outside the two hunks.

Code re-verified against the resolved text:

| Claim in the doc | Verified |
|---|---|
| assert runs before the request body is serialised | `embeddings.ts:163` — first statement of `generateEmbedding`, ahead of the egress filter and the `fetch` |
| refusal raises `InternationalTransferBlockedError` | exported `transfer-evidence-gate.ts:101`; asserted in the test |
| the test proves no outbound call, not merely a throw | `expect(fetchSpy).not.toHaveBeenCalled()` — commented in-test as *"the load-bearing assertion"* |
| `prepareExchangeContext` is the session-path caller | `session-exchange.ts:2665` encloses the call at `:2747` |
| single Voyage egress site | `api.voyageai.com` appears once as a URL constant in `apps/api/src` |

**One correction made during this pass.** Item 9 said *"all four background embedding flows
inherit it"* — there are **five**. Non-test callers of `generateEmbedding`: memory-fact
backfill, transcript purge, `embed-fact`, `storeSessionEmbedding` (session-completed), and
semantic memory retrieval, plus the foreground session path. The text now enumerates them
rather than counting, so the claim cannot drift out of date by one again. This was an error
in this branch's own text, not something introduced by the merge.

## Flagged, not fixed

`scripts/check-change-class.test.ts` shows a one-line delta against main in this merge. It is
**not** authored work: this branch never touched the file, and the change is the pre-commit
hook's prettier reflow joining a trailing comment onto the `}, 20_000);` line. The comment's
own text — *"// which overruns Jest's 5s default. // Exercises the full retry budget … before
giving up,"* — is two fragments in reversed order ending in a comma, and it is **pre-existing
on main**, unchanged in substance here. Worth someone's attention; deliberately not rewritten
as part of a conflict resolution.
