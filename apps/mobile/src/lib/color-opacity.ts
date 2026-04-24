/**
 * Apply an alpha channel to a theme color token without assuming the token
 * format. Handles 3/6/8-digit hex, rgb(...) and rgba(...). For formats we
 * can't rewrite losslessly (oklch, hsl, named colors) we fall back to the
 * original color — the UI stays visible rather than silently becoming
 * transparent, which is what hex-suffix concatenation would do instead.
 */
export function withOpacity(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const alphaHex = Math.round(a * 255)
    .toString(16)
    .padStart(2, '0');

  const trimmed = color.trim();

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const expanded = hex
        .split('')
        .map((c) => c + c)
        .join('');
      return `#${expanded}${alphaHex}`;
    }
    if (hex.length === 6) {
      return `#${hex}${alphaHex}`;
    }
    if (hex.length === 8) {
      return `#${hex.slice(0, 6)}${alphaHex}`;
    }
    return trimmed;
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i
  );
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  return trimmed;
}
