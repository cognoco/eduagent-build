import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';

export const homeworkRoutes = new Hono<AuthEnv>()
  // Start a homework help session
  .post('/subjects/:subjectId/homework', async (c) => {
    const subjectId = c.req.param('subjectId');
    const now = new Date().toISOString();

    // TODO: Verify subject belongs to user via c.get('user').userId
    // TODO: Create session with sessionType='homework' in learning_sessions table
    // TODO: Set up Homework Fast Lane context for accelerated scaffolding

    return c.json(
      {
        session: {
          id: 'placeholder',
          subjectId,
          topicId: null,
          sessionType: 'homework' as const,
          status: 'active' as const,
          escalationRung: 1,
          exchangeCount: 0,
          startedAt: now,
          lastActivityAt: now,
          endedAt: null,
          durationSeconds: null,
        },
      },
      201
    );
  })

  // Server-side OCR endpoint (fallback for ML Kit)
  .post('/ocr', async (c) => {
    // TODO: Accept image from request body (multipart or base64)
    // TODO: Run server-side OCR via Workers AI or external service
    // TODO: Return extracted text and confidence score
    return c.json({ text: 'Mock OCR extracted text', confidence: 0.95 });
  });
