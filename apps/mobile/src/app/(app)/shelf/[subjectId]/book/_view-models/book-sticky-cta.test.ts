import { getBookStickyCtaLabel } from './book-sticky-cta';

describe('getBookStickyCtaLabel', () => {
  it('returns null when the book is complete', () => {
    expect(
      getBookStickyCtaLabel({
        isBookComplete: true,
        continueTopicTitle: 'Linear Equations',
        upNextTopicTitle: 'Quadratics',
        newestStartedTopicTitle: 'Geometry',
      }),
    ).toBeNull();
  });

  it('prefers the continue topic title', () => {
    expect(
      getBookStickyCtaLabel({
        isBookComplete: false,
        continueTopicTitle: 'Linear Equations',
        upNextTopicTitle: 'Quadratics',
        newestStartedTopicTitle: 'Geometry',
      }),
    ).toBe('▶ Continue: Linear Equations');
  });

  it('falls back to up-next and then newest started topics', () => {
    expect(
      getBookStickyCtaLabel({
        isBookComplete: false,
        continueTopicTitle: null,
        upNextTopicTitle: 'Quadratics',
        newestStartedTopicTitle: 'Geometry',
      }),
    ).toBe('▶ Start: Quadratics');

    expect(
      getBookStickyCtaLabel({
        isBookComplete: false,
        continueTopicTitle: null,
        upNextTopicTitle: null,
        newestStartedTopicTitle: 'Geometry',
      }),
    ).toBe('▶ Resume: Geometry');
  });

  it('truncates long topic titles at the existing 25 character budget', () => {
    const longTitle = 'A very long topic title that needs trimming';

    expect(
      getBookStickyCtaLabel({
        isBookComplete: false,
        continueTopicTitle: longTitle,
        upNextTopicTitle: null,
        newestStartedTopicTitle: null,
      }),
    ).toBe(`▶ Continue: ${longTitle.slice(0, 24)}...`);
  });
});
