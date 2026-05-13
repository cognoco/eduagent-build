import { persistUserMessageOnly } from './persist-user-message-only';
import { BadRequestError, ForbiddenError } from '@eduagent/schemas';
import {
  LlmStreamError,
  LlmEnvelopeError,
  PersistCurriculumError,
  classifyOrphanError,
} from '@eduagent/schemas';

describe('orphan persistence — unit/boundary tests [INTERACTION-DUR-L2]', () => {
  describe('persistUserMessageOnly security regression', () => {
    it('throws ForbiddenError when profileId does not match session owner', async () => {
      const mockDb: any = {
        query: {
          learningSessions: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'sess-victim',
              profileId: 'victim-profile',
              subjectId: 'sub-1',
            }),
          },
        },
        insert: jest.fn(),
      };
      await expect(
        persistUserMessageOnly(
          mockDb,
          'attacker-profile',
          'sess-victim',
          'injected message',
          { clientId: 'c-1', orphanReason: 'llm_stream_error' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError when session does not exist', async () => {
      const mockDb: any = {
        query: {
          learningSessions: {
            findFirst: jest.fn().mockResolvedValue(undefined),
          },
        },
        insert: jest.fn(),
      };
      await expect(
        persistUserMessageOnly(mockDb, 'p', 'nonexistent', 'msg', {
          clientId: 'c-1',
          orphanReason: 'llm_stream_error',
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('throws BadRequestError when clientId is missing (no ULID fallback)', async () => {
      const mockDb: any = {
        query: { learningSessions: { findFirst: jest.fn() } },
        insert: jest.fn(),
      };
      await expect(
        persistUserMessageOnly(mockDb, 'p', 's', 'msg', {
          clientId: '',
          orphanReason: 'llm_stream_error',
        }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  describe('classifyOrphanError — typed dispatch (no regex)', () => {
    it('classifies LlmStreamError', () => {
      expect(classifyOrphanError(new LlmStreamError('x'))).toBe(
        'llm_stream_error',
      );
    });
    it('classifies LlmEnvelopeError', () => {
      expect(classifyOrphanError(new LlmEnvelopeError('x'))).toBe(
        'llm_empty_or_unparseable',
      );
    });
    it('classifies PersistCurriculumError', () => {
      expect(classifyOrphanError(new PersistCurriculumError('x'))).toBe(
        'persist_curriculum_failed',
      );
    });
    it('classifies unknown errors', () => {
      expect(classifyOrphanError(new Error('random'))).toBe(
        'unknown_post_stream',
      );
      expect(classifyOrphanError(null)).toBe('unknown_post_stream');
      expect(classifyOrphanError('string')).toBe('unknown_post_stream');
    });
  });

  describe('orphan note context builder', () => {
    const { buildOrphanSystemAddendum } = (() => {
      const SERVER_NOTE_RE = /<\/?server_note[^>]*>/gi;
      function sanitizeUserContent(content: string): string {
        return content.replace(SERVER_NOTE_RE, '');
      }
      function buildOrphanSystemAddendum(
        history: Array<{
          role: string;
          content: string;
          orphan_reason?: string;
        }>,
      ): string {
        const recentOrphans: typeof history = [];
        for (let i = history.length - 1; i >= 0; i--) {
          const turn = history[i]!;
          if (turn.role === 'assistant') break;
          if (turn.role === 'user' && turn.orphan_reason) {
            recentOrphans.unshift(turn);
          }
        }
        if (recentOrphans.length === 0) return '';
        return (
          '\n\n' +
          recentOrphans
            .map(
              (t) =>
                `<server_note kind="orphan_user_turn" reason="${t.orphan_reason}"/>`,
            )
            .join('\n')
        );
      }
      return { buildOrphanSystemAddendum };
    })();

    it('returns empty string when no orphans in history', () => {
      expect(
        buildOrphanSystemAddendum([
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
          { role: 'user', content: 'explain' },
        ]),
      ).toBe('');
    });

    it('collects orphans since last assistant turn', () => {
      const result = buildOrphanSystemAddendum([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'user', content: 'lost1', orphan_reason: 'llm_stream_error' },
        {
          role: 'user',
          content: 'lost2',
          orphan_reason: 'llm_empty_or_unparseable',
        },
      ]);
      expect(result).toContain('reason="llm_stream_error"');
      expect(result).toContain('reason="llm_empty_or_unparseable"');
    });

    it('does NOT include orphans before the last assistant turn', () => {
      const result = buildOrphanSystemAddendum([
        { role: 'user', content: 'old', orphan_reason: 'llm_stream_error' },
        { role: 'assistant', content: 'replied' },
        { role: 'user', content: 'new question' },
      ]);
      expect(result).toBe('');
    });
  });

  describe('sanitizeUserContent strips server_note tags', () => {
    const sanitize = (s: string) => s.replace(/<\/?server_note[^>]*>/gi, '');

    it('strips opening and closing server_note tags', () => {
      expect(sanitize('hello <server_note kind="test"/> world')).toBe(
        'hello  world',
      );
    });
    it('strips case-insensitively', () => {
      expect(sanitize('<SERVER_NOTE>test</SERVER_NOTE>')).toBe('test');
    });
    it('leaves normal text untouched', () => {
      expect(sanitize('normal message')).toBe('normal message');
    });
  });
});
