// [BUG-498] Format raw minutes into a readable string.
// e.g. 45 → "45 min", 130 → "2h 10m", 240 → "4h"
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatRelativeDate(isoDate: string): string {
  const then = new Date(isoDate);
  if (isNaN(then.getTime())) return '';
  const now = new Date();
  if (then.getTime() > now.getTime()) return 'just now';

  // Use calendar-day diff to align with formatLastPracticed (F-002)
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfThen = new Date(
    then.getFullYear(),
    then.getMonth(),
    then.getDate(),
  );
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfThen.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return 'last week';
  if (diffDays < 30) return `${Math.round(diffDays / 7)} weeks ago`;
  const months = Math.floor(diffDays / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  return `${years}y`;
}

// ---------------------------------------------------------------------------
// Canonical, locale-free time parts. UI presentation (i18n) lives in
// hooks/use-time-format.ts, which maps these parts through t(). Keeping the
// computation pure makes it fully testable and prevents per-screen drift.
// ---------------------------------------------------------------------------

export type RelativeDatePart =
  | { unit: 'today' }
  | { unit: 'yesterday' }
  | { unit: 'days'; value: number } // 2–6
  | { unit: 'lastWeek' } // 7–13 days
  | { unit: 'weeks'; value: number } // 14–29 days → 2–4
  | { unit: 'date'; iso: string }; // >=30 days -> caller renders a formatted date

// Midnight-normalize both dates, then diff whole calendar days. This is the
// more-correct calendar-day diff: the raw-ms Math.floor that several screens
// used had a late-night/DST off-by-one this avoids.
export function getRelativeDateParts(
  isoDate: string,
  now: Date = new Date(),
): RelativeDatePart {
  const then = new Date(isoDate);
  if (isNaN(then.getTime())) return { unit: 'date', iso: isoDate };

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfThen = new Date(
    then.getFullYear(),
    then.getMonth(),
    then.getDate(),
  );
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfThen.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays <= 0) return { unit: 'today' };
  if (diffDays === 1) return { unit: 'yesterday' };
  if (diffDays < 7) return { unit: 'days', value: diffDays };
  if (diffDays < 14) return { unit: 'lastWeek' };
  if (diffDays < 30) return { unit: 'weeks', value: Math.round(diffDays / 7) };
  return { unit: 'date', iso: isoDate };
}

export type DurationPart =
  | { unit: 'none' } // null | <=0
  | { unit: 'under1' } // 0 < seconds < 60
  | { unit: 'minutes'; value: number } // <60 min
  | { unit: 'hoursMinutes'; hours: number; minutes: number }; // ≥60 min

export function getDurationParts(
  seconds: number | null | undefined,
): DurationPart {
  if (seconds == null || seconds <= 0) return { unit: 'none' };
  if (seconds < 60) return { unit: 'under1' };
  const totalMin = Math.max(1, Math.round(seconds / 60));
  if (totalMin < 60) return { unit: 'minutes', value: totalMin };
  return {
    unit: 'hoursMinutes',
    hours: Math.floor(totalMin / 60),
    minutes: totalMin % 60,
  };
}

// Always MM:SS, both sides zero-padded to 2.
export function formatTimer(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
