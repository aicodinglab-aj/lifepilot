/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
function load(relative, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}
const dates = load('src/features/personal/date.ts');
const money = load('src/features/personal/money.ts');
const domain = load('src/features/personal/transaction.ts', { './money': money, './date': dates });
const business = load('src/features/personal/analytics.ts', { './money': money });
const repository = load('src/database/personal.ts', { '@/features/personal/transaction': domain, '@/features/personal/date': dates, '@/features/personal/money': money });
const analytics = load('src/database/personal-analytics.ts', { '@/features/personal/date': dates, '@/features/personal/money': money, '@/features/personal/analytics': business });
const migration = load('src/database/migrate.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));
async function main() {
  assert.equal(dates.shiftMonth('2027-01', -1), '2026-12');
  assert.equal(dates.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(dates.shiftMonth('2026-09', -6), '2026-03');
  assert.equal(dates.shiftMonth('0001-01', -1), null);
  assert.equal(dates.shiftMonth('9999-12', 1), null);
  assert.equal(dates.monthLabel('2026-09'), 'September 2026');
  assert.equal(dates.monthRange('2024-02').end, '2024-02-29');
  assert.equal(dates.monthRange('2026-02').end, '2026-02-28');
  assert.deepEqual(plain(dates.trendMonths('2027-01')), ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
  assert.equal(business.percentage('0', '0'), '0.0');
  assert.equal(business.percentage('1', '3'), '33.3');
  assert.equal(business.percentage('2', '3'), '66.7');
  assert.equal(business.percentage('1', '10000000000000000'), '0.0');
  assert.equal(business.percentage('10000000000000000', '10000000000000000'), '100.0');
  assert.throws(() => business.percentage('1', '0'));
  assert.equal(business.comparison('20000', '8000'), '₹120 higher than previous month');
  assert.equal(business.comparison('8000', '20000'), '₹120 lower than previous month');
  assert.equal(business.comparison('0', '0'), 'Unchanged from previous month');
  const raw = new DatabaseSync(':memory:');
  let queryCount = 0, maxReturned = 0;
  const db = {
    execAsync: async (sql) => raw.exec(sql),
    getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, params = []) => {
      queryCount++; const rows = raw.prepare(sql).all(...params); maxReturned = Math.max(maxReturned, rows.length); return rows;
    },
    runAsync: async (sql, params = []) => {
      const result = raw.prepare(sql).run(...params); return { changes: result.changes, lastInsertRowId: result.lastInsertRowid };
    },
    withTransactionAsync: async (action) => {
      raw.exec('BEGIN'); try { await action(); raw.exec('COMMIT'); } catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
  await migration.migrateDatabase(db);
  const version = raw.prepare('PRAGMA user_version').get().user_version;
  raw.exec(`INSERT INTO vehicles(id, vehicle_type, registration_number, make, model, model_year, fuel_type, odometer_km, created_at, updated_at)
    VALUES (1, 'Car', 'ANALYTICS', 'Test', 'Model', 2020, 'Petrol', 1000, 'before', 'before');
    INSERT INTO vehicle_services(id, vehicle_id, service_date, odometer, title, parts_cost, created_at, updated_at)
    VALUES ('service', 1, '2026-09-01', 1000, 'Service', 9999, 'before', 'before');
    INSERT INTO vehicle_insurance(id, vehicle_id, provider, policy_number, expiry_date, premium_amount, created_at, updated_at)
    VALUES ('policy', 1, 'Insurer', 'TEST', '2026-09-30', 9999, 'before', 'before');
    INSERT INTO vehicle_puc(id, vehicle_id, expiry_date, amount, created_at, updated_at)
    VALUES ('puc', 1, '2026-09-30', 9999, 'before', 'before');`);
  const vehicleTables = ['vehicles', 'vehicle_services', 'vehicle_insurance', 'vehicle_puc', 'vehicle_reminder_sources', 'reminder_change_state'];
  const snapshot = () => JSON.stringify(vehicleTables.map((table) => raw.prepare(`SELECT * FROM ${table}`).all()));
  const before = snapshot();
  let result = await analytics.getPersonalAnalytics(db, '2026-09');
  assert.equal(result.selected.expenses, '0'); assert.equal(result.selected.income, '0');
  assert.equal(result.selected.expenseCount, '0'); assert.equal(result.selected.incomeCount, '0');
  assert.equal(result.expenses.length, 0); assert.equal(result.income.length, 0); assert.equal(business.insights(result).length, 0);
  assert.equal(result.trend.length, 6); assert.ok(result.trend.every((row) => row.expenses === '0'));
  const input = { type: 'expense', amount: '100', categoryId: 'expense-food', transactionDate: '2026-09-01', description: '', notes: '', paymentMethod: '' };
  const first = await repository.saveTransaction(db, input);
  result = await analytics.getPersonalAnalytics(db, '2026-09');
  assert.equal(result.selected.expenses, '10000'); assert.equal(result.selected.balance, '-10000'); assert.equal(result.income.length, 0);
  const second = await repository.saveTransaction(db, { ...input, amount: '50', transactionDate: '2026-09-30' });
  await repository.saveTransaction(db, { ...input, amount: '50', categoryId: 'expense-groceries' });
  await repository.saveTransaction(db, { ...input, type: 'income', categoryId: 'income-salary', amount: '1000' });
  await repository.saveTransaction(db, { ...input, type: 'income', categoryId: 'income-interest', amount: '10' });
  await repository.saveTransaction(db, { ...input, amount: '80', transactionDate: '2026-08-31' });
  await repository.saveTransaction(db, { ...input, type: 'income', categoryId: 'income-salary', amount: '500', transactionDate: '2026-08-01' });
  await repository.saveTransaction(db, { ...input, amount: '20', transactionDate: '2026-04-01' });
  await repository.saveTransaction(db, { ...input, amount: '999', transactionDate: '2026-03-31' });
  await repository.saveTransaction(db, { ...input, amount: '777', transactionDate: '2026-10-01' });
  queryCount = 0;
  result = await analytics.getPersonalAnalytics(db, '2026-09');
  assert.equal(queryCount, 1);
  assert.deepEqual(plain(result.selected), { month: '2026-09', income: '101000', expenses: '20000', balance: '81000', incomeCount: '2', expenseCount: '3' });
  assert.deepEqual(plain(result.expenses.map((row) => [row.name, row.amount, row.percentage])), [['Food', '15000', '75.0'], ['Groceries', '5000', '25.0']]);
  assert.deepEqual(plain(result.income.map((row) => [row.name, row.amount])), [['Salary', '100000'], ['Interest', '1000']]);
  assert.equal(result.previous.expenses, '8000'); assert.equal(result.previous.income, '50000');
  assert.deepEqual(plain(result.trend.map((row) => row.expenses)), ['2000', '0', '0', '0', '8000', '20000']);
  assert.ok(business.insights(result)[0].includes('Food')); assert.ok(business.insights(result)[1].includes('₹120 higher'));
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.equal((await repository.getTransactions(db, { month: '2026-09', type: 'expense', categoryId: 'expense-food' })).rows.length, 2);
  assert.equal((await repository.getTransactions(db, { month: '2026-09', type: 'income', categoryId: 'expense-food' })).rows.length, 0);
  assert.equal((await repository.getTransactions(db, { categoryId: "' OR 1=1 --" })).rows.length, 0);
  await repository.saveTransaction(db, { ...input, amount: '200', categoryId: 'expense-groceries' }, first);
  result = await analytics.getPersonalAnalytics(db, '2026-09');
  assert.equal(result.selected.expenses, '30000'); assert.equal(result.expenses[0].name, 'Groceries');
  await repository.saveTransaction(db, { ...input, amount: '200', categoryId: 'expense-groceries', transactionDate: '2026-08-15' }, first);
  result = await analytics.getPersonalAnalytics(db, '2026-09');
  assert.equal(result.selected.expenses, '10000'); assert.equal(result.previous.expenses, '28000');
  assert.ok(business.insights(result)[0].includes('tied'));
  await repository.deleteTransaction(db, second);
  assert.equal((await analytics.getPersonalAnalytics(db, '2026-09')).selected.expenses, '5000');
  await repository.saveTransaction(db, { ...input, amount: '5', transactionDate: '2026-12-31' });
  await repository.saveTransaction(db, { ...input, type: 'income', categoryId: 'income-gift', amount: '10', transactionDate: '2027-01-01' });
  result = await analytics.getPersonalAnalytics(db, '2027-01');
  assert.equal(result.previous.month, '2026-12'); assert.equal(result.previous.expenses, '500');
  assert.equal(result.expenses.length, 0); assert.equal(result.income[0].percentage, '100.0');
  assert.ok(business.insights(result)[0].includes('no expenses'));
  result = await analytics.getPersonalAnalytics(db, '0001-01'); assert.equal(result.previous, null);
  raw.exec(`WITH RECURSIVE sequence(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM sequence WHERE n < 100001)
    INSERT INTO personal_transactions(type, amount, category_id, transaction_date, created_at, updated_at)
    SELECT 'expense', 99999999999, 'expense-food', '2029-01-01', 'now', 'now' FROM sequence;`);
  maxReturned = 0;
  result = await analytics.getPersonalAnalytics(db, '2029-01');
  assert.equal(result.selected.expenses, (99999999999n * 100001n).toString());
  assert.equal(result.selected.expenseCount, '100001'); assert.equal(result.expenses[0].percentage, '100.0');
  assert.ok(maxReturned <= 27); assert.doesNotThrow(() => JSON.stringify(result));
  assert.ok(money.formatMoney(result.selected.expenses).startsWith('₹'));
  assert.equal(snapshot(), before); assert.equal(raw.prepare('PRAGMA user_version').get().user_version, version);
  const plan = raw.prepare('EXPLAIN QUERY PLAN SELECT SUM(amount) FROM personal_transactions WHERE transaction_date BETWEEN ? AND ?').all('2026-09-01', '2026-09-30');
  assert.ok(plan.some((row) => row.detail.includes('personal_transactions_date')));
  raw.close();
  console.log('PASS: analytics summaries/counts, separate categories/ordering/percentages, comparison, month navigation/boundaries, zero-filled trend, exact large totals, category filters, add/edit/delete refresh and vehicle isolation.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
