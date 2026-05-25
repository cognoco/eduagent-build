import { withOpacity } from './color-opacity';

describe('withOpacity', () => {
  it('appends alpha byte to 6-digit hex', () => {
    expect(withOpacity('#0d9488', 0.0625)).toBe('#0d948810');
  });

  it('expands and alphas 3-digit hex', () => {
    expect(withOpacity('#abc', 1)).toBe('#aabbccff');
  });

  it('replaces alpha on 8-digit hex', () => {
    expect(withOpacity('#0d9488ff', 0.25)).toBe('#0d948840');
  });

  it('converts rgb(...) to rgba(...)', () => {
    expect(withOpacity('rgb(13, 148, 136)', 0.5)).toBe(
      'rgba(13, 148, 136, 0.5)',
    );
  });

  it('rewrites alpha in rgba(...)', () => {
    expect(withOpacity('rgba(13, 148, 136, 0.9)', 0.1)).toBe(
      'rgba(13, 148, 136, 0.1)',
    );
  });

  it('falls back to original color for unsupported formats', () => {
    expect(withOpacity('oklch(0.7 0.15 180)', 0.5)).toBe('oklch(0.7 0.15 180)');
    expect(withOpacity('white', 0.3)).toBe('white');
  });

  describe('hex digit validation', () => {
    it('valid #abc passes through and expands', () => {
      expect(withOpacity('#abc', 1)).toBe('#aabbccff');
    });

    it('valid #abcdef passes through with alpha', () => {
      expect(withOpacity('#abcdef', 0.5)).toBe('#abcdef80');
    });

    it('valid #abcdef80 replaces alpha byte', () => {
      expect(withOpacity('#abcdef80', 1)).toBe('#abcdefff');
    });

    it('invalid #xyz returns input unchanged with console.warn', () => {
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      expect(withOpacity('#xyz', 0.5)).toBe('#xyz');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('#xyz'));
      warn.mockRestore();
    });

    it('invalid #12 (too short) returns input unchanged with console.warn', () => {
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      expect(withOpacity('#12', 0.5)).toBe('#12');
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('passthrough oklch is returned unchanged (no warning)', () => {
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      expect(withOpacity('oklch(0.7 0.15 180)', 0.5)).toBe(
        'oklch(0.7 0.15 180)',
      );
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  it('clamps alpha to [0,1]', () => {
    expect(withOpacity('#000000', 1.5)).toBe('#000000ff');
    expect(withOpacity('#000000', -0.5)).toBe('#00000000');
  });
});
