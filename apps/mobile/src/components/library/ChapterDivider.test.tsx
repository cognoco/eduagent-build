import { render } from '@testing-library/react-native';
import { ChapterDivider } from './ChapterDivider';

describe('ChapterDivider', () => {
  it('renders the chapter name', () => {
    const { getByText } = render(<ChapterDivider name="Beverages" />);
    expect(getByText('Beverages')).toBeTruthy();
  });
});
