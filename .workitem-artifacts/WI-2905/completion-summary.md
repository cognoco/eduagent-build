# What was done

Disarmed a documented path to an irreversible deletion of live navigation code.

The V2 cutover plan's T10 carried a conditional whole-file deletion of the mobile navigation contract, phrased as "or delete it if the V2 chip fully owns shape". That condition restated the title of a **Proposed** ADR as though it were an established fact. The ADR in question is under explicit non-reliance and its own point 5 says the opposite — the contract stays alive until a separate retirement ruling — but a reader reaching T10 by way of the ADR's title would have read the condition as satisfied.

The premise is false in code, so the deletion would have fired on a document that contradicts the implementation. Both documents are now corrected, and the deletion condition is code-verified rather than document-derived.

# What changed

- The ADR carries a title-correction block stating accurately that the scope chip owns scope SELECTION while the navigation contract still owns navigation SHAPE and the gate surface, with four code citations embedded. Recorded as a factual amendment to the framing, not a status change: the ADR stays Proposed under explicit non-reliance, since re-statusing it is an Architecture-signed act and is not this item's to perform.
- T10's deletion condition is replaced by four named checks that must all be demonstrated at execution time with command output pasted into the change-set: no V2 invocation of the resolver, no live import, no live contract-type or gates consumer, and the legacy flags actually retired. Failing any check means reduce the file, stated as the default branch rather than a fallback.
- The deletion-target table carried the same false premise in a parenthetical; it now states the selection-versus-shape distinction and points at the four checks.
- The scope limit is preserved and untouched in both documents: the authorization wall remains the accepted supporter-visibility ADR's, and the plan's pre-execution checklist still blocks any deletion change-set that cites the Proposed ADR as governing authority.

# Verification

The four code claims in the WI were re-verified against the current branch tip before any document was edited, rather than trusted from the capture text. All four hold, and one is stronger than captured: two of the contract-consuming hooks have no V2 branch whatsoever, so they return the resolved contract on every flag state.

The four new T10 checks were then run against the current tree to confirm they are load-bearing rather than decorative. All four fail today, which is the correct result — the guard blocks the deletion. The third check is the decisive one and is the check the previous wording had no equivalent of: the contract type and its gate surface are referenced in hundreds of places across mobile source, because the gate surface outlives the tab-shape matrix and is read by screens rather than by the chip. Whole-file deletion on the old condition would have broken every one of those references.

Validation actually run, rather than asserted:

- The lifecycle preflight (`execute complete --validate`) passes every check: all four summary sections, all three prose trip-wires, evidence manifest present, every acceptance criterion covered by a machine-verifiable claim, and every claim pointer resolved against the tree. Read-only, no remote writes.
- Both edited documents were staged as git objects against the origin base and the resulting diff was inspected before the branch was pushed, confirming a surgical change (a handful of added lines per file) rather than a whitespace-mangled whole-file rewrite — a real risk when authoring files off-tree on Windows.
- The evidence manifest is valid JSON by construction: the preflight parses it, and a malformed manifest fails that gate before any transition.
- Every file path and test file named in the new plan text was confirmed to exist via `git ls-files` rather than cited from memory, including the usage-guard test the plan now protects.

No code, config, CI, schema or test files were touched, so the repo's test, typecheck and lint targets have no subject in this change; the change-class router routes it as documentation. The four grep checks written into the plan are reproduced with their revision and hit counts in the evidence manifest.

# Caveats / Follow-ups

The ADR keeps its filename, which still contains the word "supersedes". Renaming the file would break inbound references across plans, specs and prior change-sets for no correctness gain; the title correction sits at the top of the document where a skimming reader meets it before the claim. Re-statusing the ADR was deliberately not done here — that is an Architecture-signed act with a lockstep canon change-set, and this item's mandate was to make the documents stop contradicting the code, not to accept or supersede a decision. The related disposition audit that surfaced this drift remains blocked by a separate guard and is cited rather than absorbed, so this guard lands regardless of whether that item ever unblocks. If the V2 shell later does take over shape genuinely, the four checks are the evidence to produce; they are written so that passing them is a demonstration rather than an assertion.
