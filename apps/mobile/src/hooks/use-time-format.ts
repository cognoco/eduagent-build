import { useTranslation } from 'react-i18next';
import {
  getDurationParts,
  getRelativeDateParts,
} from '../lib/format-relative-date';
import { formatShortDate } from '../lib/format-datetime';

// i18n presentation layer over the locale-free parts in
// lib/format-relative-date.ts. Screens call these hooks instead of
// hand-rolling per-screen relative-date / duration formatters.

export function useRelativeDate(): (iso: string) => string {
  const { t, i18n } = useTranslation();
  return (iso: string) => {
    const part = getRelativeDateParts(iso);
    switch (part.unit) {
      case 'today':
        return t('time.relative.today');
      case 'yesterday':
        return t('time.relative.yesterday');
      case 'days':
        return t('time.relative.daysAgo', { count: part.value });
      case 'lastWeek':
        return t('time.relative.lastWeek');
      case 'weeks':
        return t('time.relative.weeksAgo', { count: part.value });
      case 'date': {
        const d = new Date(part.iso);
        const includeYear = d.getFullYear() !== new Date().getFullYear();
        return formatShortDate(part.iso, i18n?.language || undefined, {
          month: 'short',
          day: 'numeric',
          ...(includeYear ? { year: 'numeric' } : {}),
        });
      }
    }
  };
}

export function useDurationLabel(): (
  seconds: number | null | undefined,
) => string {
  const { t } = useTranslation();
  return (seconds) => {
    const part = getDurationParts(seconds);
    switch (part.unit) {
      case 'none':
        return t('time.duration.none');
      case 'under1':
        return t('time.duration.under1');
      case 'minutes':
        return part.value === 1
          ? t('time.duration.minutesOne')
          : t('time.duration.minutes', { count: part.value });
      case 'hoursMinutes':
        return t('time.duration.hoursMinutes', {
          hours: part.hours,
          minutes: part.minutes,
        });
    }
  };
}
