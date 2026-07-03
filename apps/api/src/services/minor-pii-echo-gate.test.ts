import {
  extractVolunteeredPii,
  detectVolunteeredPiiEcho,
  applyMinorPiiEchoGate,
} from './minor-pii-echo-gate';

// ---------------------------------------------------------------------------
// WI-1348 — server-side minor-PII echo-back reply gate
//
// The break test reproduces a REAL minor-PII echo-back: a 13yo volunteers their
// name + school, and a drifted / jailbroken model echoes them straight back into
// the persisted reply. The gate must strip the echoed PII before it reaches the
// learner. Red-green-revert ritual (documented in the PR body): this test passes
// with the gate; reverting `detectVolunteeredPiiEcho` to `return []` makes the
// break test fail (the PII echoes through); restoring makes it pass again.
//
// Precision half: PII the learner did NOT volunteer, and legitimate curriculum
// content, must pass through untouched — the narrow echo-back scope protects the
// must_answer commitment.
// ---------------------------------------------------------------------------

// The learner's own input — volunteers name, school, and more.
const MINOR_INPUT_NAME_SCHOOL =
  'hi! my name is Ada and I go to Oakwood School. can you help me with my ' +
  'science homework about photosynthesis?';

// A drifted model reply that echoes the volunteered PII back.
const LEAKED_ECHO_REPLY =
  'Nice to meet you, Ada! Photosynthesis is how plants make food from ' +
  "sunlight. I'm sure they teach this well at Oakwood School. Let's start " +
  'with the leaf.';

describe('extractVolunteeredPii', () => {
  it('extracts a volunteered first name from a "my name is" cue', () => {
    expect(extractVolunteeredPii('my name is Ada')).toContain('Ada');
  });

  it('extracts a volunteered school name', () => {
    expect(extractVolunteeredPii('I go to Oakwood School')).toContain(
      'Oakwood School',
    );
  });

  it('extracts a volunteered email, phone, and handle by shape', () => {
    const pii = extractVolunteeredPii(
      'email me at ada@example.com or call 555-123-4567, I am @ada_draws',
    );
    expect(pii).toContain('ada@example.com');
    expect(pii).toContain('@ada_draws');
    expect(pii.some((p) => p.replace(/\D/g, '') === '5551234567')).toBe(true);
  });

  it('extracts a volunteered street address', () => {
    expect(extractVolunteeredPii('I live at 12 Oakwood Street')).toContain(
      '12 Oakwood Street',
    );
  });

  it('does NOT treat a common word after "I am" as a name', () => {
    expect(extractVolunteeredPii('I am tired and confused')).toEqual([]);
  });

  it('does NOT extract short numerals (ages, quantities) as a phone number', () => {
    expect(extractVolunteeredPii('I am 13 and have 3 cats')).toEqual([]);
  });

  it('returns nothing for text with no volunteered PII', () => {
    expect(
      extractVolunteeredPii('can you explain photosynthesis to me?'),
    ).toEqual([]);
  });
});

describe('detectVolunteeredPiiEcho', () => {
  it('detects the reply echoing the volunteered name and school', () => {
    const echoed = detectVolunteeredPiiEcho(
      LEAKED_ECHO_REPLY,
      MINOR_INPUT_NAME_SCHOOL,
    );
    expect(echoed).toContain('Ada');
    expect(echoed).toContain('Oakwood School');
  });

  it('does NOT fire when the reply does not repeat the PII', () => {
    const cleanReply =
      'Great question! Photosynthesis is how plants turn sunlight into food. ' +
      "Let's start with the leaf.";
    expect(
      detectVolunteeredPiiEcho(cleanReply, MINOR_INPUT_NAME_SCHOOL),
    ).toEqual([]);
  });

  it('does NOT fire on curriculum content the learner never volunteered', () => {
    // Learner asked about a historical school; the reply naming it is legitimate.
    const reply =
      'The School of Athens is a famous Renaissance fresco by Raphael.';
    const input = 'tell me about the School of Athens painting';
    // "School of Athens" is not introduced via a PII cue, and the learner did
    // not volunteer it as THEIR school — the narrow echo scope leaves it alone.
    expect(detectVolunteeredPiiEcho(reply, input)).toEqual([]);
  });

  it('does not match a name embedded in a longer word (whole-token only)', () => {
    const reply = 'Adalene is a compound unrelated to you.';
    const input = 'my name is Ada';
    expect(detectVolunteeredPiiEcho(reply, input)).toEqual([]);
  });
});

describe('applyMinorPiiEchoGate', () => {
  it('NEGATIVE-PATH BREAK TEST: redacts volunteered name+school echoed to a minor', () => {
    const result = applyMinorPiiEchoGate(
      LEAKED_ECHO_REPLY,
      MINOR_INPUT_NAME_SCHOOL,
      { isMinor: true },
    );
    expect(result.redacted).toBe(true);
    // The echoed PII must be GONE from the learner-visible + persisted reply.
    expect(result.response).not.toMatch(/\bAda\b/);
    expect(result.response).not.toMatch(/Oakwood School/i);
    // The legitimate teaching content survives (surgical strip, not nuke).
    expect(result.response).toMatch(/[Pp]hotosynthesis/);
    expect(result.response).toMatch(/leaf/);
    expect(result.echoedTerms).toEqual(
      expect.arrayContaining(['Ada', 'Oakwood School']),
    );
  });

  it('(b) minor with no PII echo → passthrough unchanged', () => {
    const cleanReply =
      'Photosynthesis is how plants make food from sunlight. Ready to dive in?';
    const result = applyMinorPiiEchoGate(cleanReply, MINOR_INPUT_NAME_SCHOOL, {
      isMinor: true,
    });
    expect(result.redacted).toBe(false);
    expect(result.response).toBe(cleanReply);
  });

  it('(c) adult → passthrough even when the reply echoes volunteered PII', () => {
    const result = applyMinorPiiEchoGate(
      LEAKED_ECHO_REPLY,
      MINOR_INPUT_NAME_SCHOOL,
      { isMinor: false },
    );
    expect(result.redacted).toBe(false);
    expect(result.response).toBe(LEAKED_ECHO_REPLY);
  });

  it('(d) unknown age → caller passes isMinor:true (fail-closed) → redacts', () => {
    // The caller fails closed on unknown age by passing isMinor:true; the gate
    // then enforces exactly as for a known minor.
    const result = applyMinorPiiEchoGate(
      LEAKED_ECHO_REPLY,
      MINOR_INPUT_NAME_SCHOOL,
      { isMinor: true },
    );
    expect(result.redacted).toBe(true);
    expect(result.response).not.toMatch(/Oakwood School/i);
  });

  it('redacts a volunteered email echoed back to a minor', () => {
    const input = 'my email is ada@example.com';
    const reply = "I'll send it to ada@example.com — is that right?";
    const result = applyMinorPiiEchoGate(reply, input, { isMinor: true });
    expect(result.redacted).toBe(true);
    expect(result.response).not.toMatch(/ada@example\.com/i);
  });
});
