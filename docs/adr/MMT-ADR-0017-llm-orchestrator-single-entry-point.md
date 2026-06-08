# MMT-ADR-0017 — All LLM calls route through a single orchestrator (`routeAndCall()`)

**Status:** Accepted (Architecture decision, Epic 2 era) · **Reconstructed:** 2026-06-08 (Phase I-b promotion — MMT-ADR-0000 Part III) · **Scope:** All production LLM calls · **Deciders:** PM + Architect (jjoerg) + Claude · **aka** `ARCH-8` · **Relates to:** MMT-ADR-0014 (router/vetting split — downstream of the orchestrator), MMT-ADR-0016 (safety/judge architecture — downstream roles)

> **Provenance note:** this promotes the pre-existing register entry `ARCH-8` to a full decision record, exercising the **`ARCH-N` freeze + absorb-forward** mechanism (MMT-ADR-0000 Part III). Per absorb-forward, the same change-set migrates `ARCH-8`'s four code citations (`services/llm/router.ts`, `services/llm/types.ts`, `services/llm/providers/openai.ts`, `services/llm/providers/gemini.ts` — three shared with `ARCH-9`, which migrates to `MMT-ADR-0014`) to `MMT-ADR-0017`, and stamps the `ARCH-8` line in `docs/specs/epics.md` with its disposition (`→ MMT-ADR-0017`). No standing `ARCH-8` alias remains. Reconstructed after the fact: the decision is recorded as built, without inventing a contemporaneous rationale beyond what the code and register attest.

## Context

The app calls multiple LLM providers (Gemini, OpenAI, Anthropic) across many call sites — exchanges, curriculum generation, assessment, the judge. If each call site reached for a provider SDK directly, four cross-cutting concerns would have no single place to live: per-request metering against the quota system, structured logging and cost tracking, provider failover, and the eligibility/routing decision. Scattering provider calls also makes a model or provider swap an N-site edit and blinds the cost dashboard the moment one site bypasses metering.

## Decision

- **Every LLM call goes through one orchestrator** — `routeAndCall()` (with the streaming variant `routeAndStream()` for SSE) in `apps/api/src/services/llm/router.ts`. There are **no direct provider SDK or `fetch` calls** to Anthropic/OpenAI/Gemini from anywhere else.
- **Provider modules are pure adapters** registered with the orchestrator (`registerProvider`), not called directly by feature code; the orchestrator owns selection and failover.
- **The orchestrator is the single seam the downstream LLM architecture hangs off.** The router/vetting split (`MMT-ADR-0014`) and the safety/judge roles (`MMT-ADR-0016`) sit **downstream** of this entry point — they refine *how* a call is routed and evaluated, not *where* calls enter.

## Consequences

- One choke point enforces metering, logging, provider failover, and cost tracking; a direct provider call bypasses metering and blinds the cost dashboard (this is the standing enforcement rule in `architecture.md` — "No direct LLM API calls").
- Provider modules are swappable behind the orchestrator without touching call sites; adding or changing a provider is a registration change, not an N-site sweep.
- The orchestrator is the natural home for the eligibility/fail-closed contract: the router (`MMT-ADR-0014`) reads the vetted `allowed_models` set and raises `CircuitOpenError` rather than routing to an unvetted model — all behind `routeAndCall()`.
- The model picks that fill each routing slot are **register data** (`docs/registers/llm-models/`), not part of this ADR; this ADR fixes the *single-entry-point* invariant, not the occupants.

## Alternatives considered

1. **Per-caller provider SDK use (no orchestrator).** Rejected — no single place for metering/logging/failover/cost; a model swap becomes an N-site edit and any bypass silently blinds the cost dashboard.
2. **A thin pass-through wrapper without routing.** Rejected — a wrapper that does not own selection/failover still forces routing logic into call sites; the value is precisely the centralized routing + eligibility seam that `MMT-ADR-0014` then refines.
