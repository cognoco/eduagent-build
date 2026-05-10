// ---------------------------------------------------------------------------
// SessionModals — accessibility regression tests (BUG-647 [ACC-3])
// ---------------------------------------------------------------------------
// The ParkingLot modal exposes a multi-line text input. WCAG 2.1 SC 1.3.1
// (Info and Relationships) requires every interactive control to expose its
// purpose programmatically. Without an accessibilityLabel, TalkBack /
// VoiceOver speak the placeholder once and then silence — leaving screen-
// reader users with no way to identify the field after focus moves.
// ---------------------------------------------------------------------------

import { render } from '@testing-library/react-native';
import { ParkingLotModal } from './SessionModals';

const noopProps = {
  visible: true,
  onClose: jest.fn(),
  parkingLotDraft: '',
  setParkingLotDraft: jest.fn(),
  handleSaveParkingLot: jest.fn().mockResolvedValue(undefined),
  // Both hooks are typed as RQ result objects in the component, but the
  // modal only reads `.isPending` from addParkingLotItem and treats
  // parkingLot.data as an array. Stub both shapes minimally.
  parkingLot: {
    data: [],
    isPending: false,
    isLoading: false,
  } as unknown as Parameters<typeof ParkingLotModal>[0]['parkingLot'],
  addParkingLotItem: {
    isPending: false,
  } as unknown as Parameters<typeof ParkingLotModal>[0]['addParkingLotItem'],
  insetsBottom: 0,
};

describe('ParkingLotModal accessibility (BUG-647 [ACC-3])', () => {
  it('[BREAK] exposes the input with an accessibilityLabel screen readers can announce', () => {
    const { getByTestId } = render(<ParkingLotModal {...noopProps} />);
    const input = getByTestId('parking-lot-input');
    // Removing the label is the regression we're guarding against — the
    // pre-fix code had no accessibilityLabel, so a screen reader would only
    // announce the visible placeholder once and then stay silent.
    expect(input.props.accessibilityLabel).toBe('Parking lot note');
  });

  it('exposes a hint that explains the field purpose', () => {
    const { getByTestId } = render(<ParkingLotModal {...noopProps} />);
    const input = getByTestId('parking-lot-input');
    expect(input.props.accessibilityHint).toBe(
      'Type a question or idea you want to come back to later',
    );
  });
});
