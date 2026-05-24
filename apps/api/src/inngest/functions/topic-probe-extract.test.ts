const { createInngestTransportCapture } =
  require('../../test-utils/inngest-transport-capture') as typeof import('../../test-utils/inngest-transport-capture');

const mockInngestTransport = createInngestTransportCapture();
const mockGetStepDatabase = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => {
  return mockInngestTransport.module;
});

jest.mock('../helpers' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockGetStepDatabase(),
  };
});

jest.mock('../../services/sentry' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../../services/sentry',
  ) as typeof import('../../services/sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

import { topicProbeExtract } from './topic-probe-extract';

function extractSqlTextAndValues(
  node: unknown,
  visited = new Set<object>(),
): string[] {
  if (node == null) return [];
  if (typeof node === 'string') return [node.toLowerCase()];
  if (typeof node === 'number' || typeof node === 'boolean') {
    return [String(node).toLowerCase()];
  }
  if (node instanceof Date) return [node.toISOString().toLowerCase()];
  if (typeof node !== 'object') return [];
  if (visited.has(node as object)) return [];
  visited.add(node as object);

  const obj = node as Record<string, unknown>;
  const values: string[] = [];
  if (typeof obj['name'] === 'string') {
    values.push(obj['name'].toLowerCase());
  }
  if ('value' in obj) {
    const value = obj['value'];
    if (Array.isArray(value)) {
      for (const item of value) {
        values.push(...extractSqlTextAndValues(item, visited));
      }
    } else {
      values.push(...extractSqlTextAndValues(value, visited));
    }
  }
  for (const key of ['queryChunks', 'left', 'right', 'conditions']) {
    const child = obj[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        values.push(...extractSqlTextAndValues(item, visited));
      }
    } else {
      values.push(...extractSqlTextAndValues(child, visited));
    }
  }
  return values;
}

function topicProbePayload() {
  return {
    version: 1,
    profileId: '00000000-0000-7000-8000-000000000001',
    sessionId: '00000000-0000-7000-8000-000000000002',
    subjectId: '00000000-0000-7000-8000-000000000003',
    topicId: '00000000-0000-7000-8000-000000000004',
    learnerMessage: 'I know atoms have protons and electrons.',
    topicTitle: 'Atomic structure',
    timestamp: '2026-05-24T10:00:00.000Z',
  };
}

describe('topicProbeExtract onFailure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
  });

  it('[WI-78 review] does not overwrite completed topic-probe extraction status with failed', async () => {
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    mockGetStepDatabase.mockReturnValue({ update });

    const onFailure = (topicProbeExtract as any).opts.onFailure as (args: {
      event: {
        data: {
          event: { data: ReturnType<typeof topicProbePayload> };
          error: { message: string };
        };
      };
      error: Error;
    }) => Promise<void>;
    await onFailure({
      event: {
        data: {
          event: { data: topicProbePayload() },
          error: { message: 'LLM timeout' },
        },
      },
      error: new Error('LLM timeout'),
    });

    expect(where).toHaveBeenCalledTimes(1);
    const whereText = extractSqlTextAndValues(where.mock.calls[0][0]).join(' ');
    expect(whereText).toContain('topicprobeextractionstatus');
    expect(whereText).toContain('completed');
    expect(whereText).toContain('<>');
  });
});
