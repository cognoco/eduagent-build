import { isCleanPrintedLocalRead } from './ocr-read-quality';

describe('isCleanPrintedLocalRead', () => {
  it.each([
    'Solve for x: 3x + 7 = 22. Show your working.',
    'Read this and write why the answer is eleven: 5 + 6 = 11.',
    'Explain how photosynthesis helps plants make glucose.',
  ])('trusts clean printed homework: %s', (text) => {
    expect(isCleanPrintedLocalRead(text)).toBe(true);
  });

  it('rejects handwriting-shaped garble with an accidental cue', () => {
    expect(isCleanPrintedLocalRead('how Rad meol 5 bs Homo mino')).toBe(false);
  });

  it('rejects short token-poor reads', () => {
    expect(isCleanPrintedLocalRead('x = 5')).toBe(false);
  });
});
