import { formatMoney, integerMoney } from './money';
import type { TransactionType } from './transaction';

export type MonthSummary = { month: string; income: string; expenses: string; balance: string; incomeCount: string; expenseCount: string };
export type CategoryTotal = { id: string; name: string; type: TransactionType; amount: string; percentage: string };
export type PersonalAnalytics = {
  selected: MonthSummary; previous: MonthSummary | null; trend: MonthSummary[];
  expenses: CategoryTotal[]; income: CategoryTotal[];
};
// Rounded to one decimal percent using exact integer arithmetic. Number conversion
// is reserved for a bounded 0..100 chart width, never financial totals.
export function percentage(part: string, total: string): string {
  const numerator = BigInt(integerMoney(part)), denominator = BigInt(integerMoney(total));
  if (numerator < BigInt(0) || denominator < BigInt(0) || numerator > denominator) throw new Error('Invalid category totals.');
  if (denominator === BigInt(0)) return '0.0';
  const tenths = (numerator * BigInt(1000) + denominator / BigInt(2)) / denominator;
  return `${tenths / BigInt(10)}.${tenths % BigInt(10)}`;
}
export function comparison(current: string, previous: string): string {
  const difference = BigInt(integerMoney(current)) - BigInt(integerMoney(previous));
  if (difference === BigInt(0)) return 'Unchanged from previous month';
  return `${formatMoney(difference < BigInt(0) ? -difference : difference)} ${difference > BigInt(0) ? 'higher' : 'lower'} than previous month`;
}
export function insights(data: PersonalAnalytics): string[] {
  const messages: string[] = [];
  const top = data.expenses[0];
  if (top) {
    const tied = data.expenses.filter((item) => item.amount === top.amount).length > 1;
    messages.push(`${top.name} ${tied ? 'was tied for the highest' : 'was the highest'} spending category this month (${top.percentage}% of expenses).`);
  }
  const previous = data.previous;
  if (previous && data.selected.expenseCount !== '0' && previous.expenseCount !== '0') {
    messages.push(`Expenses: ${comparison(data.selected.expenses, previous.expenses)}.`);
  }
  if (!top && data.selected.incomeCount !== '0') messages.push('Income was recorded this month; no expenses were recorded.');
  return messages;
}
