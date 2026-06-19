# Single-WI Executor Protocol — the "Shepherd-of-One"

> **Who this is for.** You are taking **one** Work Item all the way from claimed to
> **Closed**, by yourself. You already know the atomic skills (`/capture`, `/refine`,
> `/execute`). This protocol is the next rung: instead of stopping where `/execute`
> stops, you wrap it in the full single-item lifecycle and play the **shepherd's role
> for that one item** — including the two things `/execute` never did for you:
> **merging to `main`** and **handling the review verdict**.
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
around the build *up to a strict-green PR*, and then **shepherding that PR through review**: claim
it, build it, drive it to a **green PR**, **hand it off** (you do **not** merge — see below), then
**watch for the reviewer's verdict and act on it.** The review is asynchronous and silent — nobody
pings you — so you arm a monitor and respond when it fires.

> **You stop at a green PR. You do NOT merge, and you do NOT run `/cosmo:execute complete`.**
> At this rung, merging the PR to `main` and finalizing the item are done by the program (us), not
> by you. Merging becomes yours at the *next* rung. Your deliverable is a green PR plus driving the
> review verdict to a clean close.

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

**Phase 7 — Stop at the green PR; hand off.** Once the PR is green by Phase 6, **STOP.**
**Do NOT merge the PR, and do NOT run `/cosmo:execute complete`.** At this rung those two acts —
merging to `main` and finalizing the item to `Stage=Reviewing` — are done by the program (us), not
by you. Report the green PR up: its number, the head commit, and a one-line "ready" note. Then move
to Phase 8. (Why the hard stop: merging and finalizing are the privileges of the *next* rung; for
now you hand a clean, green PR to the program and we take it from there.)

**Phase 8 — Arm the review monitor and shepherd the verdict.** After you hand off, the program
merges your PR and moves the item to `Stage=Reviewing`; the separate automated reviewer then checks
it. Arm a monitor (next two sections) so the verdict wakes you, and react to it. Do **not** consider
the WI done at hand-off — a green PR earns the review, it does not close the item.

---

## How the review works (read this carefully — it's the part `/execute` never showed you)

Once the program has merged your green PR and moved the item to **Stage=Reviewing**, a **separate
automated reviewer session** (run by the program, currently a Codex clone — **not you, not your
session**) checks it and runs `/cosmo:review` + `/cosmo:qa`. It will **not** notify you of its
verdict — you have to watch for it. Three possible outcomes:

- **→ Closed / Resolution=Done = APPROVED.** You're finished. Tear down the monitor and the worktree.
- **→ Executing (tag: rework) = BOUNCED.** The reviewer left a `[zdx:review]` / `[cosmo:qa]` note on
  the WI page saying why. **Read that note**, then loop back: re-claim (Phase 0), fix it in your
  worktree, and drive the PR back to green (Phases 3–6) and hand off again (Phase 7). A bounce is
  almost always **a real code finding** — fix it like any review comment.
  - *Rare:* if the bounce note doesn't actually describe your code (the review harness has known
    rough edges), or it's about merge/finalize mechanics — which are *our* responsibility at this
    rung, not yours — **don't spin**: escalate to us with the note quoted and we'll adjudicate.
- **→ a "human" verdict.** The reviewer needs an operator decision it can't make. Escalate to us
  with the specific question.

The reviewer is the **only** gate that closes the item. Your green PR *earns* the review; it does
not close the WI.

---

## Arming the review monitor

Because the reviewer is silent and asynchronous, arm a **monitor** right after you hand off the
green PR (Phase 7–8) so a verdict *wakes you* instead of you remembering to poll. Hand this to the
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
review; a *reviewer* closes. At this rung you grow into the shepherd's role one piece at a time. Two
things are yours now that plain `/execute` never asked of you:
1. **Driving to a *strict-green* PR** — not "tests pass," but the full Phase-6 gate, including
   reading the `claude-review` **verdict body** (not just the check colour) and triaging its
   findings.
2. **Shepherding the WI through review** — arm the monitor, read the verdict, and re-engage on a
   bounce until it closes.

Two things are deliberately **not yours yet** — they belong to the program at this rung and become
yours at the next one: **merging the PR to `main`** and **finalizing the item** (`/cosmo:execute
complete`). And the reviewer is always external — that one is never yours.

---

## Hard rules

- **You stop at a green PR. You do NOT merge and do NOT run `/cosmo:execute complete`** — both are
  the program's at this rung. Hand the green PR up and let us take it from there.
- **The WI is not done at hand-off.** Reviewing ≠ done; only the reviewer's Close finishes it.
- **Strict green, read the verdict body.** A green check colour is not approval — read the
  `claude-review` *verdict* (must-fix/should-fix counts); a red or absent review is never approval.
  Never call a PR with a red required check "green."
- **Worktree discipline.** `/commit` only from your `.worktrees/WI-NN`; never stage another session's
  files; push with an explicit refspec (`git push origin HEAD:WI-NN`), never a bare `git push`.
- **Never self-close**, and never hand-edit `Stage` or `Fixed In` — closing and lifecycle fields are
  not yours.
- **No `eslint-disable` / suppression to get green** — fix the root cause.
- **When in doubt, ask us.** A confusing bounce, a red you can't diagnose, a destructive step — stop
  and escalate rather than guessing.
