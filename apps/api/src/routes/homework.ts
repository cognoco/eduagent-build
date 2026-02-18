import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';
import { OCR_CONSTRAINTS } from '@eduagent/schemas';
import { validationError } from '../errors';

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
    const body = await c.req.parseBody();
    const file = body['image'];

    if (!(file instanceof File)) {
      return validationError(c, 'Missing required field: image');
    }

    if (
      !OCR_CONSTRAINTS.acceptedMimeTypes.includes(
        file.type as (typeof OCR_CONSTRAINTS.acceptedMimeTypes)[number]
      )
    ) {
      return validationError(
        c,
        `Unsupported file type: ${
          file.type
        }. Accepted: ${OCR_CONSTRAINTS.acceptedMimeTypes.join(', ')}`
      );
    }

    if (file.size > OCR_CONSTRAINTS.maxFileSizeBytes) {
      return validationError(
        c,
        `File too large: ${file.size} bytes. Maximum: ${OCR_CONSTRAINTS.maxFileSizeBytes} bytes (5MB)`
      );
    }

    // TODO: Integrate actual OCR provider (Google Vision / Tesseract / Workers AI)
    return c.json({ text: '', confidence: 0, regions: [] });
  });
