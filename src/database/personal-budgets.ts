import type { SQLiteDatabase } from 'expo-sqlite';
import { withOperation, type OperationContext } from '@/features/activity/operation-lifecycle';
import { localToday, monthRange } from '@/features/personal/date';
import { parseMoney } from '@/features/personal/money';
import { calculateBudgetProgress, type OverallBudget, type CategoryBudget, type MonthlyBudgetSummary } from '@/features/personal/budget';

const columns = 'month, amount AS amountPaise, created_at AS createdAt, updated_at AS updatedAt';
function categoryKey(id: string) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Select an expense category.');
}
async function expenseCategory(db: SQLiteDatabase, id: string) {
  categoryKey(id);
  const found = await db.getFirstAsync<{ id: string }>("SELECT id FROM personal_categories WHERE id = ? AND type = 'expense'", [id]);
  if (!found) throw new Error('Select an existing expense category.');
}
// Single-statement writes match personal transactions. The FK validates category
// ownership atomically, including a category changed after the friendly check.
function save(db: SQLiteDatabase, month: string, amount: string, categoryId: string | null, updateOnly: boolean, scope: 'overall' | 'category', context?: OperationContext) {
  return withOperation(async () => {
    monthRange(month);
    if (typeof amount !== 'string') throw new Error('Enter a valid rupee amount.');
    const paise = parseMoney(amount), now = new Date().toISOString();
    if (scope === 'category') await expenseCategory(db, categoryId ?? '');
    const table = categoryId === null ? 'personal_monthly_budgets' : 'personal_category_budgets';
    if (updateOnly) {
      const result = await db.runAsync(`UPDATE ${table} SET amount = ?, updated_at = ? WHERE month = ?${categoryId === null ? '' : ' AND category_id = ?'}`,
        categoryId === null ? [paise, now, month] : [paise, now, month, categoryId]);
      if (result.changes !== 1) throw new Error('This budget is not configured.');
    } else if (categoryId === null) {
      await db.runAsync(`INSERT INTO personal_monthly_budgets(month, amount, created_at, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(month) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`, [month, paise, now, now]);
    } else {
      await db.runAsync(`INSERT INTO personal_category_budgets(month, category_id, amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(month, category_id) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`, [month, categoryId, paise, now, now]);
    }
  }, context);
}
export const setOverallBudget = (db: SQLiteDatabase, month: string, amount: string, context?: OperationContext) => save(db, month, amount, null, false, 'overall', context);
export const updateOverallBudget = (db: SQLiteDatabase, month: string, amount: string, context?: OperationContext) => save(db, month, amount, null, true, 'overall', context);
export const setCategoryBudget = (db: SQLiteDatabase, month: string, categoryId: string, amount: string, context?: OperationContext) => save(db, month, amount, categoryId, false, 'category', context);
export const updateCategoryBudget = (db: SQLiteDatabase, month: string, categoryId: string, amount: string, context?: OperationContext) => save(db, month, amount, categoryId, true, 'category', context);
export function removeOverallBudget(db: SQLiteDatabase, month: string, context?: OperationContext) {
  return withOperation(async () => { monthRange(month); await db.runAsync('DELETE FROM personal_monthly_budgets WHERE month = ?', [month]); }, context);
}
export function removeCategoryBudget(db: SQLiteDatabase, month: string, categoryId: string, context?: OperationContext) {
  return withOperation(async () => { monthRange(month); categoryKey(categoryId);
    await db.runAsync('DELETE FROM personal_category_budgets WHERE month = ? AND category_id = ?', [month, categoryId]); }, context);
}
export function getOverallBudget(db: SQLiteDatabase, month: string) {
  monthRange(month);
  return db.getFirstAsync<OverallBudget>(`SELECT 'overall' AS kind, ${columns} FROM personal_monthly_budgets WHERE month = ?`, [month]);
}
export function getCategoryBudget(db: SQLiteDatabase, month: string, categoryId: string) {
  monthRange(month); categoryKey(categoryId);
  return db.getFirstAsync<CategoryBudget>(`SELECT 'category' AS kind, ${columns}, category_id AS categoryId FROM personal_category_budgets WHERE month = ? AND category_id = ?`, [month, categoryId]);
}
export function listCategoryBudgets(db: SQLiteDatabase, month: string) {
  monthRange(month);
  return db.getAllAsync<CategoryBudget>(`SELECT 'category' AS kind, ${columns}, category_id AS categoryId FROM personal_category_budgets WHERE month = ? ORDER BY category_id`, [month]);
}
type ProgressRow = { categoryId: string | null; categoryName: string | null; amountPaise: number | null;
  createdAt: string | null; updatedAt: string | null; spent: string; count: string };
