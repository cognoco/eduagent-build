import { render, screen } from '@testing-library/react-native';

import { ChildQuotaLine } from './ChildQuotaLine';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

describe('ChildQuotaLine (momentum)', () => {
  it('renders plural copy when several topics completed', () => {
    render(<ChildQuotaLine totalTopicsCompleted={7} />);

    screen.getByText(/7 topics learned/);
  });

  it('renders singular copy when exactly one topic completed', () => {
    render(<ChildQuotaLine totalTopicsCompleted={1} />);

    screen.getByText(/1 topic learned/);
    expect(screen.queryByText(/topics learned/)).toBeNull();
  });

  it('renders nothing when no topics completed yet', () => {
    const { queryByTestId } = render(
      <ChildQuotaLine totalTopicsCompleted={0} />,
    );

    expect(queryByTestId('home-momentum-line')).toBeNull();
  });

  it('renders nothing when totalTopicsCompleted is null (loading)', () => {
    const { queryByTestId } = render(
      <ChildQuotaLine totalTopicsCompleted={null} />,
    );

    expect(queryByTestId('home-momentum-line')).toBeNull();
  });
});
