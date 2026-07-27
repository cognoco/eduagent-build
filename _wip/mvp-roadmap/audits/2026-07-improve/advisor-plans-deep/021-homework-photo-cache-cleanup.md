# Plan 021: Delete homework photos of minors from the device cache

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans-deep/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8c049b93f..HEAD -- apps/mobile/src/hooks/use-homework-ocr.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: **P1**
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security / privacy
- **Planned at**: commit `8c049b93f`, 2026-07-13
- **Audit finding**: #6

## Why this matters

Every homework photo a learner takes is written to the device cache **and never
deleted**. `deleteAsync` does not appear **anywhere** in `apps/mobile/src` — not
once, in the entire mobile source tree.

The product's users are minors. These are camera photos of a child's homework:
handwriting, worksheets, often a school name or the child's own name printed on
the page. They accumulate on the device indefinitely, for every capture, forever.

It is worse than one file per photo. A single capture produces **up to three**:

1. `copyToCache()` writes `homework-<timestamp>.jpg` into `FileSystem.cacheDirectory`.
2. `recognizeText()` calls `resizeImage()`, which produces a **new** file via
   `manipulateAsync`.
3. The server-upload path calls `resizeImage()` **again**, producing a third.

None are removed. There is no cleanup on unmount, no cleanup when a new capture
replaces the old one, no TTL sweep.

`FileSystem.cacheDirectory` is *evictable by the OS under storage pressure* — which
is the only reason this isn't unbounded growth. But "the operating system might
delete it eventually, if the disk fills up" is not a data-retention policy for
images of children, and it is not what a GDPR/COPPA data-minimisation review would
accept. The repo already treats these URIs as security-relevant: there is a
dedicated `_image-uri-allowlist.ts` guarding what may be read from those very
directories. The write side has no matching discipline.

## Current state

### The three writers

`apps/mobile/src/hooks/use-homework-ocr.ts:102-106`:

```ts
async function copyToCache(tempUri: string): Promise<string> {
  const stableUri = `${FileSystem.cacheDirectory}homework-${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: tempUri, to: stableUri });
  return stableUri;
}
```

`apps/mobile/src/hooks/use-homework-ocr.ts:108-114`:

```ts
async function resizeImage(uri: string): Promise<string> {
  const result = await manipulateAsync(uri, [{ resize: { width: 1600 } }], {
    format: SaveFormat.JPEG,
    compress: 0.9,
  });
  return result.uri;
}
```

`resizeImage` is called from **two** places, each producing its own file:

- `apps/mobile/src/hooks/use-homework-ocr.ts:171-172` — `recognizeText()`:
  ```ts
  async function recognizeText(imageUri: string): Promise<RecognizedTextResult> {
    const resizedUri = await resizeImage(imageUri);
  ```
- `apps/mobile/src/hooks/use-homework-ocr.ts:194-199` — the upload path:
  ```ts
    imageUri: string,
    …
    const uploadUri = await resizeImage(imageUri);
  ```

### The capture path, and the ref that makes cleanup tractable

`apps/mobile/src/hooks/use-homework-ocr.ts:538-551`:

```ts
    // M-03: wrap copyToCache in try/catch so failures set error state
    let stableUri: string;
    …
      stableUri = await copyToCache(uri);
    …
    currentUriRef.current = stableUri;
    await runOcr(stableUri, false);
```

`currentUriRef` already tracks the live stable URI (it exists so **retry** can
re-run OCR against the same file). That ref is your cleanup anchor.

### Proof of the gap

```
rg -n 'deleteAsync|FileSystem\.delete' apps/mobile/src
→ 0 matches
```

### The lifetime constraint that shapes the fix

The two file classes have **different** lifetimes, and conflating them will break
the UI:

- **The resized files** (`resizeImage` output) are pure intermediates. They are
  handed to the OCR engine or the uploader and never rendered. They can be
  deleted the moment their consumer is done — in a `finally`.
- **The stable file** (`copyToCache` output) is the one the **preview is
  displaying**, and the one **retry re-reads**. Deleting it when OCR finishes
  would blank the user's preview and break retry. It may only be deleted when it
  is *replaced by a new capture* or when the hook *unmounts*.

Getting this backwards is the one way to turn a privacy fix into a visible bug.

### Repo conventions

- Tests are co-located. No `__tests__/` folders.
- Do NOT add internal `jest.mock('./...')` — GC1 CI ratchet. `expo-file-system` is
  an external boundary and is mocked with a bare specifier — that is fine and is
  already done in the sibling tests (see `_image-uri-allowlist.test.ts`).
- `FileSystem` here is the **legacy** import path (see the note atop
  `_image-uri-allowlist.ts`). Use the same import the file already uses; do not
  "modernise" it as a drive-by.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck mobile | `cd apps/mobile && pnpm exec tsc --noEmit` | exit 0 |
| Lint mobile | `pnpm exec nx lint mobile` | exit 0 |
| Targeted test | `pnpm exec jest --config apps/mobile/jest.config.cjs --no-coverage apps/mobile/src/hooks/use-homework-ocr` | all pass |

## Scope

**In scope:**
- `apps/mobile/src/hooks/use-homework-ocr.ts` — delete resized intermediates after
  use; delete the stable file on replacement and on unmount.
- `apps/mobile/src/hooks/use-homework-ocr.test.ts` — the regression tests.

**Out of scope (do NOT touch):**
- `_image-uri-allowlist.ts` — the **read**-side guard. Correct as-is, and not what
  this plan is about.
- Any server-side retention of the uploaded image. Whether the API stores the
  homework photo and for how long is a real and separate question — note it as a
  follow-up, do not answer it here.
- A general cache-sweeper for the whole app. YAGNI: fix the writer that leaks,
  don't build a garbage collector.
- Migrating off the legacy `expo-file-system` import path.

## Git workflow

- Branch from `main`: `advisor/021-homework-photo-cache-cleanup`
- Conventional commits (e.g. `fix(mobile): delete homework photo cache artifacts`).
- Do NOT push or open a PR unless explicitly instructed.

## Steps

### Step 1: Confirm the leak is exactly as described

```
rg -n 'deleteAsync' apps/mobile/src
rg -n 'copyToCache|resizeImage' apps/mobile/src/hooks/use-homework-ocr.ts
```

Expected: zero `deleteAsync`; `resizeImage` defined once and called at `:172` and
`:199`; `copyToCache` called once at `:541`.

If `deleteAsync` now appears somewhere, STOP — someone has partially fixed this and
the plan needs re-scoping against what they did.

### Step 2: Write the failing regression tests

Extend `apps/mobile/src/hooks/use-homework-ocr.test.ts`. Read the existing tests
first and follow their mocking conventions for `expo-file-system` /
`expo-image-manipulator`.

Three tests, asserting on `FileSystem.deleteAsync` calls:

```ts
it('[WI-XXXX] deletes the resized intermediate after OCR completes', async () => {
  // run a capture; the manipulateAsync output URI must be passed to deleteAsync
  expect(deleteAsyncSpy).toHaveBeenCalledWith(RESIZED_URI, { idempotent: true });
});

it('[WI-XXXX] deletes the previous capture when a new photo replaces it', async () => {
  // capture A, then capture B; A's stable URI must be deleted, B's must NOT
  expect(deleteAsyncSpy).toHaveBeenCalledWith(STABLE_URI_A, { idempotent: true });
  expect(deleteAsyncSpy).not.toHaveBeenCalledWith(STABLE_URI_B, expect.anything());
});

it('[WI-XXXX] deletes the current capture on unmount', async () => {
  // capture, then unmount the hook
  expect(deleteAsyncSpy).toHaveBeenCalledWith(STABLE_URI, { idempotent: true });
});
```

Add a **fourth** test pinning the constraint that protects the UI:

```ts
it('[WI-XXXX] does NOT delete the stable URI while it is still displayed', async () => {
  // capture, let OCR finish, do not unmount, do not re-capture
  expect(deleteAsyncSpy).not.toHaveBeenCalledWith(STABLE_URI, expect.anything());
});
```

That fourth test is the one that stops a later "tidy-up" from deleting the preview
out from under the user. It should **pass** both before and after your change —
it is a guard, not a red-green.

**Verify**: the first three **MUST FAIL** now (zero `deleteAsync` calls). The
fourth must pass.

**If any of the first three passes before the fix, STOP and report.**

### Step 3: Delete the resized intermediates

Both `resizeImage` consumers own their output and must release it. Wrap each in a
`try/finally`:

`apps/mobile/src/hooks/use-homework-ocr.ts` — in `recognizeText` (~`:171`):

```ts
async function recognizeText(imageUri: string): Promise<RecognizedTextResult> {
  const resizedUri = await resizeImage(imageUri);
  try {
    // …existing body, unchanged…
  } finally {
    // ponytail: intermediate only — never rendered, never retried against
    await FileSystem.deleteAsync(resizedUri, { idempotent: true }).catch(() => {});
  }
}
```

Apply the same shape to the upload path's `uploadUri` (~`:199`).

`{ idempotent: true }` means "do not throw if it's already gone". The `.catch(() => {})`
means a failed *cleanup* can never fail the user's OCR — cleanup is best-effort by
design.

**Verify**: `cd apps/mobile && pnpm exec tsc --noEmit` → exit 0; the first test
from Step 2 now passes.

### Step 4: Delete the stable file on replacement and on unmount

In the capture handler (~`:538-551`), delete the **previous** stable URI before
overwriting the ref:

```ts
    const previousUri = currentUriRef.current;
    currentUriRef.current = stableUri;
    if (previousUri && previousUri !== stableUri) {
      await FileSystem.deleteAsync(previousUri, { idempotent: true }).catch(() => {});
    }
    await runOcr(stableUri, false);
```

Order matters: assign the ref **first**, then delete the old file. If the delete
throws and you have not yet reassigned, you leak the *new* URI's identity too.

Then add an unmount cleanup effect in `useHomeworkOcr` (~`:266`):

```ts
  useEffect(() => {
    return () => {
      const uri = currentUriRef.current;
      if (uri) {
        void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    };
  }, []);
```

Empty dep array — this fires on unmount only. Do **not** add `currentUriRef.current`
as a dependency (refs are not reactive; it would not work, and it would run the
cleanup at the wrong times if it did).

**Verify**: tests 2 and 3 from Step 2 now pass; test 4 (the do-not-delete guard)
**still passes**.

### Step 5: Green, then revert-check

This is a privacy fix, so the repo mandates red–green–revert:

1. All four tests pass.
2. Remove the `deleteAsync` call added in Step 4 (replacement path).
3. Re-run → the replacement test **FAILS**.
4. Restore. Re-run → **PASSES**.
5. Repeat for the Step 3 intermediate-delete.

### Step 6: Validate

**Verify**, all of:
- `cd apps/mobile && pnpm exec tsc --noEmit` → exit 0
- `pnpm exec nx lint mobile` → exit 0
- The `use-homework-ocr` suite passes in full, including pre-existing tests
- `rg -n 'deleteAsync' apps/mobile/src` now returns matches **only** in
  `use-homework-ocr.ts` and its test

## Test plan

- Resized intermediate deleted after OCR completes (red-green).
- Resized intermediate deleted **even when OCR throws** — the `finally` must fire.
  Force the OCR call to reject and assert `deleteAsync` was still called. This is
  the test most likely to be skipped and most likely to catch a real leak.
- Previous stable file deleted when a new capture replaces it (red-green).
- Current stable file deleted on unmount (red-green).
- Stable file **not** deleted while still displayed (guard; passes before and after).
- Do NOT add internal `jest.mock('./...')`. `expo-file-system` is an external
  boundary — bare-specifier mock is correct.

## Done criteria

ALL must hold:

- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm exec nx lint mobile` exits 0
- [ ] The `use-homework-ocr` suite passes, including all pre-existing tests
- [ ] Every one of the three new red-green tests provably fails with its fix removed (Step 5 performed)
- [ ] The OCR-throws case is covered and passes
- [ ] The "do not delete while displayed" guard test passes
- [ ] Cleanup failures cannot fail a user-facing OCR (every `deleteAsync` is `idempotent` **and** `.catch()`-guarded)
- [ ] `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans-deep/README.md` status row updated

## STOP conditions

Stop and report — do not improvise — if:

- `deleteAsync` already appears in the source (someone got here first).
- The preview breaks, or retry stops working, after your change. That means a
  stable URI is being deleted while still live — go back to the lifetime
  constraint in "Current state" and re-read it.
- You find yourself deleting the stable URI when OCR *completes*. That is the
  wrong lifetime and it will blank the user's screen.
- You are tempted to write a general cache sweeper / TTL job. Out of scope.

## Maintenance notes

- **The follow-up this fix does not cover**: what happens to the image
  **server-side** after upload. This plan closes the on-device leak only. Whether
  the API persists the homework photo, and under what retention policy, is a real
  GDPR/COPPA question and should be filed separately.
- **What a reviewer should scrutinize**: the `finally` in Step 3 (does cleanup
  survive an OCR exception?) and the ordering in Step 4 (ref assigned before the
  old file is deleted). Those are the two places this fix can be subtly wrong.
- **Why `cacheDirectory` is not an excuse**: the OS *may* evict it under storage
  pressure. That is an eviction policy, not a retention policy, and it is not a
  defence in a data-minimisation review. Write the deletes.
- **The generalisable rule**: `deleteAsync` occurring **zero** times in a codebase
  that writes camera images to disk is itself the smell. If a future feature writes
  to `cacheDirectory` or `documentDirectory`, it owns the delete.
