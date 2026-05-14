# Agent Suggestions

## Hermes - Qwen3.6-plus
Here are identified use cases ranked by suitability for a /goal showcase:
    
    1. AUDIT-SCHEMA-2: Response-schema enforcement across API routes
    36 of 41 route files (88%) bypass the shared contract schema from @eduagent/schemas -- only bookmarks.ts does it right. This cross-cuts three packages: schemas package needs 22 response envelope types, API routes need to adopt typed parsing, and mobile's Hono RPC client benefits from end-to-end type safety. The exit metric is binary: zero routes using ad-hoc response shapes, all passing through shared envelopes. Multi-PR but each PR has a clear slice. It demonstrates /goal's ability to handle sustained, cross-package enforcement of engineering rules.
    
    2. AUDIT-MOBILE-1: Expo Router navigation safety + token compliance
    Three nested layouts lack the unstable_settings safety net for cross-stack deep pushes, AccordionTopicList does a single-push without the parent-first chain, and session/index.tsx has 10 hardcoded hex values in the highest-traffic shared screen. All of these violate documented CLAUDE.md guardrails. ~1-2 hours total, one PR, very concrete verification: lint passes, navigation back-stack works correctly on deep pushes, and grep for hex codes in production screens returns zero. Tight, measurable, and immediately impactful for UX.
    
    3. AUDIT-INNGEST-2: Event orphan observer sweep
    Three events (app/ask.gate_decision, app/ask.gate_timeout, app/email.bounced) are emitted but have no observer functions consuming them -- same drift pattern a previous PR fixed for app/payment.failed. ~10 minutes, one file to create, one to wire. Too small to really stretch /goal, but it's a self-contained, testable safety fix.
    
    4. Migration hygiene (AUDIT-MIGRATIONS-1/2/3)
    Regenerate 10 missing drizzle meta snapshots, fix backward non-monotonic _journal.json timestamps, sweep all destructive migration SQL files for missing ## Rollback sections. ~2-3 hours, multi-file, but mostly mechanical work. Low strategic value -- the kind of cleanup you'd normally batch into a hygiene PR.
    
    5. Tiered billing / Family pools (FR108-FR117)
    New feature work rather than quality assurance. Clear business value and well-defined scope, but it's product development, not a showcase for /goal's ability to enforce standards or close quality gaps.
    
    Recommendation: Start with #1 if you want the big demo. Move to #2 if you want something that finishes in a single session and still shows the /goal discipline working well across multiple files and conventions.

