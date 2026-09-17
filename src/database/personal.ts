import type { SQLiteDatabase } from 'expo-sqlite';
import { validateTransaction, type Category, type Transaction, type TransactionInput, type TransactionType } from '@/features/personal/transaction';
import { localToday, monthRange } from '@/features/personal/date';
import { integerMoney, MAX_AMOUNT_PAISE } from '@/features/personal/money';

export const PERSONAL_PAGE_SIZE = 40;
const columns = `t.id, t.type, t.amount, t.category_id AS categoryId, c.name AS categoryName,
  t.transaction_date AS transactionDate, t.description, t.payment_method AS paymentMethod, t.notes,
  t.created_at AS createdAt, t.updated_at AS updatedAt`;
const joined = 'personal_transactions t JOIN personal_categories c ON c.id = t.category_id AND c.type = t.type';
export function getCategories(db: SQLiteDatabase) {
  return db.getAllAsync<Category>('SELECT id, name, type, is_system AS isSystem FROM personal_categories ORDER BY type, name');
}
function checkedTransaction(row: Transaction): Transaction {
  const amount = Number(integerMoney(row.amount));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT_PAISE) throw new Error('Invalid transaction amount returned by storage.');
  const id = Number(integerMoney(row.id));
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid transaction ID returned by storage.');
  return { ...row, amount, id };
}
export async function getTransaction(db: SQLiteDatabase, id: number) {
  const row = await db.getFirstAsync<Transaction>(`SELECT ${columns} FROM ${joined} WHERE t.id = ?`, [id]);
  return row ? checkedTransaction(row) : null;
}
export async function saveTransaction(db: SQLiteDatabase, input: TransactionInput, id?: number) {
  const draft = validateTransaction(input, await getCategories(db));
  const now = new Date().toISOString();
  const values = [draft.type, draft.amount, draft.categoryId, draft.transactionDate, draft.description, draft.paymentMethod, draft.notes, now];
  if (id !== undefined) {
    const result = await db.runAsync(`UPDATE personal_transactions SET type = ?, amount = ?, category_id = ?,
      transaction_date = ?, description = ?, payment_method = ?, notes = ?, updated_at = ? WHERE id = ?`, [...values, id]);
    if (result.changes !== 1) throw new Error('This transaction no longer exists.');
    return id;
  }
  const result = await db.runAsync(`INSERT INTO personal_transactions
    (type, amount, category_id, transaction_date, description, payment_method, notes, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...values, now]);
  return result.lastInsertRowId;
}
export async function deleteTransaction(db: SQLiteDatabase, id: number) {
  const result = await db.runAsync('DELETE FROM personal_transactions WHERE id = ?', [id]);
  if (result.changes !== 1) throw new Error('This transaction no longer exists.');
}
export type HistoryFilter = { type?: TransactionType; month?: string };
export async function getTransactions(db: SQLiteDatabase, filter: HistoryFilter = {}, cursor?: Pick<Transaction, 'transactionDate' | 'id'>, limit = PERSONAL_PAGE_SIZE) {
  if (!Number.isInteger(limit) || limit < 1 || limit > PERSONAL_PAGE_SIZE) throw new Error('Invalid page size.');
  const where: string[] = [], params: (string | number)[] = [];
  if (filter.type) {
    if (filter.type !== 'income' && filter.type !== 'expense') throw new Error('Invalid transaction type.');
    where.push('t.type = ?'); params.push(filter.type);
  }
  if (filter.month) {
    const range = monthRange(filter.month);
    where.push('t.transaction_date BETWEEN ? AND ?'); params.push(range.start, range.end);
  }
  if (cursor) { where.push('(t.transaction_date, t.id) < (?, ?)'); params.push(cursor.transactionDate, cursor.id); }
  const rows = await db.getAllAsync<Transaction>(`SELECT ${columns} FROM ${joined}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.transaction_date DESC, t.id DESC LIMIT ?`, [...params, limit + 1]);
  return { rows: rows.slice(0, limit).map(checkedTransaction), hasMore: rows.length > limit };
}
export async function getMonthlyTotals(db: SQLiteDatabase, month = localToday().slice(0, 7)) {
  const range = monthRange(month);
  // Text preserves SQLite integer precision across the native JS bridge, even for large aggregates.
  const totals = await db.getFirstAsync<{ income: string; expenses: string }>(`SELECT
    CAST(COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS TEXT) AS income,
    CAST(COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS TEXT) AS expenses
    FROM personal_transactions WHERE transaction_date BETWEEN ? AND ?`, [range.start, range.end]);
  if (!totals) throw new Error('Could not read monthly totals.');
  const income = BigInt(integerMoney(totals.income)), expenses = BigInt(integerMoney(totals.expenses));
  return { income: income.toString(), expenses: expenses.toString(), balance: (income - expenses).toString() };
}
