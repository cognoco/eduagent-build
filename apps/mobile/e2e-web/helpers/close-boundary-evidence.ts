export interface CloseBoundaryEvidence {
  close: {
    completed: boolean;
    status: number | null;
    schema: string[];
  };
  postFinishRoute: string;
  recoveryDialogAppeared: boolean;
}

interface CloseBoundaryEvidenceInput {
  closeResponse: { status: number; body: unknown } | null;
  pageUrl: string;
  recoveryDialogAppeared: boolean;
}

function responseSchema(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return [];
  }
  return Object.keys(body).sort();
}

function safeRoute(pageUrl: string): string {
  const url = new URL(pageUrl);
  return url.pathname.replace(
    /^\/session-summary\/[^/]+$/,
    '/session-summary/:sessionId',
  );
}

export function buildCloseBoundaryEvidence(
  input: CloseBoundaryEvidenceInput,
): CloseBoundaryEvidence {
  return {
    close: {
      completed: input.closeResponse !== null,
      status: input.closeResponse?.status ?? null,
      schema: responseSchema(input.closeResponse?.body),
    },
    postFinishRoute: safeRoute(input.pageUrl),
    recoveryDialogAppeared: input.recoveryDialogAppeared,
  };
}
