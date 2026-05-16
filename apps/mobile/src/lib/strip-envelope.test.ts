// ---------------------------------------------------------------------------
// stripEnvelopeJson — render-boundary defense against full LLM envelope JSON
// reaching the chat bubble. Mirrors the API-side projectAiResponseContent
// pattern (apps/api/src/services/llm/project-response.ts) but operates on the
// mobile rendering side, so any path that bypasses the existing two layers
// (server-side parseExchangeEnvelope on persistence + projectAiResponseContent
// on transcript hydration) is still caught before display.
// ---------------------------------------------------------------------------

import { stripEnvelopeJson } from './strip-envelope';

describe('stripEnvelopeJson', () => {
  describe('plain text passthrough', () => {
    it('returns plain prose unchanged', () => {
      const text = 'Hello! How are you today?';
      expect(stripEnvelopeJson(text)).toBe(text);
    });

    it('returns markdown text unchanged', () => {
      const text = '**Bold** and _italic_ and `code` text.';
      expect(stripEnvelopeJson(text)).toBe(text);
    });

    it('returns empty string unchanged', () => {
      expect(stripEnvelopeJson('')).toBe('');
    });

    it('returns whitespace-only string unchanged', () => {
      expect(stripEnvelopeJson('   \n  ')).toBe('   \n  ');
    });

    it('returns text mentioning the word reply unchanged', () => {
      const text = 'Sure, I can reply to that question.';
      expect(stripEnvelopeJson(text)).toBe(text);
    });

    it('returns JSON-shaped text without reply key unchanged', () => {
      const text = '{"hello": "world"}';
      expect(stripEnvelopeJson(text)).toBe(text);
    });

    it('strips a copied envelope side-channel from prose before rendering', () => {
      const text =
        'Who did the actual farming?","signals":{"partial_progress":false,"needs_deepening":false,"understanding_check":true},"ui_hints":{"note_prompt":{"show":false,"post_session":false}}}';
      expect(stripEnvelopeJson(text)).toBe('Who did the actual farming?');
    });

    it('strips a confidence-only side-channel from prose before rendering', () => {
      expect(stripEnvelopeJson('Nice work!","confidence":"low"}')).toBe(
        'Nice work!',
      );
    });

    it('leaves prose that merely teaches about a signals field unchanged', () => {
      const text =
        'In this JSON example, "signals": means clues that point to an answer.';
      expect(stripEnvelopeJson(text)).toBe(text);
    });

    it('leaves JSON teaching prose about partial_progress unchanged', () => {
      const text =
        'For example, "signals":{"partial_progress":false} means we still need more practice.';
      expect(stripEnvelopeJson(text)).toBe(text);
    });
  });

  describe('full envelope extraction (BUG-941)', () => {
    it('strips full envelope JSON down to the reply field — exact BUG-941 trigger', () => {
      // The exact JSON the user observed leaking into the chat bubble
      // (Italian Greetings session, Step-by-step per-message tool tap):
      const envelope =
        '{"reply":"Very close! The letters \'gi\' together make a \'j\' sound, like in \'jungle\'. So it\'s \'Buon-JOR-noh\'. Try saying \'Buongiorno\' one more time.","signals":{"partial_progress":true,"needs_deepening":false,"understanding_check":false},"ui_hints":{"note_prompt":{"show":false,"post_session":false},"fluency_drill":{"active":false,"duration_s":0,"score":{"correct":0,"total":0}}}}';
      expect(stripEnvelopeJson(envelope)).toBe(
        "Very close! The letters 'gi' together make a 'j' sound, like in 'jungle'. So it's 'Buon-JOR-noh'. Try saying 'Buongiorno' one more time.",
      );
    });

    it('strips a minimal envelope that has reply + signals', () => {
      // CR-PR129-M7: bare {"reply":"x"} is ambiguous; require a sibling key.
      const envelope = '{"reply":"Hello there","signals":{}}';
      expect(stripEnvelopeJson(envelope)).toBe('Hello there');
    });

    it('strips an envelope where reply is not the first key', () => {
      const envelope =
        '{"signals":{"partial_progress":false},"reply":"Some answer","ui_hints":{}}';
      expect(stripEnvelopeJson(envelope)).toBe('Some answer');
    });

    it('strips an envelope wrapped in markdown JSON code fence', () => {
      const envelope =
        '```json\n{"reply":"Hello world","signals":{"partial_progress":false}}\n```';
      expect(stripEnvelopeJson(envelope)).toBe('Hello world');
    });

    it('strips an envelope wrapped in plain markdown code fence (with sibling key)', () => {
      // CR-PR129-M7: bare {"reply":"x"} is ambiguous; require a sibling key.
      const envelope = '```\n{"reply":"Hello world","signals":{}}\n```';
      expect(stripEnvelopeJson(envelope)).toBe('Hello world');
    });

    it('preserves leading/trailing whitespace boundaries on extracted reply', () => {
      const envelope = '  {"reply":"Trimmed reply","signals":{}}  ';
      expect(stripEnvelopeJson(envelope)).toBe('Trimmed reply');
    });

    it('strips a copied envelope side-channel from an extracted reply', () => {
      const envelope = JSON.stringify({
        reply:
          'Who did the actual farming?","signals":{"partial_progress":false,"needs_deepening":false,"understanding_check":true},"ui_hints":{"note_prompt":{"show":false,"post_session":false}}}',
        signals: {
          partial_progress: false,
          needs_deepening: false,
          understanding_check: true,
        },
      });
      expect(stripEnvelopeJson(envelope)).toBe('Who did the actual farming?');
    });
  });

  describe('newline/escape normalization', () => {
    it('decodes \\n in the reply to a real newline', () => {
      const envelope = '{"reply":"Line one\\nLine two","signals":{}}';
      expect(stripEnvelopeJson(envelope)).toBe('Line one\nLine two');
    });

    it('decodes \\t in the reply to a tab', () => {
      const envelope = '{"reply":"Tab\\there","signals":{}}';
      expect(stripEnvelopeJson(envelope)).toBe('Tab\there');
    });

    it('decodes \\\\ in the reply to a single literal backslash', () => {
      // Source JSON: {"reply":"path\\here","signals":{}} (with required sibling key)
      const envelope = '{"reply":"path\\\\here","signals":{}}';
      expect(stripEnvelopeJson(envelope)).toBe('path\\here');
    });
  });

  describe('partial / malformed envelope safety', () => {
    it('returns the original string when JSON parse fails (no reply candidate)', () => {
      // Truncated envelope — neither parses cleanly nor offers a reply field
      const truncated = '{"reply":"Half a sent';
      expect(stripEnvelopeJson(truncated)).toBe(truncated);
    });

    it('returns the original string when JSON has no reply key', () => {
      const noReply = '{"signals":{"foo":true}}';
      expect(stripEnvelopeJson(noReply)).toBe(noReply);
    });

    it('returns the original string when reply is not a string', () => {
      const objectReply = '{"reply":{"nested":"object"}}';
      expect(stripEnvelopeJson(objectReply)).toBe(objectReply);
    });

    it('returns the original string when reply is empty', () => {
      // Empty reply means the envelope provided no usable text. Surface the
      // raw string so triage can spot it instead of silently swallowing.
      const emptyReply = '{"reply":""}';
      expect(stripEnvelopeJson(emptyReply)).toBe(emptyReply);
    });

    it('returns the original when input only opens a brace without closing', () => {
      const open = '{"reply":';
      expect(stripEnvelopeJson(open)).toBe(open);
    });
  });

  describe('schema-invalid but extractable envelope', () => {
    it('returns original when envelope has unrecognised top-level keys [CR-PR129-M7]', () => {
      // CR-PR129-M7: Unknown keys mean we cannot safely distinguish a leaked
      // envelope from arbitrary JSON (e.g. a teaching example). Return raw.
      const envelope =
        '{"reply":"Still good","signals":{"partial_progress":false},"future_field":42}';
      expect(stripEnvelopeJson(envelope)).toBe(envelope);
    });

    it('extracts reply when fluency_drill has invalid duration_s (zod min(15) violation)', () => {
      // Mirrors the BUG-934 leak path on the API side — structurally JSON
      // with reply, but Zod rejects it. We still want the reply extracted
      // because all top-level keys (reply, ui_hints) are known envelope keys.
      const envelope =
        '{"reply":"Drill answer","ui_hints":{"fluency_drill":{"active":true,"duration_s":0,"score":{"correct":0,"total":0}}}}';
      expect(stripEnvelopeJson(envelope)).toBe('Drill answer');
    });
  });

  describe('prose-containing-JSON passthrough [CR-PR129-M7]', () => {
    it('does not strip prose that merely contains a JSON fragment with a reply field', () => {
      // Lesson message teaching JSON format — must NOT be rewritten.
      const text =
        'Here is an example: {"reply": "hi"} — that is what an envelope looks like.';
      expect(stripEnvelopeJson(text)).toBe(text);
    });

    it('does not strip a multi-paragraph message that includes a quoted JSON example', () => {
      const text =
        'When a language model returns an envelope, it looks like this:\n\n```\n{"reply":"Hello","signals":{}}\n```\n\nThe `reply` field holds the visible text.';
      expect(stripEnvelopeJson(text)).toBe(text);
    });

    it('does not strip a bare JSON object whose only key is reply (could be any JSON)', () => {
      // {"reply":"x"} with no sibling envelope keys is indistinguishable from
      // arbitrary JSON — it does NOT have enough signal to confirm it is a
      // leaked envelope, so we leave it alone.
      const text = '{"reply":"Just a bare object with unknown purpose"}';
      expect(stripEnvelopeJson(text)).toBe(text);
    });
  });
});
