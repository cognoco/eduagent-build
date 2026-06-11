// ---------------------------------------------------------------------------
// Session Exchange Router slice — carved from session-exchange.ts (WI-571)
//
// Contains: ExchangeLlmRouting, resolveExchangeLlmRouting,
//           resolveChallengeRoundLlmRoutingRung, and their routing constants.
//
// LLM routing must keep flowing through resolveExchangeLlmRouting().
// Routing behavior is NOT changed here — this is a structural carve only.
// Per-domain enforcement is out of scope (W2/W3).
// ---------------------------------------------------------------------------

import type {
  SubscriptionTier,
  ChallengeRoundSessionState,
} from '@eduagent/schemas';
import type {
  EscalationRung,
  LlmProviderPolicy,
  PreferredLlmProvider,
} from '../llm';
import type { LLMTier } from '../subscription';

// [BUG-732] Gates Plus / addon-Premium profiles into the `premium` LLM tier
// (Gemini Pro / Claude Sonnet — the "advanced" rung for the default Gemini
// pool). Distinct from `OPENAI_ADVANCED_MODEL_MIN_RUNG = 5` in
// services/llm/router.ts, which suppresses the OpenAI advanced candidate
// even on premium tier until rung ≥ 5. Naming both constants by provider
// makes the routing matrix self-documenting at the call site.
const GEMINI_ADVANCED_MODEL_MIN_RUNG = 4;
const PLUS_ADVANCED_RUNG_ROUTING_REASON = 'plus_included_advanced_rung';
const PLUS_STANDARD_RUNG_ROUTING_REASON = 'plus_standard_below_advanced_rung';
const PREMIUM_ADDON_ADVANCED_RUNG_ROUTING_REASON =
  'premium_profile_or_addon_advanced_rung';
const PREMIUM_ADDON_STANDARD_RUNG_ROUTING_REASON =
  'premium_profile_or_addon_standard_below_advanced_rung';

export interface ExchangeLlmRouting {
  llmTier?: LLMTier;
  preferredProvider?: PreferredLlmProvider;
  providerPolicy?: LlmProviderPolicy;
  routingReason?: string;
}

// [B71] `advancedLlmProvider` was a per-request provider preference (e.g. force
// Claude over GPT on advanced rungs) introduced in PR #309 but never wired into
// any route handler, middleware, env var, or UI surface. It only flowed through
// service-internal call chains and the manual `scripts/premium-routing-pass.ts`
// probe. The parameter and its branches were removed in the pre-launch cleanup
// pass — if per-profile provider preference becomes a real product feature, add
// a config column + UI control + middleware injection in the same change.
export function resolveExchangeLlmRouting(input: {
  subscriptionTier?: SubscriptionTier;
  requestedLlmTier?: LLMTier;
  effectiveRung: EscalationRung;
}): ExchangeLlmRouting {
  const isAdvancedRung = input.effectiveRung >= GEMINI_ADVANCED_MODEL_MIN_RUNG;

  if (input.subscriptionTier === 'plus') {
    return isAdvancedRung
      ? {
          llmTier: 'premium',
          routingReason: PLUS_ADVANCED_RUNG_ROUTING_REASON,
        }
      : {
          llmTier: 'standard',
          providerPolicy: 'gemini_only',
          routingReason: PLUS_STANDARD_RUNG_ROUTING_REASON,
        };
  }

  if (input.requestedLlmTier === 'premium') {
    return isAdvancedRung
      ? {
          llmTier: 'premium',
          routingReason: PREMIUM_ADDON_ADVANCED_RUNG_ROUTING_REASON,
        }
      : {
          llmTier: 'standard',
          providerPolicy: 'gemini_only',
          routingReason: PREMIUM_ADDON_STANDARD_RUNG_ROUTING_REASON,
        };
  }

  if (input.subscriptionTier === 'family') {
    return {
      llmTier: input.requestedLlmTier,
      providerPolicy: 'gemini_only',
      routingReason: 'family_standard_gemini_only',
    };
  }

  return { llmTier: input.requestedLlmTier };
}

export function resolveChallengeRoundLlmRoutingRung(
  escalationRung: EscalationRung,
  challengeRound: Pick<ChallengeRoundSessionState, 'state'> | undefined,
): EscalationRung {
  if (
    challengeRound?.state === 'accepted' ||
    challengeRound?.state === 'active' ||
    challengeRound?.state === 'drafting'
  ) {
    return Math.max(
      escalationRung,
      GEMINI_ADVANCED_MODEL_MIN_RUNG,
    ) as EscalationRung;
  }
  return escalationRung;
}
