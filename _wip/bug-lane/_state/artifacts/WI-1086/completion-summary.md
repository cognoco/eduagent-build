**What was done:** Re-finalized WI-1086 with NO code change — the styling-token discipline work (the `bg-danger-soft` no-op fix plus the broader Tailwind color-token alias guards) was already implemented, merged, and on origin/main; the prior review rejection was a transient reviewer-clone sync-timing artifact, not a code defect.

**What changed:** No source change in this re-finalization. The previously-landed work maps the emitted color CSS variables in `apps/mobile/tailwind.config.js` (so `bg-danger-soft` and the proxy-preview tokens resolve instead of silently no-op-ing) and guards every emitted color variable in `apps/mobile/src/lib/design-tokens.test.ts`.

**Verification:** The focused design-tokens regression passes, `nx lint mobile` is clean, and the required branch-protection checks passed on the merged pull request; the prior blocking signal (an `apps/api` db-errors typecheck failure) is not reproducible on synced origin/main nor in the now-synced reviewer clone, where the relevant `drizzle-orm` export is present.

**Caveats / Follow-ups:** The earlier rejection was a transient reviewer-clone sync-timing race (stale clone at review time) tracked under the reviewer-clone harness item — no WI-1086 code action; if re-review re-bounces it indicates live per-run clone staleness to capture as fresh harness evidence rather than rework here.
