# What was done

Closed the placeholder-identity class with a forward-only pre-commit guard, without touching the mis-attributed history it protects against.

Dozens of commits landed on this repo authored as the test placeholder, yet no persistent configuration surface reproduces it — the checkout, the sampled worktrees and the global config all resolve the correct identity, and no repo-level user section or worktree override file exists. The bad identity therefore comes from a transient, process-scoped override that has since stopped applying. Root-causing which context did it is not a precondition for closing the class, and it was not found; the guard works regardless of which context sets it next.

# What changed

- A new guard script refuses any commit whose resolved author or committer identity is the placeholder, wired into the pre-commit hook as a subprocess immediately after the existing shared-main guard, matching that guard's established pattern.
- The guard reads the identity git will actually stamp, rather than reading configuration. This is the load-bearing design choice: the override is environment-borne, and a configuration read cannot see an environment override. Verified before the guard was written that exporting an author-name variable flips what the identity call returns while the configuration read keeps reporting the real identity — so a configuration-based guard would have passed on exactly the commits this exists to stop.
- It fails rather than warns. A mis-attributed commit cannot be corrected afterwards under this item's own scope limit, so the only cheap moment to catch it is before the commit exists; a warning would scroll past in agent output.
- Both halves of the identity are checked independently, because the committer trailer is the half a reviewer is least likely to notice.
- A regression suite exercises the real shipped script by absolute path from a temporary repository, covering the placeholder author, the placeholder committer alone, a case-variant address, a placeholder name with a legitimate address, and two negative cases that must not fire.

No history was rewritten and none is implied. The guard is forward-only, and both its comment block and its refusal message state that rewriting authorship on a shared branch is out of scope, so a reader who hits it is not nudged toward the forbidden remedy.

# Verification

The guard was proven three ways, in increasing order of authority.

First, as a script in isolation. That harness was initially misleading and its failure taught something worth recording: clearing an environment variable to an empty string leaves it present-but-empty, which is not the same as absent — the identity call then fails, and the guard's own fallback turned that failure into a silent pass. The apparent gap was in the harness, not the guard.

Second, through real commits in a real repository. A commit with the placeholder set on both halves was refused, naming both halves. A commit with only a case-variant address was refused. A commit with the genuine identity succeeded and was correctly attributed.

Third, as an automated suite using the repository's own convention for this kind of guard, which strips inherited identity variables from child processes and so avoids the hygiene problem the manual attempt hit. All six cases pass, including the two that must not fire — a lookalike personal name, and an address that merely embeds the placeholder as a substring of a different host. Over-blocking a legitimate identity would be its own defect.

The suite was then red-green proven against the shipped artifact: with the guard neutralised, the four refusal cases fail and the two allow cases still pass — the correct signature, since the allow cases do not depend on the guard firing — and with it restored byte-for-byte, all six pass again.

Lint and the scripts typecheck are clean, and the two sibling hook suites still pass, confirming the pre-commit edit did not disturb the guards already wired there.

# Caveats / Follow-ups

The override source remains unidentified. That is a deliberate stopping point rather than an omission: the acceptance criteria make recording it conditional on finding it and name the guard as the durable fix independent of root-causing. If a future commit is refused by this guard, the refusal message prints the offending identity and the command to inspect the environment, which is the most likely moment the source will finally be caught in the act — recording it on this item at that point would close the remaining question. The existing mis-attributed commits are left exactly as they are; the guard protects the future, and correcting the past is out of scope by the item's own terms. Finally, the guard is bypassable with the standard no-verify escape, which is intentional and consistent with every other guard in this hook — a fixture repository in a test may legitimately want a placeholder author.
