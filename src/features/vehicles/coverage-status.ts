export const EXPIRING_SOON_DAYS = 30;
export function calendarDay(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.getTime() / 86400000 : null;
}
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export type CoverageStatus = 'Valid' | 'Expiring soon' | 'Expired' | 'Not added' | 'Not started';
export function coverageStatus(expiry: string | null | undefined, start: string | null = null, today = localToday()): CoverageStatus {
  const end = calendarDay(expiry), current = calendarDay(today), beginning = calendarDay(start);
  if (end == null || current == null || (start != null && beginning == null) || (beginning != null && beginning > end)) return 'Not added';
  if (beginning != null && beginning > current) return 'Not started';
  const remaining = end - current;
  if (remaining < 0) return 'Expired';
  return remaining <= EXPIRING_SOON_DAYS ? 'Expiring soon' : 'Valid';
}
export function coverageDate(value: string | null) {
  if (calendarDay(value) == null || !value) return 'Not added';
  const [year, month, day] = value.split('-').map(Number);
  return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]} ${year}`;
}
