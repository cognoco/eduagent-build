const mockRunHarnessLlm = jest.fn();
jest.mock('../runner/llm-client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../runner/llm-client',
  ) as typeof import('../runner/llm-client');
  return {
    ...actual,
    runHarnessLlm: (...args: unknown[]) => mockRunHarnessLlm(...args),
  };
});

import { llmResponseEnvelopeSchema } from '@eduagent/schemas';
import { parkAndReturnReweaveFlow } from './park-and-return-reweave';
import { getProfile } from '../fixtures/profiles';

describe('parkAndReturnReweaveFlow', () => {
  const profile = getProfile('12yo-dinosaurs');

  if (!profile) {
    throw new Error('12yo-dinosaurs profile missing');
  }

  beforeEach(() => {
    mockRunHarnessLlm.mockReset();
  });

  it('enumerates focused park-and-return prose scenarios for the target profile', () => {
    const scenarios = parkAndReturnReweaveFlow.enumerateScenarios?.(profile);

    expect(scenarios?.map((scenario) => scenario.scenarioId)).toEqual([
      'parked-question-reweave',
      'needs-deepening-return',
    ]);
    expect(
      parkAndReturnReweaveFlow.enumerateScenarios?.({
        ...profile,
        id: 'other-profile',
      }),
    ).toEqual([]);
  });

  it('builds the production exchange prompt with parked context and deterministic checks', async () => {
    const scenarios = parkAndReturnReweaveFlow.enumerateScenarios?.(profile);
    const scenario = scenarios?.[0];
    if (!scenario) throw new Error('parked-question-reweave scenario missing');

    const messages = parkAndReturnReweaveFlow.buildPrompt(scenario.input);

    expect(messages.system).toContain('Parked question from earlier');
    expect(messages.system).toContain('Why did sauropods have long necks');
    expect(messages.system).toContain('Memory hygiene');
    expect(messages.user).toBe(
      "Let's come back to the long-neck question now.",
    );
    await expect(
      Promise.resolve(
        parkAndReturnReweaveFlow.evaluateDeterministic?.({
          input: scenario.input,
          messages,
          profile,
          scenarioId: scenario.scenarioId,
        }),
      ),
    ).resolves.toEqual([]);
  });

  it('validates live responses as envelopes and flags replies that ignore the return', async () => {
    expect(parkAndReturnReweaveFlow.emitsEnvelope).toBeUndefined();
    expect(parkAndReturnReweaveFlow.expectedResponseSchema).toBe(
      llmResponseEnvelopeSchema,
    );

    const scenarios = parkAndReturnReweaveFlow.enumerateScenarios?.(profile);
    const scenario = scenarios?.[0];
    if (!scenario) throw new Error('parked-question-reweave scenario missing');

    const goodIssues = await parkAndReturnReweaveFlow.evaluateQuality?.({
      input: scenario.input,
      messages: parkAndReturnReweaveFlow.buildPrompt(scenario.input),
      liveResponse:
        '{"reply":"Back to your sauropod neck question: the trick is the tradeoff between reaching food and pushing blood up to the brain.","signals":{},"ui_hints":{}}',
      profile,
      scenarioId: scenario.scenarioId,
    });
    expect(goodIssues).toEqual([]);

    const badIssues = await parkAndReturnReweaveFlow.evaluateQuality?.({
      input: scenario.input,
      messages: parkAndReturnReweaveFlow.buildPrompt(scenario.input),
      liveResponse:
        '{"reply":"What would you like to learn about dinosaurs today?","signals":{},"ui_hints":{}}',
      profile,
      scenarioId: scenario.scenarioId,
    });
    expect(badIssues?.map((issue) => issue.code)).toContain(
      'park-return.missing-return-cue',
    );
  });

  it('routes live calls through the exchange harness in JSON mode', async () => {
    mockRunHarnessLlm.mockResolvedValue(
      '{"reply":"Back to it.","signals":{},"ui_hints":{}}',
    );
    const scenarios = parkAndReturnReweaveFlow.enumerateScenarios?.(profile);
    const scenario = scenarios?.[0];
    if (!scenario) throw new Error('parked-question-reweave scenario missing');
    const messages = parkAndReturnReweaveFlow.buildPrompt(scenario.input);

    const response = await parkAndReturnReweaveFlow.runLive?.(
      scenario.input,
      messages,
    );

    expect(response).toBe('{"reply":"Back to it.","signals":{},"ui_hints":{}}');
    const [chatMessages, rung, options] = mockRunHarnessLlm.mock.calls[0];
    expect(rung).toBe(1);
    expect(options).toEqual(
      expect.objectContaining({ responseFormat: 'json' }),
    );
    expect(chatMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({
          role: 'user',
          content: "Let's come back to the long-neck question now.",
        }),
      ]),
    );
  });
});
