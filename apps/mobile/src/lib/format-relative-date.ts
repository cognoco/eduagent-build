export function formatRelativeDate(isoDate: string): string {
  const then = new Date(isoDate);
  if (isNaN(then.getTime())) return '';
  const now = new Date();
  if (then.getTime() > now.getTime()) return 'just now';

  // Use calendar-day diff to align with formatLastPracticed (F-002)
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startOfThen = new Date(
    then.getFullYear(),
    then.getMonth(),
    then.getDate()
  );
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfThen.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${diffDays}d`;
  const months = Math.floor(diffDays / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  return `${years}y`;
}
