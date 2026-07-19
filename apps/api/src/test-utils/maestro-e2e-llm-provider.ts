import { registerLlmProviderFixture } from './llm-provider-fixtures';

/** Register the deterministic external-boundary LLM used by hosted Maestro. */
export function registerMaestroE2eLlmProvider(): void {
  registerLlmProviderFixture({
    // With no live keys, the legacy rung-1 router selects OpenAI. Registering
    // the fixture under that existing provider id exercises the real router
    // and subject-response parser without making an external request.
    id: 'openai',
    chatResponses: [
      {
        status: 'direct_match',
        resolvedName: 'Photosynthesis',
        focus: null,
        focusDescription: null,
        suggestions: [
          {
            name: 'Photosynthesis',
            description: 'How plants turn light into energy',
          },
        ],
        displayMessage: '',
      },
    ],
    // The named E2E case creates this subject immediately after resolution.
    // Keep all subsequent generation attempts valid and deterministic so the
    // case never depends on the production parser's failure fallback.
    chatResponse: {
      type: 'narrow',
      topics: [
        {
          title: 'How Plants Capture Light',
          description: 'How leaves collect light energy for making food',
          relevance: 'core',
          estimatedMinutes: 20,
        },
        {
          title: 'Chloroplasts and Chlorophyll',
          description: 'The cell structures and pigments that absorb light',
          relevance: 'core',
          estimatedMinutes: 20,
        },
        {
          title: 'Water and Carbon Dioxide',
          description: 'Where the raw materials for photosynthesis come from',
          relevance: 'core',
          estimatedMinutes: 20,
        },
        {
          title: 'Making Glucose',
          description: 'How plants store captured energy as sugar',
          relevance: 'core',
          estimatedMinutes: 20,
        },
        {
          title: 'Releasing Oxygen',
          description: 'Why oxygen leaves the plant during photosynthesis',
          relevance: 'recommended',
          estimatedMinutes: 15,
        },
        {
          title: 'Leaf Structure',
          description: 'How leaf parts support gas exchange and light capture',
          relevance: 'recommended',
          estimatedMinutes: 20,
        },
        {
          title: 'Factors That Change the Rate',
          description: 'How light water and temperature affect the process',
          relevance: 'recommended',
          estimatedMinutes: 25,
        },
        {
          title: 'Photosynthesis in Ecosystems',
          description: 'How plant energy supports food webs and living things',
          relevance: 'contemporary',
          estimatedMinutes: 20,
        },
      ],
    },
  });
}
