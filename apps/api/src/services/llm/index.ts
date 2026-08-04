export {
  routeAndCall,
  routeAndStream,
  registerProvider,
  unregisterProvider,
  getRegisteredProviders,
  CircuitOpenError,
  _resetCircuits,
  _clearProviders,
  MIN_REPLY_MAX_TOKENS,
  OPENAI_ADVANCED_MODEL,
  OPENAI_ADVANCED_MODEL_CANDIDATES,
  OPENAI_ADVANCED_MODEL_MIN_RUNG,
  ANTHROPIC_SONNET_MODEL,
  getOpenAIAdvancedModel,
  setLlmRoutingV2Enabled,
  setLlmKillSwitchActive,
  setLlmEnvironment,
  setLlmTransferEvidenceVerified,
} from './router';
export { CONVERSATION_LANGUAGE_NAMES } from './router';
// [WI-2628] The judge-independence exclusion pool + resolver. Exported so a guard
// test can assert the SAFETY PROPERTY directly — that a declared producer vendor is
// absent from the resolved pool — rather than only that some string was passed. A
// model string ('claude-sonnet-4-6') passes a "vendor was supplied" check while
// excluding nothing.
export { JUDGE_VENDOR_ORDER, resolveJudgeEligibleVendors } from './router';
export { runWithLlmRequestContext } from './request-context';
export { parseConversationLanguage } from './conversation-language';
// Test-only helpers (createMockProvider, mockProvider, getFallbackConfigForTest,
// getModelConfigForTest, _setOpenAIAdvancedModelForTesting, _getLlmRoutingV2Enabled)
// are intentionally NOT exported here — they live in './test-utils' so test
// scaffolding never ships in the production worker bundle. [BUG-900]
export { createGeminiProvider } from './providers/gemini';
export { createOpenAIProvider } from './providers/openai';
export { createAnthropicProvider } from './providers/anthropic';
export { createOpenRouterProvider } from './providers/openrouter';
export { createCerebrasProvider } from './providers/cerebras';
export { createMistralProvider } from './providers/mistral';
export { getTextContent } from './types';
export { extractFirstJsonArray, extractFirstJsonObject } from './extract-json';
export { normalizeStopReason } from './stop-reason';
export type { StopReason, StopReasonProvider } from './stop-reason';
export type {
  LlmProviderPolicy,
  OpenAIAdvancedModel,
  PreferredLlmProvider,
  JudgeIndependence,
} from './router';
export {
  parseEnvelope,
  isRecognizedMarker,
  extractReplyCandidate,
  KNOWN_MARKER_KEYS,
} from './envelope';
export { streamEnvelopeReply, teeEnvelopeStream } from './stream-envelope';
export { parseStructuredLlmOutput } from './parse-structured';
export type {
  ParseEnvelopeResult,
  ParseEnvelopeSuccess,
  ParseEnvelopeFailure,
  ParseEnvelopeFailureReason,
} from './envelope';
export type {
  ChatMessage,
  EscalationRung,
  ModelConfig,
  LLMProvider,
  RouteResult,
  StreamResult,
  MessagePart,
  TextPart,
  InlineDataPart,
} from './types';
export { escapeXml } from './sanitize';
