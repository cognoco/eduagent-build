# Adversarial Second Review

## 1. CLOSE? Candidates: Strongest Case to Keep Open

- **WI-1525 (`stage=Captured`, `state=Active`, `prio=P2`)** should not be closed from this JSON alone. The audit says it is overtaken by WI-1631/WI-1632, but neither WI-1631 nor WI-1632 appears in the supplied 62-item JSON. The record’s `name` is specifically `/cosmo:next + headless queue-health report`; its `desc` frames it as the Cosmo implementation layer of the operator-ruled flow-stewardship practice. Without comparing shipped fields/behavior from 1631/1632, “duplicate” is unproven. Also, WI-1526 is still selected first-wave as the standard/practice layer, which weakens the case that the implementation-layer item is obsolete.

- **WI-1295 (`stage=Reviewing`, `state=Awaiting Info`, `prio=P3`)** has the weakest keep-open case, but it still has one: it is a distinct garbage-prefixed CLI-output parse failure, not the same root as Windows `which` or API-key precedence. Its `ac` is empty, so it may need repair/downgrade, but closing it because Codex is now default assumes the Claude CLI path is removed or unsupported. The JSON does not establish that.

- **WI-1284 (`stage=Reviewing`, `state=Awaiting Info`, `prio=P2`, `path=Assisted`)** should stay open unless the Claude-judge path is formally removed. Its AC explicitly covers a host with `ANTHROPIC_API_KEY` set alongside Claude login. Codex-default does not automatically eliminate credential-precedence bugs in fallback or dedup paths.

- **WI-1282 (`stage=Reviewing`, `state=Awaiting Info`, `prio=P2`, `path=Manual`)** remains a valid cross-platform portability bug if any Windows host can invoke triage without `--judge-provider`. Closing requires proof that Unix `which` detection is gone or unreachable. WI-1626 is not in the JSON, so the “codex-default moots it” claim is external.

## 2. First-Wave Challenge

Mis-prioritized:

- **WI-1635** is listed first-wave, but JSON still says `stage=Captured`, `state=Blocked`, `desc_len=0`, and the title itself says “BLOCKED on operator OPQ-18 ruling, do not dispatch.” The audit may know OPQ-18 was ruled, but the supplied data contradicts dispatch readiness.

- **WI-1526** is `Captured/Active/P2` with `ac_len=0`. The audit says refine→ready→dispatch, but that is not the same as a first-wave Ready item. It should be first-wave refine, not first-wave execution.

- **WI-1264** may deserve the P1 bump, but it is still `Backlog/P3`. Promoting it straight into execution skips the lifecycle hygiene the audit otherwise insists on.

- **WI-1369** is useful, but `Backlog/P3` and template hygiene. It should not outrank operational blockers like hold semantics and recovery validation unless the hand-back is explicitly optimizing for review-paperwork bounces over runtime safety.

Wrongly left out or underweighted:

- **WI-1296 (`Ready/Active/P2`)** should move before the re-finalize wave, not after it. It fixes completion-summary append behavior. Running bulk re-finalization before fixing stale bounced-attempt summaries risks reproducing the exact re-bounce loop.

- **WI-1614 (`Captured`, `state=-`, `prio=P1`)** is a P1 recovery-validation item with both description and AC present. The missing state needs repair, but its priority is higher than several first-wave picks.

- **WI-1609 (`Captured`, `state=-`, `prio=P2`)** is about machine-readable intentional holds. The audit itself cites hold confusion today; delaying this until after finalization/liveness activity is risky.

- **WI-1236 (`Ready/Active`, `prio=-`)** says “arm lane monitors ASAP.” The missing priority should be repaired, then this likely belongs earlier than flow-stewardship prose work.

- **WI-1544 (`Captured/Active/P2`)** is the Codex end-to-end lifecycle smoke. If Codex delivery is part of the near-term hand-back, this is a gate, not a conditional afterthought.

- **WI-1267 (`Backlog/Active/P2`)** covers shared `.git/config` corruption. That is a real data-integrity class and arguably outranks WI-1369.

## 3. Findings F-A Through F-H: Factual Holes

- **F-A, WI-1525 overtaken:** Not proven by JSON. WI-1525 is active; WI-1631/WI-1632 are absent. Closure requires external comparison evidence.

