import { render, screen, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { AnalogyDomainPicker } from './AnalogyDomainPicker';

describe('AnalogyDomainPicker', () => {
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all 7 options (6 domains + no preference)', () => {
    render(
      <AnalogyDomainPicker value={null} onSelect={mockOnSelect} />
    );

    expect(screen.getByTestId('analogy-domain-none')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-cooking')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-sports')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-building')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-music')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-nature')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-gaming')).toBeTruthy();
  });

  it('renders the picker container', () => {
    render(
      <AnalogyDomainPicker value={null} onSelect={mockOnSelect} />
    );

    expect(screen.getByTestId('analogy-domain-picker')).toBeTruthy();
  });

  it('shows domain labels', () => {
    render(
      <AnalogyDomainPicker value={null} onSelect={mockOnSelect} />
    );

    expect(screen.getByText('No preference')).toBeTruthy();
    expect(screen.getByText('Cooking')).toBeTruthy();
    expect(screen.getByText('Sports')).toBeTruthy();
    expect(screen.getByText('Building')).toBeTruthy();
    expect(screen.getByText('Music')).toBeTruthy();
    expect(screen.getByText('Nature')).toBeTruthy();
    expect(screen.getByText('Gaming')).toBeTruthy();
  });

  it('shows domain descriptions', () => {
    render(
      <AnalogyDomainPicker value={null} onSelect={mockOnSelect} />
    );

    expect(
      screen.getByText('Recipes, ingredients, kitchen techniques')
    ).toBeTruthy();
    expect(
      screen.getByText('Games, teams, training strategies')
    ).toBeTruthy();
  });

  it('shows Active label on selected domain', () => {
    render(
      <AnalogyDomainPicker value="cooking" onSelect={mockOnSelect} />
    );

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
    render(
      <AnalogyDomainPicker value={null} onSelect={mockOnSelect} />
    );

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
    render(
      <AnalogyDomainPicker value={null} onSelect={mockOnSelect} />
    );

    fireEvent.press(screen.getByTestId('analogy-domain-sports'));
    expect(mockOnSelect).toHaveBeenCalledWith('sports');
  });

  it('calls onSelect with null when "No preference" pressed', () => {
    render(
      <AnalogyDomainPicker value="cooking" onSelect={mockOnSelect} />
    );

    fireEvent.press(screen.getByTestId('analogy-domain-none'));
    expect(mockOnSelect).toHaveBeenCalledWith(null);
  });

  it('shows loading indicator when isLoading is true', () => {
    render(
      <AnalogyDomainPicker
        value={null}
        onSelect={mockOnSelect}
        isLoading
      />
    );

    expect(screen.getByTestId('analogy-domain-loading')).toBeTruthy();
    expect(screen.queryByTestId('analogy-domain-picker')).toBeNull();
  });

  it('does not call onSelect when disabled', () => {
    render(
      <AnalogyDomainPicker
        value={null}
        onSelect={mockOnSelect}
        disabled
      />
    );

    fireEvent.press(screen.getByTestId('analogy-domain-cooking'));
    expect(mockOnSelect).not.toHaveBeenCalled();
  });

  it('treats undefined value same as null (No preference selected)', () => {
    render(
      <AnalogyDomainPicker value={undefined} onSelect={mockOnSelect} />
    );

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
