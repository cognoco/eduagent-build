import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { OCR_CONSTRAINTS } from '@eduagent/schemas';
import { validationError } from '../errors';
import { startSession, SubjectInactiveError } from '../services/session';
import { getOcrProvider } from '../services/ocr';
import { apiError } from '../errors';
import { ERROR_CODES } from '@eduagent/schemas';

type HomeworkRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string;
  };
};

export const homeworkRoutes = new Hono<HomeworkRouteEnv>()
  // Start a homework help session
  .post('/subjects/:subjectId/homework', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const subjectId = c.req.param('subjectId');

    try {
      const session = await startSession(db, profileId, subjectId, {
        subjectId,
        sessionType: 'homework',
      });
      return c.json({ session }, 201);
    } catch (err) {
      if (err instanceof SubjectInactiveError) {
        return apiError(c, 403, ERROR_CODES.SUBJECT_INACTIVE, err.message);
      }
      throw err;
    }
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

    const imageBuffer = await file.arrayBuffer();
    const provider = getOcrProvider();
    const result = await provider.extractText(imageBuffer, file.type);
    return c.json(result);
  });
