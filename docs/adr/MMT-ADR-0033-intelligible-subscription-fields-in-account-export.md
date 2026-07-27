# MMT-ADR-0033 — Account exports include intelligible subscription responsibility and store fields

**Status:** Accepted · 2026-07-11 · **Scope:** GDPR Article 15 account export, subscription rows, export field metadata · **Deciders:** Product operator; Architecture sign-off: Jørn (OPQ-64, 2026-07-11)

## Context

The account export is a fixed, schema-parsed JSON contract. Its v2 subscription source contains three fields that the export mapping previously discarded: the person responsible for the payment relationship, the app-store product identifier, and the app-store platform. A formal Article 15 product approval on 2026-07-11 ruled that all three belong in the export.

Returning the raw field names and values alone would make the artifact technically exhaustive but needlessly opaque. `payerPersonId` is particularly easy to misread as the learner, account owner, or payment-provider customer. The export therefore needs stable explanatory metadata without replacing the identifiers that make the data portable and machine-readable.

## Decision

1. Every exported subscription row includes `payerPersonId` as a required UUID and includes `storeProductId` and `storePlatform` as nullable strings. Their types mirror the persisted v2 subscription contract.
2. The top-level export includes one required `subscriptionFieldDescriptions` dictionary. It provides a stable human-readable label and description for each of the three fields, including an explicit statement that `payerPersonId` identifies the person responsible for the subscription payment relationship.
3. Descriptions appear once per export, not inside every subscription row. Subscription rows remain normalized data records; the dictionary is the human-readable contract metadata for those fields.
4. The route continues to parse the complete artifact with `dataExportSchema`. The field values and description dictionary are part of that schema, so malformed identifiers, wrong value types, missing descriptions, or altered contract text fail before the response is returned.
5. The export exposes only the approved identifiers and explanatory text. It does not join extra payer profile, login, payment-instrument, or provider data into the subscription section.

## Consequences

- The JSON change is additive for tolerant consumers, but the repository's typed export producers and fixtures must emit the required description dictionary and the required payer identifier.
- Store-origin fields remain `null` for subscriptions without an applicable store purchase. No synthetic value is invented.
- The description dictionary makes the artifact understandable while preserving stable identifiers for portability and reconciliation.
- The exact English labels and descriptions are contract text. Changing them is a deliberate schema change with corresponding tests and documentation, not an incidental copy edit.
- Rollback cannot silently remove the approved fields from live exports. A rollback requires a superseding policy decision and coordinated schema/producer change; temporary operational mitigation must preserve the last accepted export contract or version the response rather than dropping data.

## Alternatives considered

1. **Continue omitting the three fields.** Rejected — the formal Article 15 ruling requires them, and omission would leave the subscription record incomplete.
2. **Return values with raw field names only.** Rejected — technically machine-readable but not sufficiently intelligible, especially for payment responsibility.
3. **Repeat labels and descriptions inside every subscription row.** Rejected — duplicates identical prose and mixes contract metadata into each data record without adding meaning.
4. **Replace `payerPersonId` with a name or email address.** Rejected — loses the stable identifier, can create ambiguity, and would expose additional personal data that was not approved for this subscription section.

## Links

- `packages/schemas/src/account.ts` — parsed export contract and fixed field-description dictionary.
- `apps/api/src/services/identity-v2/export-v2.ts` — v2 subscription-to-export mapping.
- `docs/architecture.md` — living account-export rule.
