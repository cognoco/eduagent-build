#!/usr/bin/env sh
# WI-2807 — placeholder identity guard.
#
# Refuses a commit whose resolved AUTHOR or COMMITTER identity is the test
# placeholder `Test User` / `test@example.com`.
#
# Why this exists: 74 commits between 2026-07-01 and 2026-07-27 landed on this
# repo authored `Test User <test@example.com>`, yet no persistent config surface
# reproduces it — the main checkout, sampled worktrees, and --global all resolve
# the correct identity, and no .git/config [user] section or config.worktree
# override exists. The bad identity therefore comes from a TRANSIENT,
# process-scoped override (an agent or runner exporting GIT_AUTHOR_* for its own
# process) that has since stopped applying. Root-causing which context did it is
# not required to close the class; this guard closes it regardless of which
# context sets it next.
#
# Why `git var` and NOT `git config user.email`: a config read cannot see an
# environment override, which is precisely the mechanism here. `git var
# GIT_AUTHOR_IDENT` resolves the identity git will ACTUALLY stamp, applying the
# full precedence chain — GIT_AUTHOR_NAME/EMAIL env, then local, then global,
# then system. Verified empirically before this guard was written: exporting
# GIT_AUTHOR_NAME='Test User' flips `git var` output while `git config
# user.name` keeps reporting the real identity. A config-based guard would have
# passed on exactly the commits this is meant to stop.
#
# Why it FAILS rather than warns: a mis-attributed commit cannot be corrected
# afterwards under this repo's rules — history rewrite on a shared branch is out
# of scope (WI-2807 AC point 2), so the only cheap moment to catch it is before
# it exists. A warning would scroll past in agent output.
#
# Escape for a deliberate placeholder commit (e.g. a fixture repo in a test):
# `git commit --no-verify`.

# Fail-OPEN if `git var` cannot resolve an identity at all, and that is safe by
# construction rather than by hope: git refuses such a commit itself. Observed
# while building this guard — with an identity variable present but empty, the
# commit aborts with `fatal: empty ident name (for <>) not allowed` (exit 128)
# before authorship exists. So an empty read here means "there will be no
# commit", not "an unchecked commit". Failing CLOSED instead would only add a
# confusing second error on top of git's own clearer one.
author=$(git var GIT_AUTHOR_IDENT 2>/dev/null || echo "")
committer=$(git var GIT_COMMITTER_IDENT 2>/dev/null || echo "")

# Match the placeholder email, or the placeholder name in the "Name <email>"
# prefix. Case-insensitive: an override may capitalise differently.
is_placeholder() {
  echo "$1" | grep -qiE '<test@example\.com>|^[[:space:]]*Test User[[:space:]]*<'
}

bad=""
if is_placeholder "$author"; then
  bad="author"
fi
if is_placeholder "$committer"; then
  if [ -n "$bad" ]; then
    bad="author and committer"
  else
    bad="committer"
  fi
fi

if [ -n "$bad" ]; then
  echo ""
  echo "pre-commit: refusing to commit with a PLACEHOLDER git identity (WI-2807)."
  echo ""
  echo "  offending : $bad"
  echo "  author    : $author"
  echo "  committer : $committer"
  echo ""
  echo "This commit would land mis-attributed, and it cannot be fixed later —"
  echo "rewriting authorship on a shared branch is out of scope for this repo."
  echo ""
  echo "Most likely cause: a GIT_AUTHOR_* / GIT_COMMITTER_* environment override"
  echo "exported by the current process. Check with:"
  echo "  env | grep -E 'GIT_(AUTHOR|COMMITTER)_(NAME|EMAIL)'"
  echo "  git var GIT_AUTHOR_IDENT"
  echo "Unset those, or set the real identity for this repo:"
  echo "  git config user.name  '<your name>'"
  echo "  git config user.email '<your email>'"
  echo ""
  echo "Deliberate placeholder commit: git commit --no-verify."
  exit 1
fi
