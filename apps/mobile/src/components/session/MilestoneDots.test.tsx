import { Dimensions } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import {
  MilestoneDots,
  MILESTONE_DOTS_NARROW_BREAKPOINT_PT,
} from './MilestoneDots';

const dimsSpy = jest.spyOn(Dimensions, 'get');
function setWindowWidth(width: number): void {
  dimsSpy.mockReturnValue({ width, height: 800, scale: 2, fontScale: 1 });
}

describe('MilestoneDots', () => {
  beforeEach(() => {
    setWindowWidth(414);
  });
  afterAll(() => {
    dimsSpy.mockRestore();
  });

  it('renders nothing when count is 0', () => {
    const { queryByTestId } = render(<MilestoneDots count={0} />);
    expect(queryByTestId('milestone-dots')).toBeNull();
  });

  it('renders the indicator on wide screens (>= breakpoint)', () => {
    setWindowWidth(MILESTONE_DOTS_NARROW_BREAKPOINT_PT);
    render(<MilestoneDots count={3} />);
    expect(screen.getByLabelText('3 milestones reached')).toBeTruthy();
  });

  it('uses singular label when count is 1', () => {
    render(<MilestoneDots count={1} />);
    expect(screen.getByLabelText('1 milestone reached')).toBeTruthy();
  });

  it('caps the rendered dots at 6 even when count is higher', () => {
    render(<MilestoneDots count={10} />);
    const container = screen.getByTestId('milestone-dots');
    // The container has 6 child dot Views (min(10,6) = 6)
    expect(container.children.length).toBe(6);
  });

  it('[BUG-711] renders nothing on narrow screens (width < breakpoint)', () => {
    setWindowWidth(MILESTONE_DOTS_NARROW_BREAKPOINT_PT - 1);
    const { queryByTestId } = render(<MilestoneDots count={3} />);
    expect(queryByTestId('milestone-dots')).toBeNull();
  });

  it('renders nothing on a 360pt device (the canonical narrow case)', () => {
    setWindowWidth(360);
    const { queryByTestId } = render(<MilestoneDots count={2} />);
    expect(queryByTestId('milestone-dots')).toBeNull();
  });

  it('renders on the boundary width (>= breakpoint)', () => {
    setWindowWidth(MILESTONE_DOTS_NARROW_BREAKPOINT_PT);
    const { getByTestId } = render(<MilestoneDots count={2} />);
    expect(getByTestId('milestone-dots')).toBeTruthy();
  });
});
