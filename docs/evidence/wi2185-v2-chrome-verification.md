# WI-2185 — V2 chrome geometry verification

**Item:** WI-2185 — Reserve fixed V2 chrome space before pushed-screen content  
**Captured:** 2026-07-17  
**Scope:** V2 root-scene clearance, pushed-route safe-area ownership, narrow
supporter scope controls, and the related web route inventory.

## Acceptance-criteria coverage

### AC-1 — reserve the complete chrome band exactly once

`apps/mobile/src/app/(app)/_layout.test.tsx` renders the active root scene through
the Tabs boundary instead of calling `screenOptions` directly. Its matrix covers:

- pushed `/mentor-memory`, `/more/accommodation`, `/subscription`, and
  `/more/account` routes with web `top=0` and native `top=47` insets;
- a measured 64px scope-control height, proving clearance follows the rendered
  control rather than a fixed constant;
- top-level `/mentor` and full-screen `/account` and `/session` routes, proving
  the pushed-scene clearance is not duplicated; and
- flags-off, V0, V1, and proxy-chrome opt-outs.

### AC-2 — named routes and native safe-area ownership

The route tests render the real screen roots at `top=47` and assert their own top
safe-area padding for mentor memory, accommodation, and subscription. Account is
different by design: its content has no top padding because the enclosing More
native Stack owns the safe area. `more/_layout.test.tsx` asserts that Account keeps
its header and that the Stack explicitly uses an opaque header
(`headerTransparent: false`); `more/account.test.tsx` asserts Account does not add a
second content inset.

W-05 renders all four named pushed destinations plus the More index at both wide
and 360x760 viewports. It checks direct entry, reload, the nested Account back
action, content/chrome bounds, and absence of runtime page errors.

### AC-3 — long labels, text scale, targets, and measured growth

The J-03 narrow-browser regression uses the actual `ScopeChip` with five supporter
scopes, several long names, and injected 32px text with a 52px line height. It
asserts horizontal overflow is scrollable, each target remains at least 44x44px,
every target can be scrolled into view and selected independently, exactly one
selection remains active, and no target intersects the avatar. It then enters
`/more/account` and proves the taller measured scope shell remains separate from
the avatar while pushed Account content starts below the complete chrome band.

`ScopeChip` now uses a bounded horizontal `ScrollView` and 44px minimum targets, so
additional scopes remain operable instead of overflowing underneath the avatar.

### AC-4 — regression gates and route contracts

The final unit run covers the root layout, the three safe-area-owning screens,
Account's no-double-inset contract, the More native Stack, and `ScopeChip`. Routed
browser validation covers J-01, J-03, J-10, W-04, and W-05. J-10's sign-in readiness
was updated from the retired V2 `/home`/`learner-screen` landing to
`/mentor`/`mentor-screen`; its Practice/Quiz journey itself was unchanged.

## Red-green-revert proof

### ScopeChip browser behavior

The 360x760 J-03 regression was first run before the horizontal-scroll fix and
again after temporarily reverting only that fix. Both runs failed at the same
observable browser contract:

```text
Expected pattern: /auto|scroll/
Received string:  "visible"

  118 |   expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
> 120 |   expect(overflow.overflowX).toMatch(/auto|scroll/);

1 failed, 2 passed
```

After restoring the horizontal `ScrollView` and 44px targets, the same fresh web
export and test passed:

```text
3 passed (1.3m)
```

The three include the two authentication setup cases plus the targeted J-03
geometry regression.

### More native Stack ownership

With the opaque-header option temporarily removed and the regression untouched:

```text
MoreLayout native-safe geometry
  ✕ keeps Account under the opaque native header that owns the top safe area

Expected: false
Received: undefined

Test Suites: 1 failed, 1 total
Tests:       1 failed, 1 total
```

After restoring `headerTransparent: false`:

```text
MoreLayout native-safe geometry
  ✓ keeps Account under the opaque native header that owns the top safe area

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

## Final unit verification

Command, from the repository root:

```text
pnpm --filter @eduagent/mobile exec jest --runInBand --forceExit \
  'src/app/\(app\)/_layout.test.tsx' \
  'src/app/\(app\)/more/_layout.test.tsx' \
  'src/app/\(app\)/mentor-memory.test.tsx' \
  'src/app/\(app\)/more/accommodation.test.tsx' \
  'src/app/\(app\)/subscription.test.tsx' \
  'src/app/\(app\)/more/account.test.tsx' \
  'src/components/chrome/ScopeChip.test.tsx'
```

Captured result:

```text
Test Suites: 7 passed, 7 total
Tests:       224 passed, 224 total
Snapshots:   0 total
```

## Final routed browser verification

All runs used the V2 flags and the staging API through the repository's Doppler
configuration. The combined explicit-spec run covered J-01, J-03, J-10, W-04, and
W-05 in one fresh web export. Before the readiness correction, every non-J-10 case
passed and both J-10 cases stopped before their journey at the retired landing
expectation:

```text
2 failed — both J-10 signed-in readiness at /home/learner-screen
11 passed — setup, J-01, J-03, W-04, W-05 wide, and W-05 360x760
```

After changing only J-10's readiness landing to `/mentor`/`mentor-screen`, the
complete J-10 spec was rerun:

```text
4 passed (1.8m)
```

The four include two setup cases and both J-10 cases. Taken together, the final
post-change results are green for all eleven named route tests: J-01 (2), J-03 (3),
J-10 (2), W-04 (1), and W-05 (3).

## Static verification

Fresh, uncached typecheck:

```text
pnpm exec nx run @eduagent/mobile:typecheck --skip-nx-cache
NX Successfully ran target typecheck for project @eduagent/mobile and 6 tasks it depends on
```

Fresh lint:

```text
pnpm exec nx run @eduagent/mobile:lint --skip-nx-cache
0 errors, 51 warnings
```

The warnings are the repository's existing mobile warning set; no changed WI-2185
file produced a new lint diagnostic.
