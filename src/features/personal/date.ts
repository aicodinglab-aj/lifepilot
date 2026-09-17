export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month) || !validDate(`${month}-01`)) throw new Error('Enter a valid month as YYYY-MM.');
  const [year, number] = month.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const last = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][number - 1];
  return { start: `${month}-01`, end: `${month}-${last}` };
}
export function displayDate(value: string): string {
  if (!validDate(value)) return value;
  const [year, month, day] = value.split('-').map(Number);
  return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]} ${year}`;
}

export function shiftMonth(month: string, offset: number): string | null {
  monthRange(month);
  if (!Number.isInteger(offset)) throw new Error('Invalid month offset.');
  const [year, number] = month.split('-').map(Number);
  const index = (year - 1) * 12 + number - 1 + offset;
  if (index < 0 || index >= 9999 * 12) return null;
  return `${String(Math.floor(index / 12) + 1).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;
}
export function monthLabel(month: string): string {
  monthRange(month);
  const [year, number] = month.split('-').map(Number);
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][number - 1]} ${year}`;
}
export function trendMonths(month: string): string[] {
  return [-5, -4, -3, -2, -1, 0].map((offset) => shiftMonth(month, offset)).filter((value): value is string => value !== null);
}
