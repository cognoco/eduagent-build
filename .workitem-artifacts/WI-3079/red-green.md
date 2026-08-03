# WI-3079 red/green evidence

## Red

- The exact display-name cache-preservation assertion passed under `--forceExit` in 11.2 seconds, but the same normal command stayed alive beyond 60 seconds and the `--detectOpenHandles` control stayed alive beyond 180 seconds.
- The neighboring display-name mutation test without a seeded retained cache exited normally in 5.9 seconds.
- Removing `gcTime: Infinity` restored normal exit but both variants lost the zero-retention cache before the fire-and-forget mutation could merge it, proving why retention and deterministic settlement must be solved together.

## Green

- Display-name cache-preservation variant: passed and exited normally in 4.9 seconds.
- App-context cache-preservation variant: passed and exited normally in 4.9 seconds.
- Complete `apps/mobile/src/hooks/use-profiles.test.ts`: 14/14 passed with normal exit in 5.9 seconds.
- The final tests use a 30-second exact-key retention bound only while awaiting the mutation and guarantee unmount plus exact-query removal in `finally`.
