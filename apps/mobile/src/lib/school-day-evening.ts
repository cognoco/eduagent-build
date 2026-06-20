import { getTimeOfDay } from './greeting';

/**
 * School-day-evening heuristic for the Mentor home homework highlight (S1 T11).
 *
 * True on a weekday (Mon–Fri) during the afternoon or evening — the window
 * where a learner is most likely to have homework in hand. Calm signal only;
 * it surfaces a non-coercive prompt, never a reminder/streak/loss nudge.
 */
export function isSchoolDayEvening(now: Date = new Date()): boolean {
  const day = now.getDay(); // 0 = Sunday … 6 = Saturday
  const isWeekday = day >= 1 && day <= 5;
  if (!isWeekday) return false;
  const timeOfDay = getTimeOfDay(now);
  return timeOfDay === 'afternoon' || timeOfDay === 'evening';
}
