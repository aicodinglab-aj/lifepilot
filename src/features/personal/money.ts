export const MAX_AMOUNT_PAISE = 99999999999;

export function parseMoney(input: string): number {
  const value = input.trim();
  // Accept plain digits or correctly grouped Indian amounts; never round invalid input.
  if (!/^(?:\d+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(value)) {
    throw new Error('Enter a valid rupee amount with at most two decimal places (for example 1,250.50).');
  }
  const [whole, fraction = ''] = value.replace(/,/g, '').split('.');
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(paise) || paise <= 0 || paise > MAX_AMOUNT_PAISE) {
    throw new Error('Amount must be greater than zero and at most ₹99,99,99,999.99.');
  }
  return paise;
}

export function moneyInput(paise: number): string {
  if (!Number.isSafeInteger(paise)) throw new Error('Invalid money value.');
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
}

export function integerMoney(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value).toString();
  throw new Error('Invalid money value returned by storage.');
}

export function formatMoney(paise: number | bigint | string): string {
  const value = BigInt(integerMoney(paise)), negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const whole = (absolute / BigInt(100)).toString();
  const tail = whole.slice(-3), head = whole.slice(0, -3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}` : tail;
  const fraction = absolute % BigInt(100);
  return `${negative ? '-' : ''}₹${grouped}${fraction ? `.${fraction.toString().padStart(2, '0')}` : ''}`;
}