export async function getMonthlyBudgetSummary(db: SQLiteDatabase, month = localToday().slice(0, 7)): Promise<MonthlyBudgetSummary> {
  const range = monthRange(month);
  // One statement gives limits and actuals the same read snapshot. Existing
  // type/date index limits the scan; aggregate rows, never transactions, cross JS.
  const rows = await db.getAllAsync<ProgressRow>(`
    WITH spending AS (
      SELECT category_id, SUM(amount) AS spent, COUNT(*) AS count FROM personal_transactions
      WHERE type = 'expense' AND transaction_date BETWEEN ? AND ? GROUP BY category_id
    )
    SELECT NULL AS categoryId, NULL AS categoryName, b.amount AS amountPaise, b.created_at AS createdAt, b.updated_at AS updatedAt,
      CAST(COALESCE((SELECT SUM(spent) FROM spending), 0) AS TEXT) AS spent,
      CAST(COALESCE((SELECT SUM(count) FROM spending), 0) AS TEXT) AS count
    FROM (SELECT 1) LEFT JOIN personal_monthly_budgets b ON b.month = ?
    UNION ALL
    SELECT c.id, c.name, b.amount, b.created_at, b.updated_at, CAST(COALESCE(s.spent, 0) AS TEXT), CAST(COALESCE(s.count, 0) AS TEXT)
    FROM personal_categories c LEFT JOIN spending s ON s.category_id = c.id
    LEFT JOIN personal_category_budgets b ON b.category_id = c.id AND b.month = ?
    WHERE c.type = 'expense' ORDER BY categoryId`, [range.start, range.end, month, month]);
  const overall = rows.find(row => row.categoryId === null);
  if (!overall) throw new Error('Could not read budget summary.');
  function configuration(row: ProgressRow) {
    if (row.amountPaise === null) return null;
    if (row.createdAt === null || row.updatedAt === null) throw new Error('Invalid stored budget.');
    return { month, amountPaise: row.amountPaise, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }
  const stored = configuration(overall);
  return { month, overallBudget: stored ? { kind: 'overall', ...stored } : null,
    overall: calculateBudgetProgress(overall.amountPaise, overall.spent, overall.count),
    categories: rows.filter(row => row.categoryId !== null).map(row => {
      if (row.categoryId === null || row.categoryName === null) throw new Error('Invalid stored category.');
      const stored = configuration(row);
      return { categoryId: row.categoryId, categoryName: row.categoryName,
        budget: stored ? { kind: 'category', categoryId: row.categoryId, ...stored } : null,
        progress: calculateBudgetProgress(row.amountPaise, row.spent, row.count) };
    }) };
}
export async function listCategoryBudgetProgress(db: SQLiteDatabase, month: string) {
  return (await getMonthlyBudgetSummary(db, month)).categories;
}
export async function getCategoryBudgetProgress(db: SQLiteDatabase, month: string, categoryId: string) {
  categoryKey(categoryId);
  return (await listCategoryBudgetProgress(db, month)).find(row => row.categoryId === categoryId) ?? null;
}
