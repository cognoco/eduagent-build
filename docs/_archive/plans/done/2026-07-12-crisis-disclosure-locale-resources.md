# WI-1690 Crisis-disclosure locale resources

## Goal

Complete the already-landed crisis-disclosure safety slice by giving deterministic self-harm and abuse-disclosure replies a verified helpline directory appropriate to the learner's conversation language, while preserving the existing English safety copy and the ruled no-guardian-notification policy.

## Files

- `apps/api/src/services/safety-tripwire.ts` — add the complete language-to-resource mapping and include the selected resource in crisis replies.
- `apps/api/src/services/safety-tripwire.test.ts` — prove every supported conversation language resolves to the intended verified resource, with English as the missing-language fallback.
- `apps/api/src/services/exchanges.ts` — pass the profile conversation language through both non-streaming and streaming tripwire paths.
- `apps/api/src/services/exchanges.test.ts` — prove localized resources survive both response paths and the persisted structured envelope.

## Execution

1. Add failing unit and exchange-pipeline tests for locale selection and propagation.
2. Add a typed, exhaustive `ConversationLanguage` resource map using Find A Helpline's maintained directory rather than embedding volatile phone numbers.
3. Thread `ExchangeContext.conversationLanguage` through deterministic tripwire response and envelope builders.
4. Run focused tests, type checking, linting, and formatting checks.

## Non-goals

- Translating the safety prose without reviewed safety translations.
- Adding guardian notifications, mandatory-reporting automation, or a new operator workflow.
- Expanding the high-precision detector patterns.
