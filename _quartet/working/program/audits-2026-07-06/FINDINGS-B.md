# FINDINGS-B — Nexus / ZDX / Cosmo / Quartet system audit

Auditor: fable:audit-system (Lancre, nexus repo). Brief: `BRIEF-B-system.md`. Status: **COMPLETE — 2026-07-06.** 40 findings across 7 dimensions; top-10 ranked; known-work shortlist for the track-6 hand-back; cross-checked vs the 62-item draft audit + day-2 pilot doc.

Finding shape: `{dimension, severity P0–P3, what, evidence, proposed fix, effort S/M/L, Cosmo-grain, survives-triage confidence}`. Pain-point anchors: **P-role** (role accountability) · **P-clacks** (clacks reliability) · **P-reviewer** (reviewer invisibility) · **P-codex** (Codex/token economics).

Evidence base: zdx-backlog-audit-2026-07-05/AUDIT.md (62 items) · codex-pilot-2026-07-05/observations.md + codex-pilot-shepherd-findings.md · retro-2026-07-05/CONSOLIDATED.md + DECISION-PACK.md + pm-fable.md · unquiesce-plan-2026-07-06.md · precedent-register.md · nexus `_quartet/audit.md` (2026-06-29) + `_quartet/findings.md` · `WI-1263-substrate-v1` branch files · seven dimension reader reports.

---

## D3 — Clacks / substrate (WI-1263)

