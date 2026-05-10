import {
  SUBJECT_TINT_PALETTE,
  type SubjectTint,
  type ColorScheme,
} from './design-tokens';

export { SUBJECT_TINT_PALETTE };

export function getSubjectTint(
  subjectId: string,
  colorScheme: ColorScheme,
): SubjectTint {
  const palette = SUBJECT_TINT_PALETTE[colorScheme];
  const hex = subjectId.replace(/-/g, '');
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < hex.length; i++) {
    hash ^= hex.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  const index = (hash >>> 0) % palette.length;
  return palette[index] ?? palette[0];
}
