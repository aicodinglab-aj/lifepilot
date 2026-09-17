import type { SQLiteDatabase } from 'expo-sqlite';
import { monthRange, trendMonths } from '@/features/personal/date';
import { integerMoney } from '@/features/personal/money';
import { percentage, type CategoryTotal, type MonthSummary, type PersonalAnalytics } from '@/features/personal/analytics';
import type { TransactionType } from '@/features/personal/transaction';

export async function getPersonalAnalytics(db: SQLiteDatabase, month: string): Promise<PersonalAnalytics> {
  const months = trendMonths(month), selectedRange = monthRange(month);
  const start = monthRange(months[0]).start;
  // One statement gives category percentages and monthly totals one SQLite read
  // snapshot, even if a save commits concurrently. Only aggregate rows cross the
  // bridge: at most 12 month/type rows plus selected-month active categories.
  const rows = await db.getAllAsync<{ kind: string; bucket: string; name: string; type: TransactionType; amount: string; count: string }>(`
    SELECT * FROM (
      SELECT 'month' AS kind, substr(transaction_date, 1, 7) AS bucket, '' AS name, type,
        CAST(SUM(amount) AS TEXT) AS amount, CAST(COUNT(*) AS TEXT) AS count
      FROM personal_transactions WHERE transaction_date BETWEEN ? AND ?
      GROUP BY substr(transaction_date, 1, 7), type
      UNION ALL
      SELECT 'category', c.id, c.name, t.type, CAST(SUM(t.amount) AS TEXT), CAST(COUNT(*) AS TEXT)
      FROM personal_transactions t JOIN personal_categories c ON c.id = t.category_id AND c.type = t.type
      WHERE t.transaction_date BETWEEN ? AND ?
      GROUP BY c.id, c.name, t.type
    ) ORDER BY CAST(amount AS INTEGER) DESC, name COLLATE NOCASE, bucket`,
  [start, selectedRange.end, selectedRange.start, selectedRange.end]);
  const monthly = rows.filter((row) => row.kind === 'month');
  const categories = rows.filter((row) => row.kind === 'category');
  const trend: MonthSummary[] = months.map((key) => {
    const rows = monthly.filter((row) => row.bucket === key);
    const income = rows.find((row) => row.type === 'income'), expenses = rows.find((row) => row.type === 'expense');
    const incomeAmount = integerMoney(income?.amount ?? '0'), expenseAmount = integerMoney(expenses?.amount ?? '0');
    return { month: key, income: incomeAmount, expenses: expenseAmount,
      balance: (BigInt(incomeAmount) - BigInt(expenseAmount)).toString(),
      incomeCount: integerMoney(income?.count ?? '0'), expenseCount: integerMoney(expenses?.count ?? '0') };
  });
  const selected = trend[trend.length - 1];
  const breakdown: CategoryTotal[] = categories.map((row) => ({ id: row.bucket, name: row.name, type: row.type, amount: integerMoney(row.amount),
    percentage: percentage(integerMoney(row.amount), row.type === 'expense' ? selected.expenses : selected.income) }));
  return { selected, previous: trend.at(-2) ?? null, trend,
    expenses: breakdown.filter((row) => row.type === 'expense'), income: breakdown.filter((row) => row.type === 'income') };
}
