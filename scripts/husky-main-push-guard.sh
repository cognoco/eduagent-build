#!/usr/bin/env sh
# WI-1246 — main push guard.
#
# Refuses a push whose target ref is `refs/heads/main`. This is the belt to the
# commit guard's suspenders: even if a commit somehow lands on shared main, the
# push that would publish it to origin/main is blocked at the shell layer.
#
# git feeds pre-push one line per pushed ref on stdin:
#     <local ref> <local sha> <remote ref> <remote sha>
# If any <remote ref> is refs/heads/main we refuse. Fires for EVERY pusher
# (raw git, human, skill).
#
# Escape for deliberate human main work: `git push --no-verify`
# (or SKIP_PRE_PUSH=1, honored by the pre-push wrapper before this runs).

blocked=0
while read -r local_ref local_sha remote_ref remote_sha; do
  # Skip blank lines defensively.
  [ -n "$remote_ref" ] || continue
  if [ "$remote_ref" = "refs/heads/main" ]; then
    blocked=1
  fi
done

if [ "$blocked" -eq 1 ]; then
  echo ""
  echo "pre-push: refusing to push to refs/heads/main (WI-1246)."
  echo ""
  echo "  Direct pushes to origin/main bypass PR review. Push your worktree"
  echo "  branch instead and open a PR:"
  echo "    git push origin HEAD:<branch-name>"
  echo ""
  echo "  Deliberate human main work: git push --no-verify"
  echo ""
  exit 1
fi

exit 0
