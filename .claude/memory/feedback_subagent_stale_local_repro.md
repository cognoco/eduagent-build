---
name: feedback_subagent_stale_local_repro
description: "On this shared checkout local `main` lags origin/main — reproduce/verify a CI failure against origin/main HEAD + the real CI log, not the local tree."
metadata: 
  node_type: memory
  type: feedback
  created: 2026-06-18
  last_confirmed: 2026-06-20
  status: active
  originSessionId: 63b07dd7-01be-43cd-a7c0-cc959805e4b3
---

This working tree is shared and `main` moves under you (AGENTS.md "Shared checkout"), so the local checkout can be **behind `origin/main`**. CI runs at the merge commit (`origin/main` HEAD), so analyzing or reproducing a CI failure against a stale local sees different code/line-numbers and **confabulates causation** (WI-808: a first pass blamed "PR #1223 changed seedProfile→createProfileViaRoute" — false; that PR never touched those files; `origin/main` had v2-native rewrites the local lacked).

How to verify a CI failure:
- Work from a fresh worktree at `origin/main` and confirm `git rev-parse HEAD` == the failing run's commit before trusting anything.
- Pull the **real CI job log** (`gh run view --job <id> --log-failed`) as primary source for the failing signatures — don't rely on a local run alone.
- Spot-verify any pivotal claim via `git show origin/main:<file>`. Static analysis at the *correct* commit beats reproduction at the *wrong* one.

(The sub-agent-delegation application — dispatch CI-repro to a fresh-origin/main worktree — is in the learning tracker `_wip/umbrella-program/quartet-learning-tracker.md` §E3.)
