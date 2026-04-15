import { render } from '@testing-library/react-native';
import { SessionToolAccessory } from './SessionAccessories';

describe('SessionToolAccessory stage gating', () => {
  const handleQuickChip = jest.fn();

  it('renders Switch topic and Park it when stage is teaching', () => {
    const { queryByTestId } = render(
      <SessionToolAccessory
        isStreaming={false}
        handleQuickChip={handleQuickChip}
        stage="teaching"
      />
    );
    expect(queryByTestId('quick-chip-switch_topic')).toBeTruthy();
    expect(queryByTestId('quick-chip-park')).toBeTruthy();
  });

  it('renders nothing when stage is greeting', () => {
    const { queryByTestId } = render(
      <SessionToolAccessory
        isStreaming={false}
        handleQuickChip={handleQuickChip}
        stage="greeting"
      />
    );
    expect(queryByTestId('quick-chip-switch_topic')).toBeNull();
    expect(queryByTestId('quick-chip-park')).toBeNull();
  });

  it('renders nothing when stage is orienting', () => {
    const { queryByTestId } = render(
      <SessionToolAccessory
        isStreaming={false}
        handleQuickChip={handleQuickChip}
        stage="orienting"
      />
    );
    expect(queryByTestId('quick-chip-switch_topic')).toBeNull();
    expect(queryByTestId('quick-chip-park')).toBeNull();
  });
});
