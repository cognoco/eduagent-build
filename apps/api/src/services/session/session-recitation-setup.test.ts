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
    'if by Rudyard Kipling',
    'ozymandias by Percy Bysshe Shelley',
    'yesterday by The Beatles',
    'summer song by My Friend',
    'something wicked this way comes by Ray Bradbury',
    'random acts by The Band',
    'smells like teen spirit by Nirvana',
    'bridge over troubled water by simon & garfunkel',
    'all the small things by Blink-182',
    'back in black by ac/dc',
    'All You Need Is Love',
    'As You Like It',
    'Love Is All Around',
    'There Is a Light That Never Goes Out',
    'Smells Like Teen Spirit',
    '"Tempo Perdido"',
    'Tempo Perdido',
    'Conta Comigo',
    'My Way',
    'Your Song',
    'I, Robot',
    'The Help',
    'I Have a Dream',
    'I Am Legend',
    'I Want You',
    'I Dreamed a Dream',
    'I See the Light',
    'I Walk the Line',
    'We the People',
    'Hamlet by Shakespeare',
    'Dune by Herbert',
    'If by Kipling',
    'One by Metallica',
    'I Am Legend by Richard Matheson',
    'There Is a Light That Never Goes Out by The Smiths',
    'Numb by Linkin Park',
    'In the End by Linkin Park',
    'the poem about the lonely cloud and daffodils',
    'Der Erlkönig',
    'Rima LIII de Bécquer',
    'Ja vi elsker dette landet',
    'Lokomotywa Juliana Tuwima',
    'Soneto de Fidelidade',
    '雨ニモマケズ',
    '「雨ニモマケズ」',
    'rima liii de Bécquer',
    'der erlkönig von Johann Wolfgang Goethe',
    'lokomotywa przez Julian Tuwim',
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
    'What If?',
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
    'hvorfor',
    'czemu',
    'porque',
    'thanks',
    'What If',
    'Need Help',
    'Please Help',
    'I Need Help',
    'Need Money',
    'My Homework',
    '今日は学校に行きます',
    '今日は学校に行く',
    '学校に行こう',
    '友達と遊びたい',
    'the road not taken',
    'where the sidewalk ends',
    'where the nearest store',
    'where the bus stops',
    'do not go gentle into that good night',
    'because i could not stop for death',
    'dulce et decorum est',
    'quiero comprar zapatos',
    'wir gehen nach hause',
    'jeg vil spille fotball',
    'lubię grać w piłkę',
    'quero comprar sapatos',
    'la comida está lista',
    'el autobús llega tarde',
    'la configuración no funciona',
    'el clima está bien',
    'le compte ne marche pas',
    'die einstellungen funktionieren nicht',
    'o tempo está bom',
    'Qué debo recitar',
    'Que dois-je réciter',
    'Co mam recytować',
    '何を暗唱すればいい',
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
    'please stop by the store',
    'Please stop by Costco',
    'I was inspired by Maya',
    'come by tomorrow',
    'vamos de compras',
    'je viens de paris',
    'ich komme von berlin',
    'idę przez park',
    'feito por mim',
    'if by rudyard kipling',
    'ozymandias by percy bysshe shelley',
    'yesterday by the beatles',
    'summer song by my friend',
    'something wicked this way comes by ray bradbury',
    'random acts by the band',
    'walk by sunset',
    'pass by noon',
    'made by hand',
    'written by me',
    'driven by fear',
    'vivimos de pan',
    'vengo de casa',
    'viajo por trabajo',
    'reise von berlin',
    'come by 2 pm',
    'come by monday morning',
    'walk by sunset boulevard',
    'made by hand-crafted',
    'sit by the old tree',
    'meet me by central station',
    'Ich komme von Berlin',
    'Je viens de Paris',
    'Idę przez Central Park',
    'Viajo por Trabajo Remoto',
    'some random words by the river',
    'Come by Monday',
    'Come by Monday morning',
    'Walk by Sunset',
    'Walk by Sunset Boulevard',
    'Meet me by Central Station',
    'Sit by The Old Tree',
    'Made by Hand',
    'Written by Me',
    'Driven by Fear',
    'Come by bus/train',
    'Komm nach Hause',
    'Vamos de Compras',
    'Quiero Comprar Zapatos',
    'Lubię Grać W Piłkę',
    'arrive by Monday',
    'finish by Friday',
    'park by Central Station',
    'Built by Google',
    'Sent by Alice',
    'Powered by Google',
    'Built by Google Cloud',
    'Sent by Alice Cooper',
    'Powered by Google Cloud',
    'Finish by Christmas Eve',
    'finish by next Monday',
    'arrive by 5 PM',
    'park by Union Station',
    'On va à Paris',
    'Er geht nach Hause',
    'Ella va a casa',
    'Hun går hjem',
    'Ona idzie do domu',
    'Ela vai para casa',
    'Vengo de Madrid',
    'Feito por Mim',
    'Idziemy przez Park',
    'Reise von Berlin',
    'これは何',
    'これは何ですか',
    '元気ですか',
    '天気がいい',
    '助けてください',
    '名前は何',
    'これは誰',
    'これはどこ',
    'これはいつ',
    'どれが好き',
    'This was designed by Alice',
    'It was written by Alice',
    'The app was designed by Alice',
    'This app was made by Google',
    'Das wurde von Google gebaut',
    'Esto fue creado por Google',
    'Dette ble laget av Google',
    'To zostało stworzone przez Google',
    'Isto foi criado por Google',
    'This looks designed by Alice',
    'The app seems designed by Alice',
    'This got made by Google',
    'This appears written by Alice',
    'Das ist von Google gebaut',
    'Esto está creado por Google',
    'Dette er laget av Google',
    'To jest stworzone przez Google',
    'Isto está criado por Google',
    'Hosted by Google Cloud',
    'Published by Penguin Random House',
    'Edited by John Smith',
    'creado por Google Cloud',
    'gebaut von Google Cloud',
    'laget av Google Cloud',
    'napisane przez Jan Kowalski',
    '助けてほしい',
    '名前を教えて',
    '天気が悪い',
    'お腹が空いた',
    'I Want More Money',
    'I Am Very Hungry',
    'I Have Homework Today',
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

  it.each([
    'Actually, change it to If by Rudyard Kipling',
    'switch to Ozymandias',
    'actually, switch to Ozymandias',
    'edit Ozymandias',
    'switch my selection to Ozymandias',
    'I would rather Ozymandias',
    'I would rather do Ozymandias',
    'Actually, I would rather do Ozymandias',
    'I’d rather Ozymandias',
    "I'd rather Ozymandias",
    'can we switch to Ozymandias',
    'change the selection to Ozymandias',
    'please switch to Ozymandias',
    'could we switch to Ozymandias',
    'please edit Ozymandias',
    'could we edit Ozymandias',
    'I want to switch to Ozymandias',
    'use Ozymandias instead',
    'please use Ozymandias instead',
    "let's do Ozymandias",
    'Let’s do Ozymandias',
    'let us do Ozymandias',
    'prefiero Ozymandias',
    'cambiar Ozymandias',
    'ändern zu Der Erlkönig',
    'wechseln Der Erlkönig',
    'lieber Der Erlkönig',
    'bytt til Ja vi elsker dette landet',
    'endre Ja vi elsker dette landet',
    'heller Ja vi elsker dette landet',
    'wolę Lokomotywa Juliana Tuwima',
    'zmień Lokomotywa Juliana Tuwima',
    'prefiro Soneto de Fidelidade',
    'mudar Soneto de Fidelidade',
    '変更 「雨ニモマケズ」',
    '変えて 「雨ニモマケズ」',
    '代わりに 「雨ニモマケズ」',
  ])(
    'allows an explicit selection edit without reopening the setup loop: %s',
    (message) => {
      expect(
        resolveRecitationSetupTransition({
          effectiveMode: 'recitation',
          message,
          previousState: { phase: 'ready', clarificationCount: 0 },
        }),
      ).toEqual({
        action: 'invite_to_begin',
        state: { phase: 'ready', clarificationCount: 0 },
      });
    },
  );

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
    'stop recitation',
    'please cancel',
    'cancel recitation',
    'please cancel recitation',
    'stop the recitation',
    'exit recitation',
    'leave recitation',
    'please exit',
    'please leave',
    'go back',
    'bye',
    'goodbye',
    'quit',
    'quit recitation',
    'end recitation',
    'I am done',
    'I want to stop reciting',
    "I'm done",
    'I’m done',
    'I want to quit',
    'I would like to quit',
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
