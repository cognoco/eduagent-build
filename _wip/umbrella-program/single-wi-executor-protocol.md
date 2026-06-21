# Single-WI Executor Protocol — the "Shepherd-of-One"

> **Who this is for.** You are taking **one** Work Item all the way from claimed to
> **Closed**, by yourself. You already know the atomic skills (`/capture`, `/refine`,
> `/execute`). This protocol is the next rung: instead of stopping where `/execute`
> stops, you wrap it in the full single-item lifecycle and play the **shepherd's role
> for that one item** — including the two things `/execute` never did for you:
> **merging to `main`** and **handling the review verdict**. Avoid WI 301 and 696.
>
> **Where it sits.** Atomic commands (where you were) → **shepherd-of-one (here)** →
> real multi-item shepherds (later). One layer at a time.
>
> **What it is.** A derivative of the Quartet `executor-protocol.md` (Builder) +
> `shepherd-protocol.md` (review loop + merge gate), collapsed to a single item with no
> orchestrator and no Clacks above you. Process only — the *what* of your WI lives in its
> Cosmo page. It will be reconciled into the shared `_quartet/` system at cutover.
>
> **Precedence:** Cosmo lifecycle rules (AGENTS.md + the `cosmo` skills) > this protocol > habits.

---

## The one-paragraph mental model

`/execute` builds a fix on a branch and stops the moment the code is written. But a Work Item is
not done then — it is done when a **separate, automated reviewer** (run by the program, not you)
has checked the change and the item reaches **Closed**. Your job as shepherd-of-one is everything
around the build *up to a strict-green PR*, then **merging that PR to `main` and finalizing the
item**, and then **shepherding it through review**: claim it, build it, drive it to a **green PR**,
**merge it**, run **`/cosmo:execute complete`**, then **watch for the reviewer's verdict and act on
it.** The review is asynchronous and silent — nobody pings you — so you arm a monitor and respond
when it fires.

> **You drive to a green PR, then you MERGE it and run `/cosmo:execute complete`.**
> At this rung, merging the PR to `main` and finalizing the item to **Stage=Reviewing** are yours.
> The one thing that is *not* yours is the **review verdict that Closes the item** — that gate is
> always the external automated reviewer. Your deliverable is a merged, finalized item driven
> through the review verdict to a clean close.

---

## Phases

**Phase 0 — Claim.** `/cosmo:execute` → `claim`. Never start unclaimed. (Same as plain `/execute`.)

**Phase 1 — Worktree.** Create `.worktrees/WI-NN` (branch `WI-NN` from `origin/main`) via the
**worktree-setup skill** — not `EnterWorktree`, not manual `git worktree add`. All work happens
there; `/commit` is only ever run from inside your worktree.

**Phase 2 — Plan.** Write a short implementation plan to `_plan-WI-NN.md` in your worktree
*before* touching code. Greenfield logic → tests-first (red→green). Bug/refactor/ops →
design-doc + an acceptance check per item. A bug needs a **regression test** that fails without
your fix and passes with it.

**Phase 3 — Implement.** This is the part `/execute` already does well: build the plan, `/commit`
from your worktree. Keep changes surgical — every changed line traces to the WI.

**Phase 4 — Self-review (recommended, capped).** Before opening the PR, spawn one review subagent
to adversarially critique your diff; fix valid findings. Cap at **3 rounds** — if findings persist,
stop and ask the program (us) rather than spinning.

**Phase 5 — PR & CI.** `gh pr create` (one PR for the WI). Watch `gh pr checks` and the automated
code review until they settle. Triage findings: fix every valid `blocker`/`must-fix`/`should-fix`;
fold `consider`s in only if you're already committing a fix. Batch fixes — validate locally, push
once per round.

**Phase 6 — "Green PR" (the strict definition).** A PR is **green** only when ALL hold:
1. every **required** check is `SUCCESS`;
2. **`claude-review` actually ran and is green** — a red or absent review is **not** approval
   (diagnose a red one before doing anything; never wave it through);
3. no valid `blocker`/`must-fix`/`should-fix` finding remains;
4. `mergeStateStatus` is `CLEAN` (or `UNSTABLE` only because an explicitly-allowed-red lane is red
   with **zero new test failures** vs. `main`).

Never call a PR with a red required check "green."

**Phase 7 — Merge and finalize.** Once the PR is green by Phase 6, **merge it to `main`** (squash,
via `gh pr merge`), then run **`/cosmo:execute complete`** — it authors `Fixed In` from the landed
commit, writes the completion summary, moves the item to `Stage=Reviewing`, and settles your claim.
Never hand-edit `Stage` or `Fixed In`; `complete` is the only sanctioned writer. At this rung both
acts — merging to `main` and finalizing to `Stage=Reviewing` — are yours.

**Phase 8 — Arm the review monitor and shepherd the verdict.** Arm a monitor (next two sections) so
the verdict wakes you, and react to it. Do **not** consider the WI done at finalize — moving to
`Reviewing` *earns* the review, it does not close the item.

---

## How the review works (read this carefully — it's the part `/execute` never showed you)

