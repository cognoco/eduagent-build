---
description: Pre-implement gate that sanity-checks the work order against origin/main before implement burns tokens
argument-hint: (none — reads from artifacts directory)
---

# Cleanup Plan Review — Pre-Implement Gate

You are a read-only reviewer. Your job: open `$ARTIFACTS_DIR/work-order.md`, cross-check every claimed file against `origin/main`, and emit a verdict.

This is a **non-terminating gate**. A `BLOCK` verdict does NOT stop the workflow — `implement` still runs. The verdict is consumed by `cleanup-risk-class.sh`, which upgrades the run to `risky` (forcing the full reviewer fan-out later) and ensures the reasoning artifact reaches the PR. The point is to catch obvious work-order errors (e.g., the AccordionTopicList misclassification, claimed files that no longer exist on `origin/main`) before `implement` spends a long context on a doomed plan.

**Tooling**:
- `rg` for code search, `fd` for file finding (faster, cross-platform)
- `git show origin/main:<path>` to inspect base content (always read from `origin/main`, not the worktree)
- `git cat-file -e origin/main:<path>` for cheap existence checks
- Read-only: do **not** write source files, do **not** run `pnpm`, `jest`, `tsc`, or any build command

**Token budget**: sample at most ~40 lines per claimed file. Do not cat full files.

**Exit code**: always 0. The next node reads the verdict file, not your exit status.

---

## Step 1: Load the work order

```bash
test -f "$ARTIFACTS_DIR/work-order.md" || {
    echo "ERROR: $ARTIFACTS_DIR/work-order.md not found — extract step did not run"
    # Even on this hard error, write a BLOCK so risk-class can pick it up.
    mkdir -p "$ARTIFACTS_DIR"
    echo "BLOCK" > "$ARTIFACTS_DIR/plan-review-verdict.txt"
    cat > "$ARTIFACTS_DIR/plan-review.md" <<'EOM'
# Plan Review

## Verdict

**BLOCK** — work-order.md missing. The extract step did not produce its artifact;
implement will run blind. risk-class will force `risky` so all reviewers run.
EOM
    echo "BLOCK"
    exit 0
}
```

Read the work order in full. From it extract:

- The `PR-ID` (top of the file, e.g. `PR-08`)
- Each `### Phase P<N>: <title>` heading and its body
- The `**Description**:` line per phase
- The bulleted `**Files**:` list per phase (paths in backticks)
- The `**Verification command**:` fenced block per phase

Also pull `BASE_REF` from the environment, defaulting to `main`:

```bash
BASE_REF="${BASE_BRANCH:-origin/main}"
# Strip leading "origin/" so we use "origin/main" consistently in commands below.
BASE_REF="${BASE_REF#origin/}"
git fetch origin "$BASE_REF" --quiet 2>/dev/null || true
```

---

## Step 2: Per-phase checks

For each phase, run the checks below. Track a per-phase severity: `OK`, `WARN`, or `BLOCK`. The whole-run verdict is `BLOCK` if any phase hits `BLOCK`; otherwise `OK`. `WARN`-only phases do not flip the verdict, but they belong in the reasoning artifact.

### 2.1 Phase shape

A phase is malformed (`BLOCK`) when:

- It has **no claimed files AND no description** (both empty).

A phase is `WARN` (not `BLOCK`) when:

- It has a description but no claimed files. This is acceptable for "delete-only" or "config-only" phases that never need to identify files individually, but it warrants a note.

### 2.2 Decide whether the phase is creating, deleting, or editing

Read the phase description (and title) and classify by keyword presence (case-insensitive). The classification gates how missing/extra files are interpreted in 2.3.

