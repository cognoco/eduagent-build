import { renderToStaticMarkup } from 'react-dom/server';

import { BottomSheet } from './BottomSheet';

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const web = jest.requireActual('react-native-web') as Record<string, unknown>;

  return {
    ...web,
    Modal: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

describe('BottomSheet web accessibility structure', () => {
  it('[WI-2182] renders the dismiss target as a sibling before the named dialog', () => {
    const html = renderToStaticMarkup(
      <BottomSheet
        visible
        onClose={jest.fn()}
        backdropDismissible
        backdropAccessibilityLabel="Close topic picker"
        accessibilityLabel="Topic picker"
      >
        <button type="button">Choose Algebra</button>
        <input aria-label="Topic note" />
      </BottomSheet>,
    );

    const backdropStart = html.indexOf('aria-label="Close topic picker"');
    const backdropEnd = html.indexOf('</button>', backdropStart) + 9;
    const dialogStart = html.indexOf('aria-label="Topic picker"');
    const dialogElementStart = html.lastIndexOf('<div', dialogStart);
    const dialogOpeningEnd = html.indexOf('>', dialogStart);
    const childButtonStart = html.indexOf('<button', dialogStart);
    const inputStart = html.indexOf('aria-label="Topic note"');

    expect(backdropStart).toBeGreaterThanOrEqual(0);
    expect(dialogElementStart).toBe(backdropEnd);
    expect(html.slice(dialogElementStart, dialogOpeningEnd)).toContain(
      'role="dialog"',
    );
    expect(childButtonStart).toBeGreaterThan(dialogStart);
    expect(inputStart).toBeGreaterThan(dialogStart);
  });
});
