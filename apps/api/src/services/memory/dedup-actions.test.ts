import { findNewContentTokens } from './dedup-actions';

describe('findNewContentTokens', () => {
  it('allows tokens present in either input', () => {
    expect(findNewContentTokens('cat dog', 'cat', 'dog')).toEqual([]);
  });

  it('allows stopwords regardless of source', () => {
    expect(findNewContentTokens('the cat and the dog', 'cat', 'dog')).toEqual(
      []
    );
  });

  it('flags non-stopword tokens absent from both inputs', () => {
    expect(findNewContentTokens('cat dog elephant', 'cat', 'dog')).toEqual([
      'elephant',
    ]);
  });

  it('is punctuation-tolerant', () => {
    expect(findNewContentTokens("can't reduce!", "can't", 'reduce')).toEqual(
      []
    );
  });
});