Once you have merged your green PR and `/cosmo:execute complete` has moved the item to
**Stage=Reviewing**, a **separate automated reviewer session** (run by the program, currently a
Codex clone — **not you, not your session**) checks it and runs `/cosmo:review` + `/cosmo:qa`. It
will **not** notify you of its verdict — you have to watch for it. Three possible outcomes:

- **→ Closed / Resolution=Done = APPROVED.** You're finished. Tear down the monitor and the worktree.
- **→ Executing (tag: rework) = BOUNCED.** The reviewer left a `[zdx:review]` / `[cosmo:qa]` note on
  the WI page saying why. **Read that note**, then loop back: re-claim (Phase 0), fix it in your
  worktree, and drive the PR back to green (Phases 3–6), then merge and finalize again (Phase 7). A
  bounce is almost always **a real code finding** — fix it like any review comment.
  - If the bounce is about **merge/finalize mechanics** (wrong `Fixed In`, summary missing a
    DoD artifact, a bad squash) — those are now *yours*: re-run `/cosmo:execute complete` or fix the
    mechanic and re-finalize.
  - *Rare:* if the bounce note doesn't actually describe your code (the review harness has known
    rough edges), **don't spin**: escalate to us with the note quoted and we'll adjudicate.
- **→ a "human" verdict.** The reviewer needs an operator decision it can't make. Escalate to us
  with the specific question.

The reviewer is the **only** gate that closes the item. Your green PR *earns* the review; it does
not close the WI.

---

## Arming the review monitor

Because the reviewer is silent and asynchronous, arm a **monitor** right after you merge and
finalize (Phase 7–8) so a verdict *wakes you* instead of you remembering to poll. Hand this to the
**Monitor tool** with `persistent: true` (set `WI` to your item number):

```bash
WI=NN; prev=""
while true; do
  stage=$(curl -s -X POST "https://api.notion.com/v1/databases/f170be9e-04ae-45d4-9618-28f2438666bd/query" \
    -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2022-06-28" -H "Content-Type: application/json" \
    -d "{\"filter\":{\"property\":\"ID\",\"unique_id\":{\"equals\":$WI}},\"page_size\":1}" \
    | python3 -c "import sys,json;r=json.load(sys.stdin)['results'];print((r[0]['properties']['Stage'].get('select') or {}).get('name','') if r else '')")
  if [ -n "$stage" ] && [ "$stage" != "$prev" ]; then echo "WI-$WI Stage -> $stage"; prev="$stage"; fi
  [ "$stage" = "Closed" ] && { echo "WI-$WI APPROVED — Closed"; break; }
  sleep 60
done
```

It emits one line on every Stage change (so you catch both **Reviewing→Closed** = approved and
**Reviewing→Executing** = bounced) and exits when the item closes.

**Monitor hygiene — the catch.** A monitor is **session-bound**: it dies when you close the session
or reboot, and its *silence then looks identical to "no verdict yet."* So:
- Arm exactly **one** per item — don't stack duplicates.
- If you restart your session, **re-arm it** (and check whether an old one is still alive first).
- Don't trust long silence — **spot-check the WI's Stage in Cosmo directly** every so often.

---

## What you own that a plain executor never does

In the full Quartet, an executor builds and hands a green PR up; a *shepherd* merges and tracks the
review; a *reviewer* closes. At this rung you take on the **whole shepherd's role** — everything but
the reviewer. Three things are yours now that plain `/execute` never asked of you:
1. **Driving to a *strict-green* PR** — not "tests pass," but the full Phase-6 gate, including
   reading the `claude-review` **verdict body** (not just the check colour) and triaging its
   findings.
2. **Merging to `main` and finalizing the item** — squash-merge the green PR, then run
   `/cosmo:execute complete` to author `Fixed In`, the completion summary, and `Stage=Reviewing`.
3. **Shepherding the WI through review** — arm the monitor, read the verdict, and re-engage on a
   bounce until it closes.

The **one** thing that is never yours is the **reviewer** — the external automated session that
runs `/cosmo:review` + `/cosmo:qa` and Closes the item. You earn that review; you do not perform it.

---

## Hard rules

- **Green PR → merge → `/cosmo:execute complete`.** Once the PR is strict-green, you squash-merge it
  to `main` and finalize the item; both are yours at this rung. The reviewer's Close is *not*.
- **The WI is not done at finalize.** Reviewing ≠ done; only the external reviewer's Close finishes it.
- **Strict green, read the verdict body.** A green check colour is not approval — read the
  `claude-review` *verdict* (must-fix/should-fix counts); a red or absent review is never approval.
  Never call a PR with a red required check "green."
- **Worktree discipline.** `/commit` only from your `.worktrees/WI-NN`; never stage another session's
  files; push with an explicit refspec (`git push origin HEAD:WI-NN`), never a bare `git push`.
- **Never self-close**, and never hand-edit `Stage` or `Fixed In` — `/cosmo:execute complete` is the
  only sanctioned writer of those fields, and only the external reviewer Closes the item.
- **No `eslint-disable` / suppression to get green** — fix the root cause.
- **When in doubt, ask us.** A confusing bounce, a red you can't diagnose, a destructive step — stop
  and escalate rather than guessing.
