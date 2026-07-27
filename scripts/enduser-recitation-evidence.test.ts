import {
  redactPersistedEventForEvidence,
  redactRecitationTextForEvidence,
  redactSourceAuditForEvidence,
} from './enduser-recitation-evidence';

describe('recitation end-user evidence redaction', () => {
  const sensitiveText = 'sensitive learner recitation content';

  it.each(['learner_input', 'assistant_reply', 'quality_snippet'] as const)(
    'replaces recitation %s with a presence marker',
    (kind) => {
      const evidence = redactRecitationTextForEvidence(
        'recitation',
        kind,
        sensitiveText,
      );

      expect(evidence).toContain('present');
      expect(evidence).not.toContain(sensitiveText);
    },
  );

  it('marks absent recitation content without retaining a value', () => {
    expect(
      redactRecitationTextForEvidence('recitation', 'assistant_reply', ''),
    ).toBe('[redacted: assistant reply absent]');
  });

  it('removes content and metadata values from persisted recitation events', () => {
    const event = redactPersistedEventForEvidence('recitation', {
      eventType: 'ai_response',
      content: sensitiveText,
      metadata: { nested: sensitiveText },
      createdAt: '2026-07-20T00:00:00.000Z',
    });

    expect(JSON.stringify(event)).not.toContain(sensitiveText);
    expect(event).toEqual({
      eventType: 'ai_response',
      content: '[redacted: persisted event content present]',
      metadata: { present: true },
      createdAt: '2026-07-20T00:00:00.000Z',
    });
  });

  it('leaves non-recitation evidence unchanged', () => {
    expect(
      redactRecitationTextForEvidence(
        'learning',
        'learner_input',
        sensitiveText,
      ),
    ).toBe(sensitiveText);
    expect(
      redactPersistedEventForEvidence('learning', {
        eventType: 'user_message',
        content: sensitiveText,
        metadata: null,
        createdAt: '2026-07-20T00:00:00.000Z',
      }),
    ).toEqual({
      eventType: 'user_message',
      content: sensitiveText,
      metadata: null,
      createdAt: '2026-07-20T00:00:00.000Z',
    });
  });

  it('removes learner text from nested source-audit evidence', () => {
    const audit = redactSourceAuditForEvidence('recitation', {
      status: 'ok',
      reliedOnSourceIds: ['recitation_text'],
      reliableReliedOnSourceIds: ['recitation_text'],
      unsupportedSourceIds: [],
      availableReliableSourceIds: ['recitation_text'],
      insufficient: false,
      reason: sensitiveText,
      evidence: [
        {
          id: 'recitation_text',
          kind: 'recitation_text',
          reliability: 'learner_provided',
          label: 'Learner recitation',
          excerpt: sensitiveText,
          reliableForFacts: true,
        },
      ],
    });

    expect(JSON.stringify(audit)).not.toContain(sensitiveText);
    expect(audit?.reason).toContain('present');
    expect(audit?.evidence[0]?.excerpt).toContain('present');
  });

  it('leaves non-recitation source audits unchanged', () => {
    const audit = {
      status: 'ok' as const,
      reliedOnSourceIds: [],
      reliableReliedOnSourceIds: [],
      unsupportedSourceIds: [],
      availableReliableSourceIds: [],
      insufficient: false,
      reason: sensitiveText,
      evidence: [],
    };

    expect(redactSourceAuditForEvidence('learning', audit)).toBe(audit);
  });
});
