import {
  SUBJECT_TINT_PALETTE,
  type SubjectTint,
  type ColorScheme,
} from './design-tokens';

export { SUBJECT_TINT_PALETTE };

function getSubjectTintIndex(subjectId: string, paletteLength: number): number {
  const hex = subjectId.replace(/-/g, '');
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < hex.length; i++) {
    hash ^= hex.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return (hash >>> 0) % paletteLength;
}

export function getSubjectTint(
  subjectId: string,
  colorScheme: ColorScheme,
): SubjectTint {
  const palette = SUBJECT_TINT_PALETTE[colorScheme];
  const index = getSubjectTintIndex(subjectId, palette.length);
  return palette[index] ?? palette[0];
}

export function getSubjectTintMap(
  subjectIds: readonly string[],
  colorScheme: ColorScheme,
): Map<string, SubjectTint> {
  const palette = SUBJECT_TINT_PALETTE[colorScheme];
  const map = new Map<string, SubjectTint>();
  let previousIndex = -1;

  for (const subjectId of subjectIds) {
    if (map.has(subjectId)) continue;

    const preferredIndex = getSubjectTintIndex(subjectId, palette.length);
    let index = preferredIndex;
    if (index === previousIndex && palette.length > 1) {
      index = (preferredIndex + 1) % palette.length;
    }

    map.set(subjectId, palette[index] ?? palette[0]);
    previousIndex = index;
  }

  return map;
}
