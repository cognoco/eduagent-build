# What was done

Reconciliation of already-landed work: PR 2803 repaired a repo-wide integration time bomb — a literal UTC grace deadline in the billing past-due alert test that expired and reddened the required `main` job on every API pull request until it was fixed. The repair landed before this item was captured, so the work here is provenance plus independent verification, not a fix.

Binding ruling msg_8dbac7af5ee4 excludes this work from BID-19, which is why the repair landed and is reconciled outside that batch and why this exists as a separate provenance record rather than as a BID-19 member.

Nothing in the repaired file was changed by this item. Its output is verification, a sibling sweep, and the Cosmo record.

# What changed

- No production or test code changed. The only repository change is this item's own lifecycle artifacts.
- Cosmo now carries the repair's provenance: the landed repair commit is recorded as this item's Fixed In, passed explicitly rather than auto-derived, because the commit that needs provenancing is the earlier repair and not this item's artifacts commit.
- One incidental work item was created through the sanctioned path for the eight sibling literals that could not be cleared. It carries the reproduce command, the per-literal file and line list, the cleared-versus-uncleared split with reasons, and the repair pattern to copy.

# Verification

The repair was verified against the current branch tip rather than accepted from the pull request description. The repaired file derives its deadline from the run clock and all three former literals now reference that derived value; no expired literal survives outside an explanatory comment.

How recurrence is avoided, since the acceptance criteria ask for the mechanism and not just the outcome: the value is run-clock-relative, recomputed on every execution as a fixed offset ahead of the current moment. It is neither a frozen clock nor a later fixed date, so the scenario means the same thing on every future run date and the deadline can never fall into the past. A replacement literal further in the future would merely have moved the detonation; this shape removes it.

Gate evidence after the former deadline: the Flag-ON integration check concluded success on three separate base-branch commits on the day this reconciliation was performed, and the required job that the bomb reddened on every API pull request also concluded success on the same day — a week past the detonation date. Those runs are independent of this item; they are ordinary pipeline runs on unrelated merges, which is stronger evidence than a run commissioned to prove the point.

The sibling sweep was triaged rather than reported raw. A future-dated literal is only dangerous when the consuming code compares it against the real clock; where a test injects an explicit clock, the relationship between the two is fixed permanently and the literal is inert. Three candidates were cleared by reading their call sites, including the nearest-dated one and the one whose variable name most strongly suggested a hazard. Eight remain uncleared, not because they are known to be dangerous but because clearing them requires tracing production code paths beyond this item's scope; that tracing is the captured follow-up, and the earliest date at which any of them could matter is recorded there.

# Caveats / Follow-ups

The eight uncleared literals are genuinely unknown, not quietly assumed safe. Several sit in the same billing area as the literal that actually detonated, which is the reason the follow-up is worth having rather than a formality. The follow-up requires each one to end in an explicit state with its call site cited — inert because the clock is injected, or a bomb with its detonation date recorded and the repair applied — so that no future-dated deadline literal in an integration fixture remains in an unknown state. This item deliberately did not attempt that tracing: the acceptance criteria scope it to searching and listing, and expanding into eight production code paths would have turned a small reconciliation into an unbounded audit. The value claimed here is that the search was performed, the method is reproducible, and the residue is tracked rather than forgotten.
