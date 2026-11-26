export const DATE_FORMATS = ['DD-MM-YYYY', 'MM-DD-YYYY', 'YYYY-MM-DD'] as const;
export type DateFormat = typeof DATE_FORMATS[number];
export const DEFAULT_DATE_FORMAT: DateFormat = 'DD-MM-YYYY';

export function isDateFormat(value: unknown): value is DateFormat {
  return DATE_FORMATS.some((format) => format === value);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function formatDate(value: string | null | undefined, format: DateFormat = DEFAULT_DATE_FORMAT): string {
  if (!value || !isIsoDate(value)) return 'Not added';
  const [year, month, day] = value.split('-');
  if (format === 'MM-DD-YYYY') return `${month}-${day}-${year}`;
  if (format === 'YYYY-MM-DD') return `${year}-${month}-${day}`;
  return `${day}-${month}-${year}`;
}

export function parseFormattedDate(value: string, format: DateFormat): string | null {
  const match = format === 'YYYY-MM-DD' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    : /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) return null;
  const [, first, second, third] = match;
  const iso = format === 'YYYY-MM-DD' ? `${first}-${second}-${third}`
    : format === 'MM-DD-YYYY' ? `${third}-${first}-${second}` : `${third}-${second}-${first}`;
  return isIsoDate(iso) ? iso : null;
}

export function formatDateTime(value: string | null | undefined, format: DateFormat = DEFAULT_DATE_FORMAT): string {
  if (!value) return 'Not available';
  if (isIsoDate(value)) return formatDate(value, format);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not available';
  const localDate = `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${formatDate(localDate, format)} ${time}`;
}