- **F-B, WI-1282/1284/1295 mooted:** Plausible but unproven. WI-1626 is absent. The three records are still `Reviewing/Awaiting Info`, and WI-1284/WI-1282 have concrete AC. Treat as downgrade/verify, not close-by-default.

- **F-C, WI-1600 no stage/state:** Correct. JSON has `stage="-"`, `state="-"`, `desc_len=0`, `ac_len=0`. But “raw page-create bypassed capture.ts” is inference, not directly proven by JSON.

- **F-D, WP ownership blur:** Correct. WP names show cross-workstream bundles: WI-1515 includes WI-1294 from WS24; WI-1518 includes WI-1312 from WS23. Also WI-1356 is `Executing/Active` with `claimed=claude:bld-1356:WI-1356`. Missing hole: WI-1293 is referenced by WI-1515 but absent from the JSON, so the bundle cannot be fully audited.

- **F-E, empty retro stubs:** Understates the problem. WI-1604/1607/1608 are empty and `state="-"`, but so are other important records: WI-1600 is fully empty; WI-1370 is `Captured/Active/P2` with `desc_len=0`, `ac_len=0`; WI-1594/1609/1614 also have `state="-"`.

- **F-F, WI-1543 live claim:** Partly supported. JSON has `claimed=codex:ws43-shepherd:WI-1543` and `edited=2026-07-05T18:43`. But the dump has no claim-expiry field, so “live” cannot be verified from the supplied JSON.

- **F-G, priority gaps:** Correct. JSON shows only WI-1236 and WI-1229 with `prio="-"`.

- **F-H, tooling repo no CI:** Supported only as the claim embedded in WI-1264’s record: `Backlog/Active/P3`, description says cognoco/zdx-marketplace has no branch protection/CI. The JSON does not independently verify GitHub repo settings.

## 4. Hand-Back Ordering Risks

1. **Re-finalize before WI-1296 is backwards.** Fix completion-summary replacement first, then re-finalize 1634/1630/1629/1605/1356/1297.

2. **Re-finalizing zombie Executing items before resolving WI-1312 evidence is risky.** WI-1634/1630/1629/1605 are `Executing/Active` with `claimed="-"`; they are examples of the zombie class, not just cleanup work.

3. **Step 2 is not “minutes each.”** WI-1282/1284/1295 require product/code-path judgment, possibly Windows/env reproduction, and external WI-1626 verification.

4. **First-wave mixes Ready execution with unrefined Captured/Backlog items.** WI-1635, WI-1526, WI-1264, and WI-1369 need lifecycle transitions or metadata repair before dispatch.

5. **Hold semantics are delayed too long.** WI-1609 should be repaired/refined before broad finalize/liveness activity if held work can be misread by automation.

## 5. Missed JSON Issues

- `state="-"` appears on seven items: WI-1594, WI-1600, WI-1614, WI-1609, WI-1608, WI-1607, WI-1604. The audit only treats WI-1600 and the empty stubs as repair-class.

- WI-1370 is `Captured/Active/P2` but has empty description and AC. The audit marks it KEEP without noting it is a contentless captured item.

- Several Executing stranded items have no claim: WI-1634, WI-1630, WI-1629, WI-1605. That should be tied explicitly to WI-1312, not only treated as re-finalization cleanup.

- The JSON schema lacks claim expiry/started fields, so any live/dead claim conclusions are external inferences.

## Verdict: CONCUR-WITH-AMENDMENTS

1. Do not close WI-1525, WI-1282, WI-1284, or WI-1295 from this slice alone; require explicit external comparison/removal evidence.

2. Move WI-1296 ahead of the re-finalize wave.

3. Downgrade WI-1635 and WI-1526 from first-wave execution to repair/refine-until-ready unless Cosmo fields are updated first.

4. Add repair tasks for WI-1594, WI-1609, WI-1614, and WI-1370 metadata/content gaps.

5. Promote WI-1609 and WI-1236 into the near-term hand-back set after metadata repair.

6. Treat WI-1614 as a scheduled P1 validation drill, not ordinary refine backlog.

7. Flag all unclaimed `Executing` items as evidence for WI-1312 before clearing them.