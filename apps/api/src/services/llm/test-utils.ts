// ---------------------------------------------------------------------------
// LLM test-only helpers — NOT for production code.
//
// These were previously re-exported from the production barrel (`./index.ts`),
// which shipped test scaffolding (including mutation setters like
// `_setOpenAIAdvancedModelForTesting`) in the worker bundle. They now live in a
// dedicated test-utils module that production code must never import. The
// underlying implementations still live in `./router` and `./providers/mock`;
// this file is a curated re-export so tests import test helpers from one place.
// ---------------------------------------------------------------------------

export {
  getFallbackConfigForTest,
  getModelConfigForTest,
  _setOpenAIAdvancedModelForTesting,
  _getLlmRoutingV2Enabled,
} from './router';

export {
  mockProvider,
  createMockProvider,
  RECALL_GRADER_FORCE_UNPARSEABLE,
} from './providers/mock';
