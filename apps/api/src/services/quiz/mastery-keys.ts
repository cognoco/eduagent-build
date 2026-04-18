// apps/api/src/services/quiz/mastery-keys.ts
import { createHash } from 'crypto';

const ERA_BUCKETS: Record<string, string> = {
  '1st century': '1c',
  '2nd century': '2c',
  '3rd century': '3c',
  '4th century': '4c',
  '5th century': '5c',
  '6th century': '6c',
  '7th century': '7c',
  '8th century': '8c',
  '9th century': '9c',
  '10th century': '10c',
  '11th century': '11c',
  '12th century': '12c',
  '13th century': '13c',
  '14th century': '14c',
  '15th century': '15c',
  '16th century': '16c',
  '17th century': '17c',
  '18th century': '18c',
  '19th century': '19c',
  '20th century': '20c',
  '21st century': '21c',
  '1600s': '17c',
  '1700s': '18c',
  '1800s': '19c',
  '1900s': '20c',
  '2000s': '21c',
  '1600-1699': '17c',
  '1700-1799': '18c',
  '1800-1899': '19c',
  '1900-1999': '20c',
  '1st century bce': 'bce-1c',
  '2nd century bce': 'bce-2c',
  '3rd century bce': 'bce-3c',
  '4th century bce': 'bce-4c',
  '5th century bce': 'bce-5c',
};

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeName(name: string): string {
  return stripDiacritics(name).toLowerCase().trim();
}

export function bucketEra(era: string | null | undefined): string {
  if (!era) return 'unknown';
  const normalized = era.toLowerCase().trim();
  return ERA_BUCKETS[normalized] ?? 'unknown';
}

export function computeGuessWhoItemKey(
  name: string,
  era: string | null | undefined
): string {
  const normalized = normalizeName(name);
  const bucket = bucketEra(era);
  const hash = createHash('sha1')
    .update(`${normalized}|${bucket}`)
    .digest('hex');
  return hash.slice(0, 16);
}

export function computeCapitalsItemKey(country: string): string {
  return country.toLowerCase().trim();
}