## Hermes - GPT-5.5
 Ranked /goal showcase candidates
    
    1. Quality Ratchet v1 — executable cross-repo guardrails
    Turn the repo’s written rules into durable checks: API env access, LLM call boundaries, DB scoping, SecureStore cleanup, Expo Router navigation/layout safety, response body handling, and status-code parsing. Best overall showcase because it is cross-repo, multi-hour, measurable, and leaves behind a quality system rather than just a patch.
    
    2. Observability / silent-recovery ratchet
    Audit sensitive flows — auth, billing, webhooks, Inngest, deletion, notifications, background jobs — for silent recovery, console.warn-only handling, missing dispatch proof, and unobservable failure paths. Excellent because failures in these areas are high-impact and the exit metrics are concrete: structured events/metrics, production dispatch proof, and tests for negative paths.
    
    3. Contract drift detector
    Build checks that keep API routes, @eduagent/schemas, mobile consumers, and shared package exports aligned. Strong showcase because contract drift is a classic monorepo problem, spans API/mobile/packages, and has crisp exit criteria: no duplicate API-facing types, no schema/route/mobile mismatch, detector passes in CI.
    
    4. Test harness unification / internal mock ratchet
    Continue the shared test utility framework: mobile render harness proof, generalized integration mock guard, regenerated mock inventory, and a coherent batch of internal mocks migrated to shared helpers. Good because it improves the test architecture itself and creates measurable before/after counts, though it may overlap with cleanup work already near completion.
    
    5. API test type-safety closure
    Finish the deferred API test strictness work: drain remaining tsconfig.spec.json errors, wire spec typechecking into API typecheck, and remove the deferred strictness gap. Very measurable and agent-friendly — error count goes to zero — but less ideal now if the cleanup plan is already close to done.
    
    6. Error resilience consistency pass
    Audit API client boundaries, mobile screens, SSE/fetch handling, and fallback UI so errors classify centrally and screens stop parsing raw HTTP statuses. Valuable cross-cutting UX reliability work, but somewhat more subjective than the top choices because “good fallback behavior” needs product judgment.
    
    7. Learning Product Evolution Slice 1
    Make teach-first / fast-path onboarding the production path and retire old setup-heavy onboarding surfaces. Most product-visible option, but riskier as a /goal spike because exit metrics are less purely mechanical and the work can become product/design-sensitive.
    
    8. EduAgent → MentoMate naming sweep
    Sweep user-facing docs/code strings from EduAgent to MentoMate while preserving intentional @eduagent/* package names. Useful and easy to measure with grep/allowlists, but not a flagship showcase: mostly mechanical, less representative of sustained autonomous engineering.

## Claude Code - Opus 4.6¨
1. Cross-Repo A11y + Type Safety Sweep

  Add two ESLint rules (testID↔accessibilityLabel pairing, re-enable
  no-explicit-any in tests) and fix all 320+ violations across both apps.
  Exit criteria are binary: both rules pass at error level with zero
  violations.

  Best showcase because it's massive scope (320+ changes, every layer),
  zero risk of breaking runtime behavior, fully parallelizable, and the
  exit metric is a single CI gate — pass or fail. No ambiguity about
  "done."

  2. Practice Activity Summary Service

  Full-stack ledger feature: new DB tables, event emission from every
  practice completion path, report population, mobile rendering. ~25 files
  across schema, services, Inngest, and mobile UI.

  Best feature-build showcase because exit criteria are sharp (reports go
  from empty practiceSummary: undefined to fully populated) and it crosses
  4 architectural layers. Demonstrates design judgment, not just code
  volume.

  3. Parent Home Feature (11 Phases)

  Reshape parent home into a JTBD intent picker, delete Family tab, add
  Progress segmented control, build Nudge system with
  rate-limiting/consent/quiet-hours. Full spec exists with 11 checkpointed
  phases.

  Most ambitious option (~40-60 hours). Excellent phased structure with
  natural stopping points, but the schema migration in phase 8 raises
  phases.

  Most ambitious option (~40-60 hours). Excellent phased structure with
  natural stopping points, but the schema migration in phase 8 raises stakes.
  Best if you want maximum breadth and real product delivery.

  4. P1 Internal Mock Cleanup (Inngest Batch)

  Migrate 5-10 critical Inngest/workflow test files from internal mocks to
  real harnesses. ~70 internal mocks drop to <10. Requires building the mobile
   screen render harness first.

  Strong testing-infrastructure showcase with measurable before/after (mock
  count), but narrower scope than #1 and the tooling prerequisite (harness
  creation) adds sequencing complexity.

  5. Library Book Screen Refactor (Pattern Y)

  Refactor a 1,399-line book screen into a clean chapter list + per-chapter
  screens. Requires a navigation architecture decision (URL slugs vs DB table
  vs hybrid).

  Visible UX improvement with a dramatic line-count reduction, but the upfront
   design decision (Option A/B/C) makes exit criteria fuzzier than the others.

  6. EVAL-MIGRATION Envelope Cleanup

  Migrate evaluate and teach_back exchange types from embedded JSON to the
  structured envelope pattern. ~4 files, requires LLM eval harness validation.

  Clean architectural consolidation with a strong "done" signal (pnpm eval:llm
   --live passes), but too small (~8-12 hours) to showcase sustained
  autonomous execution.

  ## Pi - qwen3.6-max
  Here are the top candidates, ranked by "hours of autonomous work ×    
 clear exit metrics × low risk of going off the rails":                
                                                                       
 🥇 #1 — Memory Architecture Upgrade Phase 1 (the whole spec)          
                                                                       
 Source: docs/specs/2026-05-05-memory-architecture-upgrade.md — it's   
 424 lines of extremely detailed spec, sitting in "Design — pending    
 review" status.                                                       
                                                                       
 Why it's a phenomenal /goal spike:                                    
                                                                       
 - ~6-8 hours of work across DB migration, backfill script, dual-write 
 transaction rewrite in applyAnalysis, parity test suite, API endpoint 
 extensions, and feature flag wiring                                   
 - Crystal-clear exit metrics: 9 acceptance criteria checkboxes for    
 Phase 1, each with specific test names and grep-able signals.         
 "Integration test asserts both rollback together on failure" — you    
 can prove each one passes or fails                                    
 - Three-phase structure means you can run Phase 1 as one /goal,       
 declare success/failure, then run Phase 2 as a second one — great for 
 comparing Codex vs Claude Code across identical scopes                
 - Profile-scoping + consent gating means there are natural "break     
 tests" that prove the agent didn't cut corners (query profile A,      
 assert zero rows from profile B)                                      
 - Low risk: feature-flagged throughout, JSONB columns kept during     
 soak period, rollback is just "flip flag off"                         
                                                                       
 Suggested /goal:                                                      
                                                                       
 │ "Implement Memory Architecture Upgrade Phase 1 per                  
 │ docs/specs/2026-05-05-memory-architecture-upgrade.md. All 9 Phase 1 
 │ acceptance criteria must pass. Run pnpm exec nx run api:test and    
 │ pnpm exec nx run api:typecheck to verify. Feature flag              
 │ MEMORY_FACTS_READ_ENABLED defaults off."                            
                                                                       
 ───────────────────────────────────────────────────────────────────── 
                                                                       
 🥈 #2 — C6 P3b–P3e: Strict-mode TypeScript typecheck remediation      
 (~200 errors across ~80 files)                                        
                                                                       
 Source: Cleanup plan C6 phases P3b (37 errors), P3c (129 errors), P3e 
 (95 errors)                                                           
                                                                       
 Why it's great:                                                       
 - Massive volume, mechanical fixes — each error has a known fix       
 pattern (add type annotation, extend Hono Variables, align mock       
 shape). This is exactly where long-running agents excel               
 - Binary pass/fail metric: pnpm exec tsc --noEmit -p                  
 apps/api/tsconfig.spec.json error count goes from ~29 (real errors,   
 excluding TS6305 noise) to 0                                          
 - Scope-guarded — each phase lists exact files, so the agent can't    
 wander                                                                
 - ~3-5 hours of grinding work that no human enjoys                    
                                                                       
 Why it might not showcase as well:                                    
 - More "typing monkey" than "architect" — doesn't show strategic      
 reasoning                                                             
 - The errors are already shrinking (the plan's re-greps show counts   
 dropping as parallel PRs land)                                        
                                                                       
 ───────────────────────────────────────────────────────────────────── 
                                                                       
 🥉 #3 — C4 P7: Root migration of personaFromBirthYear() → three-way   
 AgeBracket                                                            
                                                                       
 Source: Cleanup plan C4 P7 — 24 files claimed, ~3-4 hours,            
 cross-package                                                         
                                                                       
 Why it's interesting:                                                 
 - Spans mobile + API + schemas — tests cross-package coordination     
 - Exhaustive never check at every switch — the compiler proves        
 completeness, giving the agent a self-correcting signal               
 - Clear grep-based verification: rg 'personaFromBirthYear' → zero     
 hits                                                                  
 - Already failed once (PR #213 closed unmerged) — the expansion from  
 14 → 24 files means the agent needs to discover cross-package         
 consumers, not just follow a checklist                                
                                                                       
 Risk: It's smaller (~3-4 hrs) and the file list is already fully      
 enumerated from the DEV-007 postmortem, so it's more "follow the      
 list" than "discover and execute."                                    
                                                                       
 ───────────────────────────────────────────────────────────────────── 
                                                                       
 Wildcard #4 — C8 P4: Memory file dedupe (~96 files in                 
 .claude/memory/)                                                      
                                                                       
 Tiny individual decisions × massive volume = either a spectacular     
 showcase or a spectacular mess. Lower value as a product-feature demo 
 though.

 ## Codex - GPT-5.5 high
 1. Cross-Repo Test Boundary Integrity
     Drain high-risk internal mocks across API, Inngest, integration, and
     mobile tests. Best showcase because it is systemic, measurable, and
     long-running: inventory counts go down, guardrails go up, and real
     contract coverage replaces brittle mocks.
  2. LLM Structured Envelope Completion
     Finish migrating remaining evaluate / teach_back free-text JSON
     assessment paths into llmResponseEnvelopeSchema. Strong because it
     crosses schemas, prompts, parser logic, session completion, eval
     snapshots, and architecture rules, with a crisp exit: no EVAL-
     MIGRATION TODOs and eval/type tests pass.
  3. Silent Recovery / Observability Ratchet
     Sweep fallback, catch, console.warn, and best-effort recovery paths
     across auth, billing, webhooks, sessions, and background jobs. Good
     because it targets a known recurring quality class: failures that look
     “handled” but disappear without structured telemetry or user recovery.
  4. Mobile Screen Harness + UI Contract Hardening
     Build a shared screen render harness with QueryClient, profile/auth
     fixtures, routed API mocks, native-boundary shims, and clean teardown.
     Good because mobile has the largest mock volume and this would reduce
     open handles, hook mocks, --forceExit, and route-contract drift.
  5. Homework Overhaul Phase B
     Multi-problem OCR cards, per-problem homework modes, metadata, summary
     extraction, and parent display. Best product-facing showcase, but less
     purely “quality” than the top four.
  6. Bring-Your-Own Material v1
     Add upload/paste/link material ingestion and convert it into study
     paths. Flashy and large, but weaker as a /goal spike because storage,
     parsing, retrieval, and UX scope need more product decisions before
     exit metrics are clean.