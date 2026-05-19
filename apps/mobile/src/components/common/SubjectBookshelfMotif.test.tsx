import { render, screen } from '@testing-library/react-native';
import { SubjectBookshelfMotif } from './SubjectBookshelfMotif';

const TINT = { solid: '#0d9488', soft: 'rgba(13,148,136,0.12)' };

describe('SubjectBookshelfMotif', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <SubjectBookshelfMotif tint={TINT} testID="bookshelf" />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with testID', () => {
    render(<SubjectBookshelfMotif tint={TINT} testID="bookshelf" />);
    screen.getByTestId('bookshelf');
  });

  it('does not use hardcoded rgba(255,255,255,...) backgrounds', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, 'SubjectBookshelfMotif.tsx'),
      'utf8',
    );
    // Bug 169: white rgba overlays must be replaced with semantic tokens
    expect(source).not.toContain('rgba(255,255,255,0.72)');
    expect(source).not.toContain('rgba(255,255,255,0.42)');
  });

  it('uses semantic NativeWind surface token for backgrounds', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, 'SubjectBookshelfMotif.tsx'),
      'utf8',
    );
    expect(source).toContain('bg-surface/72');
    expect(source).toContain('bg-surface/42');
  });
});