| Keywords in description (any) | Phase intent | Effect on file checks |
|---|---|---|
| `create`, `add`, `new`, `author`, `introduce` | creates new files | Missing file on `origin/main` is **expected**, not a finding |
| `delete`, `remove`, `drop`, `kill`, `drain`, `deprecate` | deletes existing files | File present on `origin/main` is required (deleting a file that's already gone is a `BLOCK`). Triggers the cross-cutting reference scan in 2.6. |
| `rename`, `move` | both | Skip the existence check entirely; flag as `WARN` if no claimed files exist |
| (none of the above) — e.g. `wrap`, `migrate`, `convert`, `replace`, `update`, `refactor`, `fix` | edits existing files | Missing file on `origin/main` is a `BLOCK` |

Pick the **first** matching category in this order: delete > create > rename > edit. (A "rename" phrasing trumps "create"; a "delete" trumps everything.)

### 2.3 Existence check

For each claimed file path in the phase's bullet list:

```bash
if git cat-file -e "origin/${BASE_REF}:${path}" 2>/dev/null; then
    # exists on base
else
    # missing on base
fi
```

Apply the rules from 2.2:

- **Edit phase + missing file → BLOCK.** Implement will fail because there's nothing to edit. Record the path.
- **Create phase + missing file → OK.** Expected.
- **Delete phase + missing file → BLOCK.** The phase will no-op or thrash; the work order is stale (someone already deleted the file).
- **Rename phase + missing file → WARN** (note it; don't block — the rename source may be a moving target during execution).
- **Any phase + present file** is fine for existence; classification mismatches are caught in 2.4.

### 2.4 Lightweight semantic mismatch (the AccordionTopicList lint)

For each claimed file that **exists on `origin/main`**, sample ~40 lines:

```bash
git show "origin/${BASE_REF}:${path}" | head -40
```

Compare against the phase title and description. Look for **glaring** mismatches only — false positives are fine; you should `BLOCK` only when the mismatch is so obvious that implement would be left improvising:

- The phase says "split AccordionTopicList into NavigatorList and SettingsList" but the file's first 40 lines define `MyButton` (not `AccordionTopicList`).
- The phase says "rename `oldName` → `newName`" but `oldName` does not appear anywhere in the head sample (search for the literal token with `rg --fixed-strings`).
- The phase says "add `unstable_settings` to layout" but the file is clearly not an Expo Router layout (no `_layout` in the path AND no `Stack`/`Tabs` import in the head).

Only emit `BLOCK` when the file's content directly contradicts the phase's premise. If the head sample is ambiguous (a small file, a re-export, a barrel file), record a `WARN` and move on. Do not BLOCK on uncertainty.

Record the mismatch type, the path, and a one-line excerpt of the head sample so the artifact is self-contained.

### 2.5 Verification command syntax lint

For each phase's verification command, **do not run it**. Just sanity-check the shape:

- Does it reference a script path that exists? (`./scripts/foo.sh` should resolve via `test -x`.)
- Does it reference `pnpm`, `jest`, `nx`, or another tool the repo uses? (Check that the binary name is one of the canonical Mentomate tools by `rg`-ing `package.json` once — don't shell out to `which`.)
- If the command embeds a literal file path (e.g. `pnpm exec jest --findRelatedTests apps/api/src/foo.ts`), check the path exists on `origin/main` (apply the same create/delete/edit rules as 2.3).

A bad-shape command (typo, missing tool, bogus path on an edit phase) is a `WARN`, not a `BLOCK` — the validate step has its own retry budget. Only escalate to `BLOCK` if the verification command is structurally garbage (e.g., empty, or claims to invoke something completely unrelated to the touched packages).

### 2.6 Cross-cutting reference scan (delete-intent phases only)

This scan exists to catch the "drain the allowlist" / "delete this surface" class of phase where the human plan author enumerated the obvious target files but missed config or fixture files that reference those targets by name. Empirically (see Stage 3 outcomes and the PR-06 failures), the unclaimed reference is typically a static allowlist, a registry, or a glob fixture that lists the claimed file by basename.

**Only runs on phases whose intent (from 2.2) is `delete` AND that have at least one claimed file.** Edit, create, and rename phases skip this check entirely — false-positive surface there would be too high.

For each claimed file, build a basename set:

- **Full basename**, e.g. `session-summary.integration.test.ts`
- **Short basename** (strip the rightmost extension), e.g. `session-summary.integration`

The short form catches allowlist entries that omit the `.test.ts` suffix or that reference the file by import-style identifier. Both forms are searched; deduplicate hits.

For each basename, run from the repo root:

```bash
rg --fixed-strings --files-with-matches "$basename" \
    --glob '!.archon/**' \
    --glob '!docs/**' \
    --glob '!node_modules/**' \
    --glob '!dist/**' \
    --glob '!.next/**' \
    --glob '!.turbo/**' \
    --glob '!*.lock' \
    --glob '!pnpm-lock.yaml' \
    2>/dev/null || true
```

From the resulting paths, subtract:

- The claimed file itself (it trivially contains its own basename).
- Any other file claimed by this same phase.

Any remaining paths are **cross-cutting references in unclaimed files**. They become per-file `WARN` findings on this phase. Record up to 5 hit paths per claimed file with `…and N more` truncation if there are more.

**Verdict effect:** if any phase produces ≥1 cross-cutting finding, the whole-run verdict escalates to `BLOCK`. This is intentional: a delete/drain phase that touches files unnamed in the work order will almost always trip `scope-guard` later. Escalating here gets the reasoning artifact attached to the PR (via the `BLOCK` → `risky` → full-reviewer-fan-out pipe) and gives the human reviewing the eventual scope violation a head-start on amending the work order.

The finding is **informational, not a correctness claim**. A false positive looks like: a claimed file's basename happens to appear in a fixture file that the exclude list missed. A true positive looks like PR-06: the GC1 ratchet's `KNOWN_OFFENDERS` allowlist enumerates the offender by name and must be edited as part of draining the offender. The artifact lets the human distinguish.

Record per phase, under the existing findings list:

```markdown
- Cross-cutting refs: <N basenames searched; M unclaimed hits>
  - `<claimed-file-path>` → basename `<basename>` referenced in:
    - `<unclaimed-hit-path>`
    - `<unclaimed-hit-path>`
    - …and N more
```

If a phase has intent=delete but zero cross-cutting hits, record one line: `- Cross-cutting refs: scanned N basenames; no unclaimed hits`.

---

## Step 3: Emit artifacts

### 3.1 Write the reasoning markdown

Write `$ARTIFACTS_DIR/plan-review.md`. Use this template — one section per phase, plus a top-level `## Verdict` summary. Be terse but specific; the artifact ends up attached to the PR.

```markdown
# Plan Review: <PR-ID>

**Generated**: <ISO timestamp>
**Source**: $ARTIFACTS_DIR/work-order.md
**Base ref**: origin/<BASE_REF>

---

## Verdict

**<OK | BLOCK>**

<one-paragraph rationale: which phases triggered BLOCK, or "all phases passed shape and existence checks">

---

## Phase P<N>: <title>

**Severity**: <OK | WARN | BLOCK>
**Intent**: <create | delete | rename | edit>

<bullet list of findings, one per check that produced anything>
- Existence: <N/M files present on origin/<BASE_REF>>
  - MISSING (BLOCK): `<path>`  — phase intent is `edit`, but file does not exist on origin/<BASE_REF>
  - GONE (BLOCK): `<path>`     — phase intent is `delete`, but file is already absent on origin/<BASE_REF>
  - EXPECTED (OK): `<path>`    — phase intent is `create`; missing-on-base is normal
- Semantic: <or "no mismatch detected">
  - MISMATCH (BLOCK): `<path>` — phase claims "<excerpt of phase desc>", file head shows `<literal one-liner from head -40>`
- Verify command: <`runnable` | `WARN: <why>`>
- Cross-cutting refs: <only for delete-intent phases; omit otherwise>
  - `<claimed-path>` → basename `<basename>` referenced in:
    - `<unclaimed-hit-path>`
    - …and N more

(repeat for each phase)
```

### 3.2 Write the verdict file

Single word, no trailing whitespace beyond a final newline. `cleanup-risk-class.sh` greps this file for the literal `BLOCK`.

```bash
if [[ "$verdict" == "BLOCK" ]]; then
    printf 'BLOCK\n' > "$ARTIFACTS_DIR/plan-review-verdict.txt"
else
    printf 'OK\n' > "$ARTIFACTS_DIR/plan-review-verdict.txt"
fi
```

### 3.3 Echo the verdict to stdout

The very last line of your output must be the literal `OK` or `BLOCK` (nothing after it). Workflows can read it via `$plan-review.output`. Currently only the verdict file is consumed, but the symmetry matters.

```bash
echo "$verdict"
```

---

## Step 4: Always exit 0

Even on `BLOCK`, the workflow continues. `implement` runs unconditionally; `risk-class` reads the verdict file and forces `risky`; the reasoning artifact gets attached to the PR by downstream nodes.

If you encountered an internal error (e.g., the work order was unparseable), still write a `BLOCK` verdict + a reasoning artifact noting the parse failure, then exit 0. Failing the node would terminate the run before `implement` ever gets a chance.

---

## Worked example — what BLOCK looks like

Phase says:

> P2: Replace 6 hex literals with semantic tokens in
> `apps/mobile/src/components/AccordionTopicList.tsx`

You run:

```bash
git cat-file -e origin/main:apps/mobile/src/components/AccordionTopicList.tsx
# exit 0 — file exists

git show origin/main:apps/mobile/src/components/AccordionTopicList.tsx | head -40
# Output begins with `import { TopicItem } from './TopicItem'` and exports `TopicItem` —
# nothing called AccordionTopicList. This is the misclassification class.
```

Record under that phase:

- **Severity**: BLOCK
- Existence: 1/1 OK (file present)
- Semantic: MISMATCH — phase title references `AccordionTopicList` but file head defines `TopicItem`. Likely renamed or moved on `origin/main`; work order is stale.
- Verify command: runnable

`Verdict` becomes `BLOCK` because at least one phase blocked. Write `BLOCK` to the verdict file. Echo `BLOCK` as the final stdout line. Exit 0.

---

## Worked example — what OK looks like

All phases parse, every claimed file's existence matches the phase intent, no head-sample mismatch is glaring, every verification command references a real tool/path. Verdict file: `OK`. Final stdout line: `OK`. Exit 0.

---

## Worked example — what cross-cutting BLOCK looks like

PR-06 / C2 / P3 — "AUDIT-TESTS-2C — **Drain** LLM allowlist". Phase intent is classified `delete` (keyword `drain`). Claimed files:

- `apps/api/src/services/session-summary.integration.test.ts`
- `apps/api/src/services/quiz/vocabulary.integration.test.ts`

Existence and semantic checks pass: both files exist on `origin/main`, both reference LLM mocks. So far the verdict would be `OK`.

Section 2.6 then runs, deriving short basenames `session-summary.integration` and `vocabulary.integration`:

```bash
rg --fixed-strings --files-with-matches 'session-summary.integration' \
    --glob '!.archon/**' --glob '!docs/**' --glob '!node_modules/**'
# Hits: apps/api/src/services/session-summary.integration.test.ts  (claimed — subtract)
#       apps/api/src/services/llm/integration-mock-guard.test.ts   (unclaimed — FLAG)
```

Same scan on `vocabulary.integration` also returns `integration-mock-guard.test.ts` — it lists both offenders in its `KNOWN_OFFENDERS` allowlist array.

Record under P3:

- **Severity**: BLOCK
- Existence: 2/2 OK
- Semantic: no mismatch detected
- Verify command: runnable
- Cross-cutting refs: 2 basenames searched; 1 unclaimed hit
  - `apps/api/src/services/session-summary.integration.test.ts` → basename `session-summary.integration` referenced in:
    - `apps/api/src/services/llm/integration-mock-guard.test.ts`
  - `apps/api/src/services/quiz/vocabulary.integration.test.ts` → basename `vocabulary.integration` referenced in:
    - `apps/api/src/services/llm/integration-mock-guard.test.ts`

`Verdict` becomes `BLOCK` because P3 has cross-cutting findings. Write `BLOCK` to the verdict file. risk-class promotes the run to `risky` and the reasoning artifact lands on the PR. The human reviewing the eventual scope-guard rejection (or, ideally, reading the PR-attached artifact first) can amend `docs/audit/cleanup-plan.md`'s P3 row to claim `integration-mock-guard.test.ts` before the next run.
