# BID-49 checkpoint — PM receipt and discovered-work disposition

Timestamp: 2026-07-26T20:54Z  
Seat: `shepherd:codex:bid-49`  
Host: Orion (`zly-orion`)

Evidence:

- Nexus `origin/main` commit `689d5f56d2114f97c1230a45e212f17612223972` still declares `topology-mentomate-004` in `pm_bridge / recovering`, without lane `bid-49`; its text withholds delivery dispatch until replacement full topology.
- PM Clacks row 66612 is a receipt only: the topology fork is with the operator and the message grants no claim, dispatch, merge, or direction authority.
- A direct Notion relation query returned exactly six BID-49 members, matching the six IDs in the live Brief. Every member is Ready / Active / unclaimed.
- GitHub collision preflight at eduagent `origin/main` `cfeeaed7d91d0099fcfa71a824c4a23ca0f5c3d9` found no open PR for the three frontier WIs. Existing navigation/E2E PRs remain file-map checks before dispatch.
- WI-2827 records the Windows Clacks nested-process and secret-helper discovery. The root-cause reproduction distinguishes the quoted launcher from the failing `os.execv()` handoff.
- WI-2828 records the Windows WSL-Bash/native-Git worktree discovery and partial-retry hazard.
- Both discoveries have valid P1 Bug / Assisted / Adversarial triage-refine packets with explicit red-green regression requirements. Their only triage advisory is optional WP membership.
- Clacks row 66673 requests formal per-WI membership disposition. No Delivery Batch relation or lifecycle stage was edited.
- pm-coord row 66696 requests the ZDX owner ruling for WI-2827 relative to active WI-2721.
- Scheduled Tasks `Quartet-Clacks-bid-49`, `Quartet-Clacks-bid-49-pm`, and `Quartet-Clacks-bid-49-pm-coord` are Running.

Decision: continue fail-closed for claims, executor dispatch, merge, and lifecycle writes. Continue authoritative polling, collision checks, evidence preparation, and disposition escalation until the operator-bound topology arrives.
