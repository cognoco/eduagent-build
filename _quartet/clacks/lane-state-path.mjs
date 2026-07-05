// WI-1245 A-2 indirection point (design: `_quartet/library/artifact-disposition.md` §3,
// "Clacks-channel slice — recommendation", Option A / mechanic A-2).
//
// The canonical contract is the env key itself: `<QUARTET_LANE_STATE_ROOT>/<lane>/_state`
// (falling back to today's in-tree `_quartet/working/lanes/<lane>/_state` when unset).
// This function is the JS/TS binding to that contract — the one every Node/Bun
// reader/writer in this repo (the per-lane monitor scripts, `l1-liveness-check.js`,
// `validate-channel-envelope.js`) should call rather than hardcoding the relative path.
// It is NOT the only binding: shell/ad-hoc writers and anything driven by `Monitor`
// (`tail -f`, cron polling loops) cannot call a JS function — they read
// `QUARTET_LANE_STATE_ROOT` directly and must reproduce the SAME `<root>/<lane>/_state`
// formula (no trailing slash, `/` separator) so a shell binding can never drift from
// this one and split readers/writers onto different files. That is what makes the
// eventual A-2 cutover (relocating the channel files out of the tracked working tree, so
// no git operation — stash, rebase, merge, add — can ever touch them) a single env-var
// flip instead of a grep-and-replace across every caller.
//
// Default (QUARTET_LANE_STATE_ROOT unset) is a NO-OP: today's in-tree relative path,
// unchanged. This WI (build-only) does not flip that default — the cutover is a
// separate, coordinated cross-session migration (see artifact-disposition.md §3
// "Migration path"), not something a single PR does unilaterally on a live shared
// checkout.
//
// Once cutover happens, QUARTET_LANE_STATE_ROOT points at a literal out-of-repo base,
// e.g. `%LOCALAPPDATA%\Nexus\quartet-runtime` (Windows) or
// `~/.local/state/nexus-quartet` (POSIX) — every lane's _state directory becomes
// `<root>/<lane>/_state`, entirely outside any git working tree.
//
// @param {string} lane - the lane id (e.g. "pr-cleanup", "cosmo-improvements").
// @param {{ repoRoot?: string }} [opts] - repoRoot overrides `process.cwd()`; used by
//   tests to point at a disposable fixture repo instead of the real Nexus checkout.
// @returns {string} the lane's _state directory (no trailing slash).
export function laneStateDir(lane, { repoRoot = process.cwd() } = {}) {
  const root = process.env.QUARTET_LANE_STATE_ROOT;
  if (root) return `${root.replace(/[\\/]+$/, '')}/${lane}/_state`;
  return `${repoRoot.replace(/[\\/]+$/, '')}/_quartet/working/lanes/${lane}/_state`;
}
