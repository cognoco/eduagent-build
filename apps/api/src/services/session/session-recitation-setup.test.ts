import {
  recitationOpeningForLog,
  readPersistedRecitationSetupState,
  resolveRecitationSetupTransition,
  sanitizeRecitationSourceAudit,
} from './session-recitation-setup';

describe('resolveRecitationSetupTransition', () => {
  it.each([
    'Ozymandias',
    'Ozymandias by Percy Bysshe Shelley',
    'the poem about the lonely cloud and daffodils',
    'Der Erlkönig',
    'Rima LIII de Bécquer',
    'Ja vi elsker dette landet',
    'Lokomotywa Juliana Tuwima',
    'Soneto de Fidelidade',
    '雨ニモマケズ',
    'How Do I Love Thee?',
    'Where the Sidewalk Ends',
    'What a Wonderful World',
    'Can You Feel the Love Tonight',
    'Could You Be Loved',
    "Wouldn't It Be Nice",
    'Which Side Are You On?',
    'When We Were Young',
    'Who Are You?',
    'Who Let the Dogs Out?',
    "Who's Afraid of Virginia Woolf?",
    'Is This It',
    'Are You Experienced?',
    'Do Androids Dream of Electric Sheep?',
    'Should I Stay or Should I Go?',
    'WHERE THE SIDEWALK ENDS',
    '¿Quién teme a Virginia Woolf?',
    'Wer hat Angst vor Virginia Woolf?',
    'Qui a peur de Virginia Woolf ?',
    '“¿Quién se ha llevado mi queso?”',
    '“Wer hat meinen Käse geklaut?”',
    'Gdzie jesteś, Bernadette? by Maria Semple',
  ])('accepts a clear first-turn selection: %s', (message) => {
    expect(
      resolveRecitationSetupTransition({
        effectiveMode: 'recitation',
        message,
      }),
    ).toEqual({
      action: 'invite_to_begin',
      state: { phase: 'ready', clarificationCount: 0 },
    });
  });

  it.each([
    '',
    'okay',
    "I don't know",
    'Can you help me?',
    'Where should I start?',
    'Who are you?',
    'Is this it?',
    'Are you ready?',
    'Do you need help?',
    'Should I start now?',
    '¿Quién eres tú?',
    '¿Cómo estuvo tu día hoy?',
    'Wer bist du wirklich?',
    'Gdzie jest najbliższy przystanek?',
    'O que você quer fazer?',
    'Pourquoi devrais-je commencer maintenant ?',
    'Wie kann ich mein Konto ändern?',
    "What's the weather?",
    'No sé',
    'Ich weiß nicht',
    'Jeg vet ikke',
    'Nie wiem',
    'Não sei',
    'わからない',
    'No tengo idea',
    'What should I recite?',
    "I don't have a title yet",
    '¿No sé?',
    'わからない。',
    'change',
    'I enjoy swimming',
    'please help with my account',
    'some random words here',
    'Bananas are tasty',
    'Estoy listo',
    'Ich bin bereit',
    '準備できた。',
  ])(
    'asks one focused clarification for ambiguous or off-topic input: %s',
    (message) => {
      expect(
        resolveRecitationSetupTransition({
          effectiveMode: 'recitation',
          message,
        }),
      ).toEqual({
        action: 'clarify_selection',
        state: { phase: 'awaiting_selection', clarificationCount: 1 },
      });
    },
  );

  it('redacts recitation source-audit wording while preserving provenance', () => {
    const sensitiveText = 'learner wording must not persist';
    const audit = sanitizeRecitationSourceAudit('recitation', {
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
    expect(audit).toMatchObject({
      status: 'ok',
      reliedOnSourceIds: ['recitation_text'],
      reason: '[redacted: source audit reason present]',
      evidence: [
        {
          id: 'recitation_text',
          excerpt: '[redacted: source evidence excerpt present]',
        },
      ],
    });
  });

  it('leaves non-recitation source audits unchanged', () => {
    const audit = {
      status: 'ok' as const,
      reliedOnSourceIds: [],
      reliableReliedOnSourceIds: [],
      unsupportedSourceIds: [],
      availableReliableSourceIds: [],
      insufficient: false,
      reason: 'ordinary source reason',
      evidence: [],
    };

    expect(sanitizeRecitationSourceAudit('learning', audit)).toBe(audit);
  });

  it.each([
    'I want to leave',
    'please stop',
    '¿Puedo salir?',
    'Ich möchte aufhören.',
    'Jeg vil avslutte.',
    'Chcę wyjść.',
    'Quero sair.',
    'やめたい。',
  ])('recognises a natural leave request before setup: %s', (message) => {
    expect(
      resolveRecitationSetupTransition({
        effectiveMode: 'recitation',
        message,
      }),
    ).toEqual({
      action: 'leave_recitation',
      state: { phase: 'ready', clarificationCount: 0 },
    });
  });

  it.each([
    'I want to hurt myself',
    'An adult asks me for photos and says to keep it secret',
    'There is no food at home',
    'My friend is being hit at home',
    'My teacher touched me inappropriately',
    'My dad hits me',
  ])(
    'keeps a safety disclosure out of recitation setup classification: %s',
    (message) => {
      expect(
        resolveRecitationSetupTransition({
          effectiveMode: 'recitation',
          message,
        }),
      ).toEqual({
        action: 'handle_non_recitation',
        state: { phase: 'awaiting_selection', clarificationCount: 0 },
      });
    },
  );

  it('hard-caps clarification and advances after one unclear reply', () => {
    expect(
      resolveRecitationSetupTransition({
        effectiveMode: 'recitation',
        message: 'still not sure',
        previousState: {
          phase: 'awaiting_selection',
          clarificationCount: 1,
        },
      }),
    ).toEqual({
      action: 'invite_after_cap',
      state: { phase: 'ready', clarificationCount: 1 },
    });
  });

  it('accepts a clear selection supplied after the clarification', () => {
    expect(
      resolveRecitationSetupTransition({
        effectiveMode: 'recitation',
        message: 'If by Rudyard Kipling',
        previousState: {
          phase: 'awaiting_selection',
          clarificationCount: 1,
        },
      }),
    ).toEqual({
      action: 'invite_to_begin',
      state: { phase: 'ready', clarificationCount: 1 },
    });
  });

  it('treats the next ordinary turn as recitation instead of restarting setup', () => {
    expect(
      resolveRecitationSetupTransition({
        effectiveMode: 'recitation',
        message: 'Two roads diverged in a yellow wood',
        previousState: { phase: 'ready', clarificationCount: 0 },
      }),
    ).toEqual({
      action: 'coach_recitation',
      state: { phase: 'ready', clarificationCount: 0 },
    });
  });

  it.each([
    'begin',
    "I'm ready",
    'okay',
    'yes',
    'Estoy listo',
    'Ich bin bereit',
    'Jeg er klar',
    'Jestem gotowy',
    'Estou pronto',
    '準備できた。',
  ])(
    'invites actual recitation after a begin or acknowledgement cue: %s',
    (message) => {
      expect(
        resolveRecitationSetupTransition({
          effectiveMode: 'recitation',
          message,
          previousState: { phase: 'ready', clarificationCount: 0 },
        }),
      ).toEqual({
        action: 'invite_recitation',
        state: { phase: 'ready', clarificationCount: 0 },
      });
    },
  );

  it('recovers a legacy in-progress recitation that predates persisted setup state', () => {
    expect(
      resolveRecitationSetupTransition({
        effectiveMode: 'recitation',
        exchangeCount: 2,
        message: 'Two roads diverged in a yellow wood',
      }),
    ).toEqual({
      action: 'coach_recitation',
      state: { phase: 'ready', clarificationCount: 0 },
    });
  });

  it('allows an explicit selection edit without reopening the setup loop', () => {
    expect(
      resolveRecitationSetupTransition({
        effectiveMode: 'recitation',
        message: 'Actually, change it to If by Rudyard Kipling',
        previousState: { phase: 'ready', clarificationCount: 0 },
      }),
    ).toEqual({
      action: 'invite_to_begin',
      state: { phase: 'ready', clarificationCount: 0 },
    });
  });

  it.each([
    'change',
    'edit',
    'switch',
    'What should I recite?',
    '¿No sé?',
    'Ich weiß nicht',
  ])(
    'asks what to change without treating a command-only edit as a title: %s',
    (message) => {
      expect(
        resolveRecitationSetupTransition({
          effectiveMode: 'recitation',
          message,
          previousState: { phase: 'ready', clarificationCount: 0 },
        }),
      ).toEqual({
        action: 'clarify_edit',
        state: { phase: 'ready', clarificationCount: 0 },
      });
    },
  );

  it('keeps a recitation feedback question in the coaching phase', () => {
    expect(
      resolveRecitationSetupTransition({
        effectiveMode: 'recitation',
        message: 'What did I miss?',
        previousState: { phase: 'ready', clarificationCount: 0 },
      }),
    ).toEqual({
      action: 'coach_recitation',
      state: { phase: 'ready', clarificationCount: 0 },
    });
  });

  it('keeps an unrelated post-ready request out of recitation feedback', () => {
    expect(
      resolveRecitationSetupTransition({
        effectiveMode: 'recitation',
        message: "What's the weather?",
        previousState: { phase: 'ready', clarificationCount: 0 },
      }),
    ).toEqual({
      action: 'handle_non_recitation',
      state: { phase: 'ready', clarificationCount: 0 },
    });
  });

  it('routes a generic post-ready request outside recitation coaching', () => {
    expect(
      resolveRecitationSetupTransition({
        effectiveMode: 'recitation',
        message: 'Tell me a joke',
        previousState: { phase: 'ready', clarificationCount: 0 },
      }),
    ).toEqual({
      action: 'handle_non_recitation',
      state: { phase: 'ready', clarificationCount: 0 },
    });
  });

  it('recognises a supported-language selection edit', () => {
    expect(
      resolveRecitationSetupTransition({
        effectiveMode: 'recitation',
        message: 'Cámbialo a Rima LIII de Bécquer',
        previousState: { phase: 'ready', clarificationCount: 1 },
      }),
    ).toEqual({
      action: 'invite_to_begin',
      state: { phase: 'ready', clarificationCount: 1 },
    });
  });

  it.each([
    'leave',
    'cancel',
    'salir',
    'abbrechen',
    'avbryt',
    'wyjdź',
    'sair',
    'やめる',
    'please stop',
    'I want to leave',
    'やめたい。',
  ])('recognises an explicit leave without reopening setup: %s', (message) => {
    expect(
      resolveRecitationSetupTransition({
        effectiveMode: 'recitation',
        message,
        previousState: { phase: 'ready', clarificationCount: 1 },
      }),
    ).toEqual({
      action: 'leave_recitation',
      state: { phase: 'ready', clarificationCount: 1 },
    });
  });

  it.each(['learning', 'review', 'practice', 'freeform', undefined])(
    'does not create setup state for another session mode: %s',
    (effectiveMode) => {
      expect(
        resolveRecitationSetupTransition({
          effectiveMode,
          message: 'Ozymandias',
        }),
      ).toBeUndefined();
    },
  );
});

describe('readPersistedRecitationSetupState', () => {
  it('restores the latest server-owned phase from assistant-event metadata', () => {
    expect(
      readPersistedRecitationSetupState([
        {
          eventType: 'ai_response',
          metadata: {
            recitationSetup: {
              phase: 'awaiting_selection',
              clarificationCount: 1,
            },
          },
        },
        { eventType: 'user_message', metadata: null },
        {
          eventType: 'ai_response',
          metadata: {
            recitationSetup: { phase: 'ready', clarificationCount: 1 },
          },
        },
      ]),
    ).toEqual({ phase: 'ready', clarificationCount: 1 });
  });

  it('ignores malformed and non-assistant metadata', () => {
    expect(
      readPersistedRecitationSetupState([
        {
          eventType: 'user_message',
          metadata: {
            recitationSetup: { phase: 'ready', clarificationCount: 0 },
          },
        },
        {
          eventType: 'ai_response',
          metadata: {
            recitationSetup: {
              phase: 'unknown',
              clarificationCount: 99,
            },
          },
        },
      ]),
    ).toBeUndefined();
  });
});

describe('recitationOpeningForLog', () => {
  it('replaces a recitation opening with a presence marker', () => {
    const opening = 'learner recitation repeated by the assistant';
    const logged = recitationOpeningForLog('recitation', opening);

    expect(logged).toBe('[redacted: assistant opening present]');
    expect(logged).not.toContain(opening);
  });

  it('preserves the existing monitoring value outside recitation', () => {
    expect(recitationOpeningForLog('learning', 'plain opening')).toBe(
      'plain opening',
    );
  });
});