**Verdict on the core design: sound.** Minimal stdlib client, append-only grant + RLS, per-(lane,kind,author) cursors, server-side `created_at` (kills the pilot's timestamp-skew friction #3), UTC parse bug already fixed (`c0c0afd`). Selftest passed from Lancre this session — cross-machine acceptance datapoint for unquiesce track 1. The problems are in what surrounds it: the wake mechanism, the v2 enforcement path, and an over-broad "retire the watchers" premise.

### B-01 · Realtime is published but nothing consumes it — the event-driven-wake premise is unimplemented
- **{D3, P1, P-codex + P-clacks}**
- **What:** `0001_events.sql:27` adds `quartet_events` to `supabase_realtime`, but the blessed client's `watch` is a poll loop (`clacks.py:129-137`, default 60s) and no Realtime subscriber exists anywhere. The substrate's headline justifications — waking an attended-only Codex shepherd (pilot's dominant finding) and replacing fixed-cadence polling burn (retro H2: ~9h pure heartbeat overhead on one lane; 65% of a Max-20x day for ~12 closes) — both depend on push, not poll. As shipped, the substrate changes the *transport* but keeps the *polling economics*.
- **Evidence:** `_quartet/substrate/0001_events.sql:26-27`; `clacks.py:129-137`; unquiesce-plan §5 ("external wake mechanism (substrate Realtime candidate) vs attended-only staffing" — undecided); observations.md 2026-07-06 incident (8h freeze, root cause 1).
- **Fix:** a small always-on subscriber per host (websocket to Supabase Realtime; on insert for lane X → wake/launch the bound session per OS: tmux `claude --resume` path per OPQ-14 ruling; for Codex, a scheduler that launches `codex exec` with a fresh prompt). Note the fleet-wide veto on headless `claude -p` (precedent register 2026-07-05) constrains the wake action to interactive-resume shapes.
- **Effort:** M. **Cosmo-grain:** one WI (WI-1263 v1.1 "substrate wake subscriber"), pairs with the harvest-queue capture "Codex shepherd liveness contract". **Confidence:** high.

### B-02 · v2 RLS reviewer write-only policy will break `clacks heartbeat` for reviewers
- **{D3, P2, P-reviewer}**
- **What:** `0002_rls_v2.sql` denies reviewers SELECT (`quartet_read_non_reviewer`) while pinning them to `kind='heartbeat'` inserts. But `clacks.py:48` sends `Prefer: return=representation` on every insert — under PostgREST + RLS, returning the inserted row requires the row to pass a SELECT policy. A reviewer heartbeat under v2 gets an error/empty return; `cmd_send` then either crashes or misreports. The exact role the v2 upgrade exists to serve (reviewer one-way sign-of-life, the WI-1645 fix) is the role the policy breaks. Caught on paper before v2 is applied — cheap now, an incident later.
- **Evidence:** `0002_rls_v2.sql:17-29`; `clacks.py:44-54,88-91`.
- **Fix:** `Prefer: return=minimal` for heartbeat sends (or all sends; print local confirmation instead), or add a narrow `SELECT ... USING (author = jwt role)` own-rows policy for reviewers. One-line client change; test with a reviewer-role JWT before v2 rollout.
- **Effort:** S. **Cosmo-grain:** fold into the v2-enforcement WI. **Confidence:** high (medium only on exact PostgREST failure mode — error vs silent empty; either way the client mishandles it).

### B-03 · "Retire the hand-rolled watchers" over-promises: most of the watcher estate is NOT substrate-replaceable
- **{D3, P1, P-clacks}**
- **What:** the reader inventory found 15 distinct mechanisms. The substrate's six primitives subsume only the inter-agent messaging slice: file mailbox watchers (subsumed), L0 heartbeat-writer (subsumed if schema carries `window_resets_at`/`relaunch_command` — it currently does NOT), L1 deadline check (partially — `expected_activity_by` manifests have no substrate home). **Not covered and must survive:** Cosmo Stage polling (`orch-stage-monitor.sh`, `review-watcher.ts` trigger half, per-lane `cosmo-stage-watch.mjs`), the Notion Workstream lease (`lease.ts` — a distributed-lock state machine, not a liveness heartbeat), the supervisor watchdog pair (OS-level relaunch execution), review-agent spawn/process management (`review-watcher.ts:239-263`), L2 claim-TTL/orphan sweeps (pure Cosmo predicates). Unquiesce track 3's "Retire hand-rolled watchers → `clacks watch` as the one sanctioned feed" is wrong as written; executing it naively would tear down the quality gate and liveness layers.
- **Evidence:** d3 reader retirement map (items #2,#3,#4,#6,#7,#10-13); unquiesce-plan §3 bullet 3; `heartbeat-writer.ts` schema vs `clacks.py:94-100` heartbeat body.
- **Fix:** write an explicit retirement map into the WI-1263 rollout plan: (a) migrate mailboxes + heartbeats + decision log to substrate; (b) keep the Cosmo-polling, lease, watchdog, and review-spawn layers, re-pointed to read/write substrate where they touch comms; (c) preserve the two-layer liveness shape (event feed + independent scheduled deadline check — `library/liveness-checker.md:9` names why). Extend the `heartbeat` body contract with the L0 fields so the watchdog can consume substrate instead of `heartbeat.json`.
- **Effort:** S (the map) + M (heartbeat-contract unification). **Cosmo-grain:** one design WI + one build WI. **Confidence:** high.

### B-04 · v1 shared anon key = spoofable author, and the v2 JWT path has no minting/distribution tooling
- **{D3, P2, P-reviewer + P-clacks}**
- **What:** v1 access is one shared key with `author` as convention (`0001_events.sql:20-24`); `alive --author-prefix reviewer:` (the planned orchestrator probe) trusts a spoofable string. v2 fixes this but requires per-role JWTs "minted with a `quartet_role` claim ... distributed via estate secrets machinery" (`0002_rls_v2.sql:2-4`) — no minting script, rotation story, or Infisical folder layout exists. Single-writer-as-policy (the WI-1645 class closure) is therefore unscheduled in practice.
- **Evidence:** files cited; unquiesce-plan §1 ("v2 enforcement — scheduled, not now") with no tooling item anywhere.
- **Fix:** small WI: JWT mint script (project JWT secret → role tokens), Infisical `/quartet/roles/*` layout, rotation note, then apply 0002 (with B-02 fixed first).
- **Effort:** M. **Cosmo-grain:** one WI. **Confidence:** high.

### B-05 · Substrate drops the envelope discipline the file channel had
- **{D3, P2, P-clacks}**
- **What:** the file channel enforces a typed envelope (outbox `level` ∈ 4 values, inbox `type` ∈ 4 values, `ref` threading; `validate-channel-envelope.js`). `quartet_events.body` is freeform jsonb — no level/type/ref contract, no validator. The pilot's working handshakes (F35 land handshake, ref-threaded directives) rely on exactly this structure; migrating lanes to `clacks send` without porting the envelope regresses WI-1230 (channel schema enforcement, Backlog) and makes machine consumption (escalation watchers keying on `level`) undefined.
- **Evidence:** `clacks-channel.md:29-67`; `0001_events.sql:8` (kind check only); `clacks.py:64-69` (`_body_arg` accepts anything).
- **Fix:** define `body` envelope contract per kind in the substrate README (outbox-level/inbox-type/ref fields carried inside body), add a client-side validation (cheap) or DB CHECK on `body ? 'level'` etc.; port `validate-channel-envelope.js` semantics.
- **Effort:** S. **Cosmo-grain:** fold into lane-migration WI (track 3 bullet 1). **Confidence:** high.

### B-06 · Load-bearing channel doc is stale against git reality — second silent drift on the same paragraph
- **{D3, P2, P-clacks}**
- **What:** `clacks-channel.md:76-89` still says channel files are "untracked-but-NOT-gitignored" and that the WI-1245 cutover "is not yet live." Live `.gitignore:161-166` (WI-1586, 2026-07-04) DOES gitignore `_state/*.jsonl|*.json` with `monitor-manifest.json` negated back. This same paragraph was already flagged stale once (`artifact-disposition.md:155-171`, against the earlier WI-1199 state) and never fixed. Agents booting off this doc mis-model the hazard class that caused R3/R4/R11.
- **Evidence:** cited lines; d3 reader read `.gitignore` directly.
- **Fix:** update the doc paragraph; add a freshness assertion (grep the cited gitignore lines in a CI/hook check) so a third drift can't be silent. Fold into the WI-1245 finalize (its runbook already owns this file).
- **Effort:** S. **Cosmo-grain:** rider on WI-1245. **Confidence:** high.

### B-07 · The review quality gate itself is unsupervised: `review-watcher.ts` writes no L0 heartbeat
- **{D3, P2, P-reviewer + P-clacks}**
- **What:** `review-watcher.ts` is a `while(true)` poll loop (449-456) holding the workstream lease, spawning review agents — and never writes `heartbeat.json` (grepped: absent), so the WI-1563/WI-1618 supervisor watchdog cannot detect or relaunch it. A dead review-watcher silently freezes every Reviewing transition in its workstreams — the exact "reviewer invisibility" pain at the process level.
- **Evidence:** d3 reader grep; `heartbeat-contract.md` scope vs `review-watcher.ts`.
- **Fix:** fold heartbeat-writing into the watcher's poll tick (it already has an interval), register its heartbeat file with the watchdog args.
- **Effort:** S. **Cosmo-grain:** one WI. **Confidence:** high.

### B-08 · Smaller substrate/liveness gaps (bundled)
- **{D3, P3}**
- (a) **Same-machine same-role cursor theft:** seen-state keyed (lane, kind, author) in `~/.quartet/clacks-seen.json` (`clacks.py:72-74,28`) — duplicate-shepherd occupancy (retro R10) means two sessions share one cursor. Fix: optional session-id component or documented singleton-per-role-per-machine rule. S.
- (b) **`alive` scans last 25 heartbeats per lane** (`clacks.py:140-141`) — a chatty lane with several authors can push the probed author out of the window → false-negative liveness. Fix: filter by author server-side (`author=like.` param). S.
- (c) **No ack/read-receipt kind** — kind CHECK pins message|heartbeat|decision (`0001_events.sql:8`); pilot friction #4 (silence ambiguous). Decide convention (`body.type='ack'` inside message) rather than schema change. S.
- (d) **No retention/compaction policy** for an append-only forever table. Note a policy (e.g. archive lanes closed >90d) in README. S.
- (e) **macOS watchdog port unvalidated on a live consumer host** — `supervisor-watchdog.sh:23-28`, `register-supervisor-watchdog-launchd.sh:9-12`; **confirms existing WI-1621** (AUDIT.md: KEEP, pairs 1614) rather than new work.
- (f) **`.perID-seen.json` de-dupe contract referenced but never specified** (`clacks-channel.md:78`; WI-1245 runbook:21) — migration can't verify preserved semantics. Document before lane migration. S.
- (g) **L1 liveness checker never demonstrated live** (`library/liveness-checker.md:68-82` admits retroactive-walkthrough only) — pairs with the pilot's ORION liveness failure; verification pass, not code. S.
- **Confidence:** high on each individually; none top-10 alone.

---

## D4 — Reviewer independence vs observability (WI-1645)

**Verdict: the independence model is coherent and worth keeping; the invisibility is a designed-in omission, not a trade-off anyone chose.** The liveness architecture literally has no layer for the reviewer: `library/liveness-checker.md:19-28` defines exactly L1 (orchestrator↔shepherd, reads outbox.jsonl — which the reviewer is barred from writing) and L2 (shepherd↔executor, claim-TTL). The L0 heartbeat contract's role enum is `orchestrator | shepherd | program-manager` (`heartbeat-contract.md:51`) — reviewer excluded from the one mechanism purpose-built for this.

### B-09 · No liveness layer exists for the reviewer; the kickoff's only sign-of-life instruction is "print"
- **{D4, P1, P-reviewer}**
- **What:** WI-1645 was caused by omission, not contradiction: `reviewer-kickoff-template.md:35` says "print" the boot confirmation (machine-invisible in an interactive session); independence rules bar the only channel the reviewer knows (Clacks), so the session improvised into the shepherd's outbox — breaching single-writer AND risking schema pollution of the orchestrator's parse of `level`-enum lines. There is no mechanized way for an orchestrator to answer "is the reviewer alive": live proof in-repo is `working/lanes/quartet-mvp/_state/monitor-manifest.json:102` (orchestrator can't re-arm a stage monitor because it can't determine reviewer status without a human).
- **Evidence:** `reviewer-protocol.md:8-9,22-29`; `clacks-channel.md:11-18`; `liveness-checker.md:19-28`; `l1-liveness-check.js:43-65`; `heartbeat-contract.md:51`; kickoff:35.
- **Fix (design, converges with substrate v2):** an L1-analog third liveness layer — reviewer writes a heartbeat only (substrate `clacks heartbeat <lane>` under `reviewer:*` identity with v2 RLS: write-only, kind pinned to heartbeat — `0002_rls_v2.sql:19-29` already drafts exactly this); orchestrator probes `clacks alive --author-prefix reviewer:`. Rules to carry: heartbeat schema-disjoint from outbox envelope; probe must stay a pure liveness read (no disposition/WI info flowing back — independence preserved); reviewer never lists the shared `_state/` dir. Update the "Two layers, one shape" table to three layers, and extend the L0 role enum. Fix B-02 first or the reviewer heartbeat fails at the client layer.
- **Effort:** M total (S for kickoff+protocol text, S for probe, S for docs). **Cosmo-grain:** the unquiesce §4 capture-WI, properly scoped by this finding. **Confidence:** high — unanimously evidenced, already operator-ratified direction.

### B-10 · "The reviewer" is two different implementations with different observability, and canon doesn't say which is canonical
- **{D4, P2, P-reviewer}**
- **What:** reviewer-protocol.md:57-65 describes an interactive LLM session running the poll loop in first person; reviewer-protocol.md:51-55/WI-1417 also names the standing `review-watcher.ts` script (poll + spawn ephemeral `codex exec` review agents). Two mechanisms, different liveness surfaces — the script already writes a timestamped poll-line every cycle (`review-watcher.ts:97-101,404-419`) that no liveness check consumes; the interactive session writes nothing. Also: the spawned review agent runs `-s danger-full-access` with read-only enforced by prose only (`review-watcher.ts:231-238` — flagged in-repo as contradicting "enforce read-only structurally"), which is WI-1159's exact subject.
- **Evidence:** cited lines.
- **Fix:** one clarifying paragraph in reviewer-protocol.md pinning the canonical shape (or the migration between them); interim cheap liveness = probe the watcher log cadence where the script IS the reviewer. Confirms WI-1159 (read-only sandbox) as first-wave-worthy — agrees with AUDIT.md's FIRST-WAVE call.
- **Effort:** S. **Cosmo-grain:** doc rider + existing WI-1159. **Confidence:** high.

### B-11 · WI-1645 has zero footprint in the tracked repo
- **{D4, P3, P-reviewer}** — `rg "WI-1645"` returns nothing in nexus; the motivating incident for the reviewer-liveness fix isn't cited where the fix must land (protocol/kickoff/clacks docs), unlike the L1/L2 docs which narrate their motivating incidents (`liveness-checker.md:9-17`). Cite it when the fix lands. Effort S. Confidence high.

---

## D7 — Nexus architecture

**Verdict: the control-plane model and secrets architecture are sound and ADR-backed; the weak spots are exactly where practice outran governance — the shared-checkout rule is folklore while a sibling ADR already rejected that model, and per-machine state (workspace files, snapshot, in-flight Linux port) is drifting untracked.**

### B-12 · The shared-checkout model of the root repo is folklore that a ratified sibling ADR already rejects
- **{D7, P2, P-role (accountability of state)}**
- **What:** the `~/nexus` shared-tree rule (branch for non-trivial work) lives only in AGENTS.md:219-225 (WI-483) — zero ADR backing (`rg WI-483 docs/adr zdx/adr` = 0 hits). Meanwhile ZDX-ADR-0012 (I3/I4 + Alternatives-Considered #1, lines 90-124, 201-203) formally rejects shared working-trees for Quartet working-state because "concurrent sessions on one tree cannot bound what each commit captures" — the exact R3/R4/R11 + `_quartet/findings.md` F5 (29-file accidental stage) failure class. The root checkout — where every fleet session operates — runs on the rejected model; only the Quartet subsystem graduated.
- **Evidence:** cited; retro H5 verdict (SUPPORTED; 3 clobber incidents); eduagent worktree-per-WI KEEP (retro §6).
- **Fix:** thin NEX-ADR codifying branch-or-worktree for the root checkout (cite ZDX-ADR-0012 precedent), or an explicit scope-note why the general checkout stays shared-tree. Given Lancre is about to host multi-agent execution (unquiesce §8), ruling this before that workload lands is cheap; after, expensive.
- **Effort:** S (ADR) — behavioral change already mostly practiced. **Cosmo-grain:** one WI. **Confidence:** high.

### B-13 · Live secrets-machinery drift on this machine: the Linux port of `nexus_infisical.sh` exists only as an uncommitted diff
- **{D7, P2}**
- **What:** scripts/nexus_infisical.sh carries an uncommitted 0.2.0→0.2.1 diff adding the Linux/headless path — the exact gap NEX-ADR-0011 "Open points" (113-116) deferred ("hard-guards Darwin... follow-on ADR or amendment"), with docs/governance/secrets.md:45 still saying "Linux port is pending." The fix that Lancre's whole secrets bootstrap (and this audit's own substrate access) depends on is one `git checkout --` away from vanishing, and the ADR/spec are silently stale. Companion uncommitted: .gitattributes, docs/secret-zero-bootstrap.md. (Also stray untracked `.neon` org-pointer at repo root.)
- **Evidence:** git status/diff observed this session; NEX-ADR-0011:113-116.
- **Fix:** land the script + lockstep doc/ADR amendment (the WI-1639 Lancre-setup item is the natural home — it's already an unquiesce §8 checkbox).
- **Effort:** S. **Cosmo-grain:** fold into WI-1639. **Confidence:** high.

### B-14 · Per-machine workspace files: Lancre's is untracked; Ramtop's and Surface's disagree silently
- **{D7, P3}**
- **What:** AGENTS.md names the workspace file as "the authoritative, always-current list" of checkouts, but nexus-lancre.code-workspace is untracked (`??`, hand-copied from Ramtop's), and the two tracked files disagree on folder membership (Ramtop lists newco/command-centre/omni/arscontexta; Surface alone lists archon) with nothing marking variance-vs-staleness. A "authoritative" convention that isn't in git isn't authoritative.
- **Fix:** commit Lancre's (verified against actual checkouts); one-line convention for deliberate per-machine variance. Effort XS-S. **Confidence:** high.

### B-15 · Cross-machine canon propagation has no version-skew mechanism — the PM's H4 framing is an architecture gap, not just a process note
- **{D7, P2, P-clacks adjacent}**
- **What:** canon/skills/ADRs propagate by independent `git pull` per machine; plugins by a cache with known staleness bug class (OPQ-17); nothing enforces or even *signals* that Ramtop/Surface/Lancre run the same governance at a given moment. The retro's H4 disagreement (shepherds: "tool regressions"; PM: "the absorption model is the defect — releases must be fleet events at respawn boundaries") resolves in favor of BOTH, and the fix candidate #16 (releases only at respawn boundaries) has no mechanism to hang on: there is no fleet-wide "what version is this machine running" signal. The only version-compare that exists anywhere is the secrets helper's self-check (NEX-ADR-0011 §4). Note the substrate gives a natural cheap carrier: a `canon_version` field in heartbeat bodies would make skew observable fleet-wide.
- **Evidence:** d7 reader sweep; retro §5 H4 flag + fix #16; pm-fable §5.
- **Fix:** minimal: stamp repo HEAD + plugin version into L0/substrate heartbeats; respawn-boundary release rule as canon (DECISION-PACK ruling 3 already pends). Full propagation engine is WI-448 (Parked) — do NOT resurrect it wholesale; the skew *signal* is the S-sized 80%.
- **Effort:** S (signal) / M (canon+rollout discipline). **Cosmo-grain:** one WI + canon line. **Confidence:** high.

### B-16 · First-run snapshot absence is unspecified (minor)
- **{D7, P3}** — session protocol covers cosmo-sync exit-3 staleness but not zero-state (fresh machine, no `plans/progress-snapshot.md` at all — Lancre today). One sentence in AGENTS.md. Effort XS. Confidence high.

---

## D1 — Cosmo/ZDX data model + lifecycle completeness

**Verdict: the bottom-up model is well-designed and unusually self-aware (several holes are self-admitted in lifecycle.md), but its integrity layer — the Validity formula and the non-deviable conformance rules — has drifted from the schema it guards, and the two worst live incident classes of the week (stage-less orphans, immortal zombie claims) are directly derivable from formula holes.** All lifecycle verbs are still spec-only (`capabilities.md:223-239`: only Archon `execute-workitem` exists) — the /cosmo:* tools in production are the marketplace implementations, so standard-vs-tool drift is a standing risk (see D6).

### B-17 · Validity formula misses the two incident classes that actually occurred: stage-less orphans and null-`Claimed At` zombies
- **{D1, P1}**
- **What:** (a) Validity tests only specific Stage literals with no `empty(Stage)` clause (`lifecycle.md:667-694`), so a raw API create with no Stage/State (WI-1600) evaluates "✓ Valid". (b) `Claim Expires` is a formula on `Claimed At`; a claim with `Claimed By` set but `Claimed At` null yields null expiry — the sweep reap (`Claim Expires < now`, `lifecycle.md:744-747`) never matches and Validity clause 3 checks only `empty(Claimed By)`. Executing zombies that can never be reaped (the WI-1312 class; the pilot's WI-1405 freeze had `Claim Expires = none` as root cause 3).
- **Evidence:** cited lines; AUDIT.md F-C (WI-1600); observations.md incident root causes.
- **Fix:** two Validity clauses (`empty(Stage) → ❌`; `Executing and empty(Claimed At) → ❌`) + sweep also reaps Claimed-By-set/expiry-empty; capture path sets Stage non-bypassably. This is the substance of WI-1332 (stage-less orphan guard) + WI-1312 (zombie-Executing guard) — both KEEP in AUDIT.md; this audit says **promote both into the first wave**: they're S-effort formula edits that close incident classes with three live exhibits each.
- **Effort:** S. **Cosmo-grain:** existing WI-1332 + WI-1312 (bundle WP-1518 head). **Confidence:** high.

### B-18 · Two frozen non-deviable conformance rules are wrong against their own schema
- **{D1, P1}**
- **What:** `schema.execution-path-values` (conformance.md:157, rule-index.md:30) lists Auto/Manual/Unset — omitting `Assisted`, which schema.md:373-378 defines and the pilot actively used (WI-1407 refined to Assisted path). `schema.stage-values` (conformance.md:155) says "8 Stage values" while schema.md:338 + lifecycle.md:50 define 9 (incl. In Review) — and conformance.md contradicts itself at :274 ("9 Stages… In Review"). A conformance audit run as written would flag valid data as drift; agents grounding on the glossary (CONTEXT.md:22-23, 8 values) mis-model the machine.
- **Evidence:** cited. **Fix:** normalize all four surfaces to the schema (9 stages, 4 exec-path values); add a consistency check to the manifest regen. **Effort:** S. **Cosmo-grain:** one WI. **Confidence:** high.

### B-19 · Completion-summary replace-vs-append is undefined in the standard — the re-bounce class is a spec hole, not just the fixed tool bug
- **{D1, P2}**
- **What:** the standard validates only that a `## Completion Summary` heading + 3 subsections EXIST (`lifecycle.md:304-350`); rework bounces stack summaries with no "current" marker or replace rule. WI-1243/commit 10aadb7 fixed the *tool* to replace-on-re-complete, but the *standard* still doesn't say that's the contract — the next implementation (or Archon workflow) can lawfully regress it.
- **Evidence:** lifecycle.md:304-350, 388-392; AUDIT.md WI-1296 note.
- **Fix:** one standard sentence (latest replaces; validators validate the current one) — lockstep with the shipped tool behavior. **Effort:** S. **Cosmo-grain:** doc rider. **Confidence:** high.

### B-20 · No durable executor/reviewer-of-record; the review-leg identity ADR is reserved-but-unwritten
- **{D1, P2, P-role + P-reviewer}**
- **What:** claims clear at Reviewing; reviewer identity survives only in a comment; there is no `Reviewed By/At` and executor identity is being bolted on now (WI-1635, Executed-By, half-done). ZDX-ADR-0011 (review-leg ownership/identity/observability) is reserved/forthcoming (`adr/README.md:24`), with ADR-0013 explicitly deferring to it. Role accountability (pain 1) has no durable data-model substrate: after close, nobody can query who executed or who reviewed.
- **Evidence:** schema.md:104-108; lifecycle.md:98-102, 314; adr/README.md:24.
- **Fix:** land WI-1635 (already first-wave in AUDIT.md — agree), add `Reviewed By/At` in the same schema pass, and author ZDX-ADR-0011 as the charter work's data-model counterpart (unquiesce track 2 gates ZDX new-build on charters; the ADR is the missing third leg).
- **Effort:** M. **Cosmo-grain:** WI-1635 + one new WI (Reviewed-By) + ADR authoring. **Confidence:** high.

### B-21 · Top-down lifecycle: the nouns are provisioned, every verb is missing, and PRDs are not clause-addressable
- **{D1, P1 — the track-10 strategic gap}**
- **What:** Programs DB, Initiatives DB (Level ∈ Initiative/Epic/Story), realized-by edge, Effort all exist (schema.md:181-268). What doesn't: `/cosmo:decompose` (Future tier, capabilities.md:211; top-down "explicitly out of scope v1.0" :43-48), coverage tracing (impossible today — PRD lives as unstructured Initiative page body with NO clause anchors), re-decomposition, Story DoR ("reserved", definition-of-ready.md:183-193), any doc governing Initiative Status transitions. ADR-0010 self-describes as "Pre-MVP living document, not under change control."
- **Evidence:** cited; prior art trail: WI-590/835/838/839/840 (nouns landed via 838/839; verb-side threads Captured and stalled since ~June).
- **Fix (minimal viable, in order):** (1) planning-lifecycle doc — Initiative Status transitions + Story DoR (S); (2) PRD clause-addressability convention — stable anchor IDs in Initiative body (S, unblocks tracing); (3) `/cosmo:decompose` + `/cosmo:coverage` capabilities spec'd to the same standard shape as the bottom-up verbs (M-L build). Design **with** track 9's Audit-A deliverable as the first ingestion artifact (unquiesce §10 already says this). No new DBs needed — the schema is ready; this is verbs + anchors + one doc.
- **Effort:** L overall, but (1)+(2) are S each and unblock the rest. **Cosmo-grain:** an Epic (Initiative-level), decomposed: 2 S-docs + 1 spec WI + build WIs. **Confidence:** high (gap admitted by the standard itself).

### B-22 · Cross-DB Project-homing is unenforced — the capture-time mis-homing class
- **{D1, P2}** — Workstreams/Sprints are Project-scoped but nothing enforces WI.Project == Workstream.Project (schema.md:53, 95-96); the pilot logged 3 instances in one day of cross-lane items landing in WS-44 via capture-inheritance (observations.md, WI-1650/1651/1652 routing note). Fix: Validity/audit clause comparing Project through the Workstream relation. Effort M (formula reach-through may need the sweep instead). Cosmo-grain: one WI; the pilot's "watch for a 4th instance" threshold is met by the formula being impossible — capture it now. Confidence: medium-high.

### B-23 · Bundled D1 P3s
- (a) In Review has no Validity clause/Workflow-Status branch; Reviewing has no claim-cleared clause and no TTL (self-admitted, lifecycle.md:724-729, 718-722) — fold into the B-17 formula pass. S.
- (b) Planning-layer "provisioned?" self-contradiction (schema.md:45 vs :54) + Programs DB missing from the topology table (:48-54). S.
- (c) manifest.json (0.2.1) behind config.md (0.2.2) despite README's "package never behind its parts" promise; rule-index/capability-map hand-maintained. Fix: regen tooling with named owner. S.
- (d) Per-project claim-expiry override requires manual Notion formula regen; config-vs-formula divergence unaudited (lifecycle.md:270-279). S.

---

## D5 — Codex / token economics

**Verdict: the pilot proved Codex-hosted shepherding produces top-tier quality (3 unassisted top-bar refines, honest escalations, protocol conformance) — the economics case is real. But the runtime binding has absorbed none of the seven pilot findings, canon actively over-promises Notion resilience inside the exec sandbox, and the token-burn fix everyone agrees on (adaptive cadence + event-driven wake) remains unbuilt on both the Claude and Codex sides.**

### B-24 · The Codex binding is silent on every one of the seven pilot findings — attended-only above all
- **{D5, P1, P-codex}**
- **What:** `codex.md`/`codex.json` define four primitives and pass a deliberately-static smoke test (`smoke_codex_runtime_binding.py:1-7`); none of: attended-only compensation, lifecycle-I/O centralization, native-shell worktrees (WI-1646), exec-timeout reconciliation (WI-1648), status-turns-non-pausing, F35 narrow gate, pipelined refinement appear in it. The attended-only property caused the 8h09m freeze — the pilot's headline finding — and the binding's role notes *permit* Codex shepherds without naming it.
- **Evidence:** codex.md:26,31-37; codex.json:15-29; observations.md:126-153, 267-270.
- **Fix:** one binding revision folding all seven (S-M, mostly writing); the attended-only section must present the real fork: external wake mechanism (= B-01's substrate subscriber; note `claude -p` veto constrains design) **or** policy-restrict Codex shepherds to attended windows. Harvest-queue capture "Codex shepherd liveness contract" is the right WI — create it.
- **Effort:** M. **Cosmo-grain:** one WI (binding revision) + B-01's wake WI. **Confidence:** high.

### B-25 · Canon's "MCP loss is degraded mode, never a stoppage" guarantee is false inside `codex exec` — and the binding doesn't disclose it
- **{D5, P2, P-codex}**
- **What:** `dependencies.md:33-47` promises an MCP→CLI→REST fallback ladder; WI-1647's evidence shows ALL Notion paths dead inside the exec sandbox (egress to a discard-port proxy). Executors dispatched via the binding's own `dispatchExecutor` primitive can never touch Cosmo — undisclosed in codex.md. The pilot's lifecycle writes worked only because they ran in the attended interactive session.
- **Evidence:** observations.md:97-103, 154-157; dependencies.md:39-47.
- **Fix:** scope the ladder's guarantee to non-sandboxed runtimes; add the constraint + the centralize-lifecycle-I/O-in-shepherd-shell rule to codex.md (the shepherd already practices it). Effort S (docs); the sandbox-egress fix itself is upstream/unscoped (WI-1647 stays the tracker).
- **Confidence:** high.

### B-26 · The agreed token-burn fix is tracked and unbuilt: WI-1602 adaptive cadence — and Codex structurally forces the expensive pattern
- **{D5, P1, P-codex}**
- **What:** every cadence in canon is fixed (heartbeat 2min, PM poll ≤20min, watchdog 10min, L1 margin 30min; d5 reader enumerated six). Canon itself states the doctrine — "event-driven wake beats a fast agent-poll at both latency AND cost" (program-manager-protocol.md:154-155) — while `codex.md:26` concedes Codex has no in-harness Monitor primitive, forcing poll-shaped burn on exactly the runtime chosen for cheapness. Retro H2's refined mechanism ("cadence, not lane count") and the ~9h heartbeat-overhead exhibit both point here. WI-1602 (Tier A in DECISION-PACK) is the named fix and hasn't shipped.
- **Evidence:** heartbeat-contract.md:18, 76-79, 104, 129-130; retro §2 H2; DECISION-PACK Tier A #4.
- **Fix:** ship WI-1602 (even a coarse two-tier active/idle cadence) + B-01's event-wake as the structural complement. Add per-lane token telemetry (retro fix #18, no WI yet) so the burn claim becomes measurable — capture that WI.
- **Effort:** M. **Cosmo-grain:** WI-1602 + one new telemetry WI. **Confidence:** high.

### B-27 · Codexifiability sequence (assessment, feeds the roadmap)
- **{D5, P2, P-codex}** — Safe now: reviewer/auditor (sanctioned default, Clacks-blind, independence satisfied) and bounded executors in dedicated worktrees on macOS/Linux (agnosticity spike proved; WI-1646 gates Windows). Blocked: Codex shepherd (until wake mechanism or attended-only policy), Codex orchestrator (same + continuous Cosmo reads), anything needing lifecycle writes from inside `codex exec` (WI-1647). Where Claude burn is worst per retro: orchestrator sweeps + idle-lane heartbeats — i.e. the next Codexification win is NOT another interactive role, it's moving *monitor/poll duties* off agent turns entirely (scripts + substrate wake), which de-burns Claude without needing Codex to host a self-driving role at all. **Confidence:** high.

### B-28 · Bundled D5 smaller items
- (a) Binding smoke test is structural-only; "smoke passes" overstates validation — note in codex.md pointing at observations.md as the empirical record until findings fold in. S.
- (b) F35 narrow-gate wording: verify WI-1585 (Closed) actually landed the "build/PR continues; only `complete` waits" checklist; if not, capture the amendment. S.
- (c) Roster/docs never state which runtime hosts orchestrator/PM in live lanes — add to the role-runtime matrix in README. S.

---

## D6 — Tooling debt (zdx-marketplace)

**Verdict: the repo that ships every lifecycle tool has real tests (644 passing) and a working CI job — but nothing makes either matter: main is unprotected, the plugin cache pins stale versions silently (reproduced live during this audit), and the two validator false-positive classes from the retro reproduce today with no negative tests guarding them.**

### B-29 · Marketplace main has zero required status checks — CI exists but is advisory
- **{D6, P1}**
- **What:** `gh api .../branches/main/protection` → 404 "Branch not protected". A real lint+test CI job exists and passes on recent PRs, but a red or absent run cannot block a merge. Also ubuntu-only: every Windows-specific branch (judge.ts CLI path, .ps1 helpers) is tested by platform-string injection, never on a windows-latest runner — the "--dedup unrunnable on Windows" class ships blind by construction.
- **Evidence:** d6 reader gh probe; .github/workflows/ci.yml:1-24; judge.test.ts:130-138.
- **Fix:** (1) branch protection requiring the existing `test`+`lint` jobs — minutes, repo-settings only, needs org admin; (2) windows-latest matrix leg for judge.ts + .ps1 (M). **Confirms WI-1264 and its AUDIT.md P1-bump; this audit adds: the protection half is a zero-code operator action that should not wait for the WI to dispatch.**
- **Effort:** XS (protection) + M (matrix). **Cosmo-grain:** WI-1264. **Confidence:** high.

### B-30 · OPQ-17 reproduced live: this audit's own marketplace checkout is 8 commits behind with a currently-broken `--dedup`
- **{D6, P1, P-clacks adjacent (absorption model)}**
- **What:** `_tools/ZDX-marketplace` HEAD sits 8 commits behind origin/main; among the missing: c52285e (WI-1634) removing the invalid `--ask-for-approval never` flag — so this checkout's dedup judge is broken *right now*, with zero local signal (`git status` shows nothing until an explicit fetch). Same shape as the fleet incident (cache pinned at 0.6.32 while main was 0.6.40+, "all merged lifecycle fixes runtime-inert"). Cache ≠ clone: refresh requires pull **and** plugin reload; the reload itself has known collateral (touches `_state` mtimes; degraded-session recovery, retro R15/WS-28).
- **Evidence:** d6 reader live git evidence; relaunch-2026-07-05/README.md:16-20.
- **Fix:** short-term: a preflight in the /cosmo:* family — compare loaded plugin version vs marketplace latest, warn loudly (S). Structural: this is B-15's version-skew signal + the DECISION-PACK ruling-3 respawn-boundary policy; the harness-side cache invalidation is an upstream ask. Hand-back step 0 (plugin refresh on every host) is *necessary but one-shot* — without the preflight it decays immediately.
- **Effort:** S (preflight) / M (structural). **Cosmo-grain:** one WI + fold into B-15's. **Confidence:** high.

### B-31 · Both `complete --validate` trip-wire false-positive classes reproduce today, with no negative tests
- **{D6, P2}**
- **What:** live repro by the reader: `extractCommits("See https://github.com/o/r/commit/3b308dd for the diff.", {allowBare:true})` → flags the SHA inside a legitimate URL (cross-host corroborated in retro, 2 fleets); `extractTestClaim` fires on "Renamed the tests/ directory; the lint step passed cleanly afterward." — prose, not a test claim. Zero negative tests guard either shape; every existing test uses genuinely bare tokens.
- **Evidence:** claims.ts:43-96; execute.ts:296-360; CONSOLIDATED.md:41 (fix #8).
- **Fix:** subtract contextual-URL spans before the bare scan; tighten the test-claim fallback grammar; add the negative-test corpus. Maps to the retro fix #8 / WI-851-adjacent validator family — but note AUDIT.md routes WI-851 at the *reviewer clone harness*; the trip-wire fix is its own S-sized item — capture separately rather than riding WI-851.
- **Effort:** S. **Cosmo-grain:** one WI. **Confidence:** high (reproduced).

### B-32 · Version-bump discipline across 2-3 manifests is manual, acknowledged, and unchecked
- **{D6, P2}** — WI-1375 (commit 2be2cfa) explicitly declined an automated consistency check; combined with B-30 this is the standing invitation for skew. Fix: CI step failing when `plugins/<name>/**` changes without a bump in that plugin's applicable manifests. Effort S-M. Cosmo-grain: one WI. Confidence: high.

### B-33 · The `git add -A` sweep fix (WI-1601) is advisory-only — the guard never touches git
- **{D6, P2, P-clacks}** — sweep-guard.ts "never runs `git add` itself" (:69-70); enforcement depends on the SKILL.md procedure obeying it. The R4 hazard (four lanes' `_state` swept into spurious PRs) is fixed only for rule-following sessions. Fix: make the guard the only staging path in sweep mode (thin `git-add-scoped` wrapper). Effort M. Cosmo-grain: rider WI on WI-1601. Confidence: high.

### B-34 · The fleet-wide `claude -p` veto has a silent violation path in judge.ts
- **{D6, P2}** — `resolveJudgeProvider` falls back to `makeClaudeJudge` (`claude ... -p ... --output-format json`) whenever codex isn't on PATH (judge.ts:117-124) — the precedent register vetoes exactly this ("no watchdog/script/monitor may depend on it"). Any codex-less host silently runs the vetoed pattern (and on Max it just fails). Fix: fail loudly instead of falling back, or obtain an explicit exception ruling. Effort S. Cosmo-grain: one WI (pairs with the F-B verify on WI-1282/1284/1295 — if codex-default is sanctioned, the claude path should be an error, which also settles AUDIT.md's CLOSE? verdict on that trio). Confidence: high.

---

## D2 — Quartet role/protocol design

**Verdict: the role architecture is conceptually strong (typed executor surfaces, two-gate loop, escalation-by-authority-not-stakes, C1-C3 classifier), and the planned charter split is sound and high-value — no role today has a single place stating ACCOUNTABLE-FOR / MANDATE / MUST-ESCALATE. The queue muddle is not a cross-role hole: it lives inside one sentence of shepherd-protocol.md. And the liveness ladder is prose-complete but arming-incomplete — canon admits it in three places.**

### B-35 · The liveness ladder is designed but not armed — and canon self-admits it (the systemic finding behind the 8h freeze)
- **{D2, P1 (P0-adjacent), P-role + P-clacks}**
- **What:** L1 (orch→shepherd) has "a worked walkthrough, NOT a live-armed demonstration (open gap)" (`liveness-checker.md:68-82`); PM→orchestrator liveness likewise ("No live-armed demonstration," PM-protocol:373-377); the L0 watchdog is Windows-only with operator-run registration ("not auto-installed," `supervisor-watchdog-contract.md:11-13`) — so a non-Windows or unregistered host has ZERO process-death detection. Canon even forbids the pilot's exact rationalization ("silence is indistinguishable from quiet work — never read it as either," orch:275-276) but relies on unarmed enforcement — the orchestrator pre-rationalized anyway because no armed check forced the issue. Subsumes D3's B-08(g) and pairs with D4's B-09 (reviewer wholly outside the ladder).
- **Evidence:** cited; observations.md freeze root-cause 2; WI-1313 discipline existed unarmed.
- **Fix:** arming is the work, not design: (1) L1 armed on a live lane + recorded (the WI-1614-style drill); (2) watchdog registration becomes a bootstrap/relaunch-packet step, not operator-optional; (3) macOS port validated (WI-1621); (4) reviewer added to the ladder (B-09). Each slice is S; the value is doing all four at relaunch boundaries.
- **Effort:** S per slice. **Cosmo-grain:** existing WI-1614/1621/1236 + the §4 reviewer WI; one umbrella AC: "every relaunch packet arms every ladder layer." **Confidence:** high.

### B-36 · The queue muddle is one sentence: refine and pick-up are entangled in shepherd-protocol L52, and no WIP/flow policy exists at lane grain
- **{D2, P1, P-role — the pain-1 root}**
- **What:** "queue" is three grains — activation (orchestrator→PM, owned), backlog *health* (shepherd, owned: "the frontier is never the mandate," shep:43-52), and dispatch *trigger* + *concurrency* of Ready items (NO owner, NO policy). Shepherd L52 tells the shepherd to "flag it to the orchestrator... for a pick-up decision rather than letting it sit" — refine (shepherd's) and pick-up (punted up) in one sentence, so each role can believe the other owns the trigger. No doc states a concurrency/WIP policy at lane level (`planning-rules.md` §6.4 is program-altitude), so the default is serial — which is exactly why 5 Ready P3s sat while one item executed, and why the 2026-07-05 precedent-register ruling ("pipeline custodian, not dispatcher... empty Ready = refill signal," WI-1526) had to be issued by the operator mid-incident.
- **Evidence:** shepherd-protocol.md:28,43-52; planning-rules.md §6.4; redispatch-queue.md (orphans only, no first-dispatch backstop); precedent register 2026-07-05.
- **Fix:** charter-lines, not new machinery: dispatch trigger + WIP-limited parallel dispatch ("dispatch all non-colliding Ready items up to N") assigned to the **shepherd**, orchestrator retains gate/exception authority; disentangle L52; fold the WI-1526 duty spec into the shepherd charter (it's currently only in a Cosmo page + precedent register).
- **Effort:** S (text) once charters exist. **Cosmo-grain:** rides track-2 charter work + WI-1526 (AUDIT.md already has it FIRST-WAVE — agree). **Confidence:** high.

### B-37 · The charter split is validated — with a specific warning against over-thinning
- **{D2, P2, P-role}**
- **What:** per-doc analysis: orchestrator/shepherd ~40% accountability prose scattered across ~6 sections each; reviewer (75%) and PM (owns/does-not-own lists) are already nearly charter-shaped. The split directly dissolves pilot failures (a) and (b) as charter-lines. One caution: the incident-scar one-liners ("never read silence as either," "the frontier is never the mandate," "never patch a guard") are anti-rationalization accountability, NOT mechanics — charters must keep them with their motivating WI citations; only procedure moves to protocols.
- **Evidence:** d2 reader per-doc split estimates; unquiesce §2.
- **Fix:** proceed as planned (track 2); charter = accountability spine + C1-C3 + escalation triggers + scar lines; protocol = checklists, schemas, boot sequences. **Effort:** M (drafting exists as track-2 commitment). **Confidence:** high.

### B-38 · Three missing one-line invariants, each the root of a pilot throughput failure
- **{D2, P2, P-role + P-codex}**
- **What:** (b) **status turns are non-pausing** — zero canon hits; no `status` inbox type; the Codex shepherd idled a lane after answering a status ask. (c) **a merge-authority hold is scoped to the merge act only** — the two-gate structure implies it, canon never states it; F35 over-application blocked dispatch/refine/PR-open. (d) **within-lane refinement pipelining during execution/merge waits** — §6.4's "planning never waits on execution" exists only at program altitude.
- **Evidence:** d2 reader rg sweeps; shepherd-findings.md items 1-3; observations.md:165-178.
- **Fix:** three sentences, landed in the shepherd charter/protocol + mirrored in the Codex binding (they compound hardest on an attended-only runtime). **Effort:** S. **Cosmo-grain:** one WI (the harvest-queue "shepherd protocol lines" captures, consolidated). **Confidence:** high.

### B-39 · Protocol-change rollout is asserted but not mechanized — no version stamps, no announce channel, no owner
- **{D2, P2 — the (h) failure; pairs with B-15/B-30}**
- **What:** shepherd:273-274 requires "a versioned canon edit announced at a checkpoint boundary," but no doc carries a version field, no changelog/announce channel exists, and no role owns rollout. Adoption-timing rules are well-specified per-role (pull-adoption at session boundaries) — fine for low-impact changes, no push path for high-impact ones (merge-authority flips mid-pilot are the exhibit; retro fix #24).
- **Evidence:** cited; retro §5 H4; DECISION-PACK ruling 3 (pending).
- **Fix:** version stamp + one-line changelog per canon doc; PM named rollout owner; high-impact changes get a substrate `decision` broadcast + positive-ack (the fleet-directive positive-ack canon already exists — reuse it). Mechanize skew *visibility* via B-15's heartbeat version field.
- **Effort:** S-M. **Cosmo-grain:** one WI + canon line. **Confidence:** high.

### B-40 · D2 P3s
- (a) **Roster-ownership inconsistency:** PM-protocol claims roster ownership (L65-72) while library docs still say "orchestrator maintains" (PM:92-96 self-admits) — confirms existing WI-1370 (ownership-prose sweep). S.
- (b) **Pilot-dated rules caveat:** WI-1585 merge-classes and WI-1599 drain-tiers are stamped 2026-07-05 and bind at next session boundary — they are the *output* of the pilot, not rules in force during it; cross-host adoption unverified. Verify at relaunch rather than re-litigating the incidents. S (verification).

---

## Cross-check — vs zdx-backlog-audit-2026-07-05/AUDIT.md (62 items) and the day-2 pilot doc

**Where this audit AGREES with the draft audit (and sharpens):**
- **WI-1264 P1-bump (F-H): confirmed, and split.** The branch-protection half is a zero-code repo-settings action needing only org admin — do it immediately, before the WI dispatches (B-29). The windows-latest CI leg is the M-sized remainder.
- **WI-1600 REPAIR (F-C): confirmed, upgraded.** Repair the instance, but B-17's `empty(Stage)` Validity clause kills the class — the draft's own note ("living proof of WI-1332") pointed here; this audit says build it, not just cite it.
- **WI-851 / WI-1159 / WI-1225 / WI-1635 / WI-1369 FIRST-WAVE: agree.** B-10 independently re-derives WI-1159's urgency (review agents run `-s danger-full-access` with prose-only read-only enforcement). B-20 extends WI-1635 with `Reviewed By/At` in the same schema pass.
- **F-B (Windows-judge trio 1282/1284/1295 CLOSE? pending codex-default verify): agree, and B-34 settles the verification shape** — if codex-default is sanctioned, the `claude -p` fallback should fail loudly (it's also a fleet-veto violation); that ruling closes the trio as fallback-path-retired rather than leaving "verify" open-ended.
- **F-D (cross-WS WP bundling): agree; B-22 adds the structural cause** — Project-homing is unenforceable in the current Validity formula, so this class recurs regardless of the WP-1515/1518 re-scopes.
- **DECISION-PACK Tier A (WI-1563 watchdog, WI-1602 cadence, WI-1601 sweep, WI-1245 permanence, WI-1599 fleet-state): confirmed** — with three riders: the watchdog can't supervise `review-watcher.ts` today (B-07); WI-1601's guard is advisory-only (B-33); WI-1245's finalize should carry the clacks-channel.md doc-staleness fix (B-06).
- **Hand-back step 0 (plugin refresh on every host): necessary but decays immediately** without B-30's version preflight — the audit's own checkout drifted 8 commits behind within a day of the fleet drain.

**Where this audit DIFFERS from the draft:**
- **WI-1312 + WI-1332: KEEP → promote to first wave.** The draft prices them as backlog design items; B-17 shows both are S-effort Validity-formula edits closing the week's two live incident classes. Cheapest severity-weighted wins on the board.
- **WI-1263: REFINE→spike is overtaken.** The spike happened; v1 shipped under the operator's Option-B ruling. The live scope is now B-01 (wake subscriber), B-02 (RLS/client fix), B-04 (JWT tooling), B-05 (envelope contract), B-03 (retirement map) — a v1.1 WP, not a decision-doc.
- **The draft is item-scoped by construction; ten of this audit's findings have no backlog row at all** (B-02, B-03, B-05, B-12, B-15, B-18, B-19, B-21-verbs, B-25, B-31-as-separate) — the enabling layer's worst debt was living outside Cosmo.

**vs the day-2 pilot doc (observations.md 2026-07-06 + shepherd findings):**
- **Agree with the full layered root-cause of the 8h freeze** and with attended-only as dominant. This audit operationalizes: B-01 gives the wake mechanism a concrete design slot; B-24 folds all seven findings into one binding revision instead of piecemeal harvest.
- **One reframe (B-27): the next Codexification win is not another interactive role** — it's moving monitor/poll duties off agent turns entirely (scripts + substrate wake). That de-burns Claude without waiting for Codex self-wake, and it's what the retro's H2 mechanism actually indicts.
- **WI-1650 (reviewer factual reliability in the eduagent CI review workflow) is Audit-A territory** — noted as a boundary, not assessed here.
- The pilot's "watch for a 4th instance" threshold on capture-time mis-homing is **met by construction** (B-22): the enforcement is impossible in the current formula, so instances are guaranteed. Capture the WI now.

- **D2's adoption-lag caveat (B-40b) qualifies both prior docs:** several retro/pilot behaviors already have rules stamped 2026-07-05 (WI-1585, WI-1599, pause tiers) that were NOT in force during the incidents that motivated them. Relaunch verification (did every host adopt?) matters more than new rule-writing for those classes.

---

## Top-10 (ranked: severity × leverage, anchored on the four pains)

| # | Finding | Pain | Why this rank | Effort |
|---|---|---|---|---|
| 1 | **B-35 liveness arming** (L1 live-armed, watchdog registration = bootstrap step, macOS port, reviewer in ladder) | role, clacks | Every dead-lane hour of the retro (10-12h × 3 lanes) and the pilot's 8h freeze trace to designed-but-unarmed checks. Arming is S-sized per slice; nothing else on this list pays out while sessions can die undetected. | S×4 |
| 2 | **B-17 Validity formula holes** (stage-less orphan + null-`Claimed At` zombie → promote WI-1332 + WI-1312) | role | Two live incident classes, S-effort formula edits, zero design ambiguity. Cheapest severity-weighted wins on the board. | S |
| 3 | **B-01 substrate wake subscriber** (Realtime consumer + per-OS wake action) | codex, clacks | The substrate's own justification. Unlocks Codex-shepherd viability AND replaces poll-burn; without it the substrate is a nicer transport with the same economics. | M |
| 4 | **B-09 (+B-02) reviewer one-way heartbeat** (fix the RLS/`return=representation` client bug first) | reviewer | Pain 3's designed fix, fully scoped by D4; v2 RLS drafts the enforcement already. B-02 must land first or the reviewer heartbeat fails at the client. | S-M |
| 5 | **B-29 marketplace branch protection** (+ windows-latest leg later) | all | Minutes of operator work; gates every lifecycle-tool regression class behind the CI that already exists. The single best effort-to-leverage ratio found. | XS |
| 6 | **B-30 + B-15 version-skew signal** (plugin preflight + canon-version in heartbeats + respawn-boundary release rule) | clacks | OPQ-17 reproduced live during this audit; hand-back step 0 decays immediately without the standing signal. Resolves the retro's H4 disagreement by making skew observable. | S-M |
| 7 | **B-36 + B-37 charters with queue-trigger + WIP policy** (dispatch trigger → shepherd; WI-1526 duty spec folded in; keep scar lines) | role | Pain 1's structural fix. Track 2 is already committed — this scopes it so the charters dissolve the actual muddle (one entangled sentence + missing WIP policy), not just reformat prose. | M |
| 8 | **B-24 Codex binding revision** (fold all 7 pilot findings; attended-only fork made explicit) + **B-38 three invariant lines** | codex | The pilot's evidence is 100% unabsorbed into the binding it tests. The three one-line invariants compound hardest on attended-only runtimes. | S-M |
| 9 | **B-26 adaptive cadence (WI-1602) + per-lane token telemetry** | codex | The agreed, Tier-A-ratified burn fix, still unbuilt; telemetry makes H2 measurable instead of inferred. Complement of #3, not substitute. | M |
| 10 | **B-21 top-down verbs, staged** (planning-lifecycle doc + PRD clause anchors first; decompose/coverage-trace specs after) | — (track 10) | The strategic gap. The two S-sized docs unblock everything else and should be designed against Audit A's deliverable as first ingestion artifact. | S+S, then L |

Near-misses (11-13): B-03 substrate retirement map (prevents track-3 from tearing down the quality gate), B-20 Reviewed-By/At + ZDX-ADR-0011 (role accountability's data substrate), B-12 shared-checkout ADR for the root repo (rule before Lancre hosts multi-agent execution).

## Known-work shortlist — confident enough to fold into the immediate ZDX hand-back (track 6)

Ordered; items 1-6 are dispatch-ready as scoped, 7-13 need only a capture/refine pass, no design ruling:

1. **Marketplace branch protection** (B-29 half) — operator repo-settings action, minutes. Do before any WI dispatches.
2. **WI-1332 + WI-1312 → first wave** (B-17) — Validity clauses + sweep reap extension; AC text is already in this doc.
3. **B-02 clacks client fix** (`return=minimal` on heartbeat) — one line, before any v2 RLS work.
4. **Plugin-version preflight** (B-30) — S; makes hand-back step 0 durable.
5. **B-18 conformance-rule normalization** (Assisted + 9-stages across 4 surfaces) — S doc fix; a conformance audit run before this lands produces false drift.
6. **Trip-wire false-positive fixes + negative-test corpus** (B-31) — S, reproduced live, kills a Gate-2 bounce class alongside WI-1369.
7. **Reviewer heartbeat WI** (unquiesce §4, scoped per B-09: substrate one-way, author-prefix probe, kickoff "print" replaced).
8. **Three shepherd invariant lines** (B-38) — consolidate the harvest-queue protocol captures into one WI.
9. **Codex binding revision** (B-24) — one revision folding WI-1646/1647/1648 + attended-only + the B-38 lines.
10. **WI-1635 completion** + `Reviewed By/At` rider (B-20).
11. **WI-1602 adaptive cadence** — already Tier A; confirmed by this audit.
12. **Clacks-channel doc staleness fix** (B-06) — rider on the WI-1245 finalize that is already in hand-back step 1.
13. **Commit the Linux secrets-helper port + lockstep ADR-0011 amendment** (B-13) — fold into WI-1639 (Lancre setup).

Explicitly NOT shortlisted (needs a ruling or design first): B-01 wake subscriber (operator picks wake-vs-attended-staffing fork per B-24), charters content (operator ratification gate, track 2), B-21 top-down verbs (design with Audit A), B-12 shared-checkout ADR (operator ruling), v2 RLS apply (after B-02/B-04), B-33 sweep-guard enforcement wrapper (touches commit-skill invocation path).

---

**Audit complete — 2026-07-06. 40 findings (B-01..B-40) across 7 dimensions; 10 with no prior backlog row. Cross-checked against the 62-item draft audit (agreements sharpened, 3 dispositions overtaken/upgraded) and the day-2 pilot doc (operationalized, one reframe). Substrate reporting: lane `audit-system`, events 10-22; STATUS-B.md mirrors.**
