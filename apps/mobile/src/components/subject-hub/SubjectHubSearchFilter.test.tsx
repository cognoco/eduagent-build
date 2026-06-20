import { fireEvent, render, screen } from '@testing-library/react-native';

import { SubjectHubSearchFilter } from './SubjectHubSearchFilter';

jest.mock('react-i18next' /* external i18n boundary */, () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('SubjectHubSearchFilter', () => {
  it('updates the query and exposes a transcription-only voice action', () => {
    const onQueryChange = jest.fn();
    const onVoiceSearch = jest.fn();

    render(
      <SubjectHubSearchFilter
        query=""
        onQueryChange={onQueryChange}
        onVoiceSearch={onVoiceSearch}
      />,
    );

    fireEvent.changeText(screen.getByTestId('subject-hub-search-input'), 'mol');
    expect(onQueryChange).toHaveBeenCalledWith('mol');

    fireEvent.press(screen.getByTestId('search-mic'));
    expect(onVoiceSearch).toHaveBeenCalledWith({
      kind: 'transcription',
      source: 'subject-hub-search',
      analyzesTone: false,
      analyzesEmotion: false,
    });
  });
});
