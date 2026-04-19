import type { EvalProfile } from '../fixtures/profiles';

// ---------------------------------------------------------------------------
// Eval-LLM — Core runner types
//
// Each flow adapter implements FlowDefinition. The runner then:
//   1. Calls buildPromptInput(profile) to map the full fixture into the
//      specific inputs that flow's builder expects
//   2. Calls buildPrompt(input) to produce the actual prompt string(s)
//   3. (Tier 1) Writes the prompt + inputs to a snapshot file
//   4. (Tier 2, --live) Also calls the LLM, validates response shape,
//      and appends the response + any schema violations to the snapshot
// ---------------------------------------------------------------------------

/** Raw prompt output — either single-string or system+user pair. */
export interface PromptMessages {
  system: string;
  user?: string;
  notes?: string[]; // free-form builder notes surfaced to the snapshot
}

/**
 * Minimal Zod-like validator interface. Anything with a `.safeParse` method
 * satisfies this — both real Zod schemas and ad-hoc validators work. This
 * avoids a hard dependency on Zod here; downstream callers pass real Zod
 * schemas when migrating to the response envelope.
 */
export interface ResponseValidator {
  safeParse(value: unknown): { success: boolean; error?: unknown };
}

export interface FlowDefinition<Input = unknown> {
  /** Stable kebab-case id — becomes the directory name under snapshots/. */
  id: string;
  /** Human-readable flow name for snapshot headings. */
  name: string;
  /** File path of the underlying prompt builder, shown in snapshot header. */
  sourceFile: string;

  /**
   * Map a full EvalProfile into the narrow input shape the real prompt
   * builder expects. Return null to skip this profile for this flow
   * (e.g. vocabulary flow only applies to profiles with a target language).
   */
  buildPromptInput(profile: EvalProfile): Input | null;

  /** Invoke the real production prompt builder. */
  buildPrompt(input: Input): PromptMessages;

  /**
   * Optional: live LLM call. Return the raw response string.
   * Only invoked when --live is passed. If omitted, tier-2 snapshots
   * will show "not supported for this flow" instead of a response.
   */
  runLive?(input: Input, messages: PromptMessages): Promise<string>;

  /**
   * Optional: expected response shape for live runs. When set, Tier 2 runs
   * parse the response as JSON and validate against this schema; any
   * violation is rendered as a "Schema violation" section in the snapshot.
   *
   * Use with the LLM response envelope from
   * `@eduagent/schemas/llm-envelope` once the structured-output migration
   * (audit finding F1.1–F2.2) lands. Flows that still return plain free
   * text leave this unset.
   */
  expectedResponseSchema?: ResponseValidator;
}
