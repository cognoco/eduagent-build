import { render, screen, fireEvent } from '@testing-library/react-native';
import { AnalogyDomainPicker } from './AnalogyDomainPicker';

describe('AnalogyDomainPicker', () => {
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all 7 options (6 domains + no preference)', () => {
    render(<AnalogyDomainPicker value={null} onSelect={mockOnSelect} />);

    screen.getByTestId('analogy-domain-none');
    screen.getByTestId('analogy-domain-cooking');
    screen.getByTestId('analogy-domain-sports');
    screen.getByTestId('analogy-domain-building');
    screen.getByTestId('analogy-domain-music');
    screen.getByTestId('analogy-domain-nature');
    screen.getByTestId('analogy-domain-gaming');
  });

  it('renders the picker container', () => {
    render(<AnalogyDomainPicker value={null} onSelect={mockOnSelect} />);

    screen.getByTestId('analogy-domain-picker');
  });

  it('shows domain labels', () => {
    render(<AnalogyDomainPicker value={null} onSelect={mockOnSelect} />);

    screen.getByText('No preference');
    screen.getByText('Cooking');
    screen.getByText('Sports');
    screen.getByText('Building');
    screen.getByText('Music');
    screen.getByText('Nature');
    screen.getByText('Gaming');
  });

  it('shows domain descriptions', () => {
    render(<AnalogyDomainPicker value={null} onSelect={mockOnSelect} />);

    screen.getByText('Recipes, ingredients, kitchen techniques');
    screen.getByText('Games, teams, training strategies');
  });

  it('shows Active label on selected domain', () => {
    render(<AnalogyDomainPicker value="cooking" onSelect={mockOnSelect} />);

    // Should have exactly one "Active" text
    const activeTexts = screen.getAllByText('Active');
    expect(activeTexts).toHaveLength(1);

    // The Active text should be within the cooking option
    const cookingOption = screen.getByTestId('analogy-domain-cooking');
    const hasActiveInCooking = activeTexts.some((textEl) => {
      let node = textEl.parent;
      while (node) {
        if (node === cookingOption) return true;
        node = node.parent;
      }
      return false;
    });
    expect(hasActiveInCooking).toBe(true);
  });

  it('shows Active on "No preference" when value is null', () => {
    render(<AnalogyDomainPicker value={null} onSelect={mockOnSelect} />);

    const activeTexts = screen.getAllByText('Active');
    expect(activeTexts).toHaveLength(1);

    const noneOption = screen.getByTestId('analogy-domain-none');
    const hasActiveInNone = activeTexts.some((textEl) => {
      let node = textEl.parent;
      while (node) {
        if (node === noneOption) return true;
        node = node.parent;
      }
      return false;
    });
    expect(hasActiveInNone).toBe(true);
  });

  it('calls onSelect with domain when pressed', () => {
    render(<AnalogyDomainPicker value={null} onSelect={mockOnSelect} />);

    fireEvent.press(screen.getByTestId('analogy-domain-sports'));
    expect(mockOnSelect).toHaveBeenCalledWith('sports');
  });

  it('calls onSelect with null when "No preference" pressed', () => {
    render(<AnalogyDomainPicker value="cooking" onSelect={mockOnSelect} />);

    fireEvent.press(screen.getByTestId('analogy-domain-none'));
    expect(mockOnSelect).toHaveBeenCalledWith(null);
  });

  it('shows loading indicator when isLoading is true', () => {
    render(
      <AnalogyDomainPicker value={null} onSelect={mockOnSelect} isLoading />,
    );

    screen.getByTestId('analogy-domain-loading');
    expect(screen.queryByTestId('analogy-domain-picker')).toBeNull();
  });

  it('does not call onSelect when disabled', () => {
    render(
      <AnalogyDomainPicker value={null} onSelect={mockOnSelect} disabled />,
    );

    fireEvent.press(screen.getByTestId('analogy-domain-cooking'));
    expect(mockOnSelect).not.toHaveBeenCalled();
  });

  it('treats undefined value same as null (No preference selected)', () => {
    render(<AnalogyDomainPicker value={undefined} onSelect={mockOnSelect} />);

    const activeTexts = screen.getAllByText('Active');
    expect(activeTexts).toHaveLength(1);

    const noneOption = screen.getByTestId('analogy-domain-none');
    const hasActiveInNone = activeTexts.some((textEl) => {
      let node = textEl.parent;
      while (node) {
        if (node === noneOption) return true;
        node = node.parent;
      }
      return false;
    });
    expect(hasActiveInNone).toBe(true);
  });
});
