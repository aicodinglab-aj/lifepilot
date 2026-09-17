/* global __dirname, __filename */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
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
function database(filename) {
  const raw = new DatabaseSync(filename);
  const db = {
    execAsync: async (sql) => raw.exec(sql),
    getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
    runAsync: async (sql, params = []) => {
      const result = raw.prepare(sql).run(...params);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowid };
    },
    withTransactionAsync: async (fn) => {
      raw.exec('BEGIN');
      try { await fn(db); raw.exec('COMMIT'); }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
  return { raw, db };
}
const date = load('src/features/personal/date.ts');
const money = load('src/features/personal/money.ts');
const domain = load('src/features/personal/transaction.ts', { './money': money, './date': date });
const repo = load('src/database/personal.ts', { '@/features/personal/transaction': domain, '@/features/personal/date': date, '@/features/personal/money': money });
const { createSaveFlow } = load('src/features/personal/save-flow.ts');
const migration = load('src/database/migrate.ts');
const migrations = [...fs.readFileSync(path.join(__dirname, '../src/database/migrate.ts'), 'utf8').matchAll(/await db\.execAsync\(`([\s\S]*?)`\)/g)];
function dates() {
  assert.equal(date.localToday(new Date(2026, 8, 1, 0, 1)), '2026-09-01');
  assert.equal(date.localToday(new Date(2026, 7, 31, 23, 59)), '2026-08-31');
  assert.equal(date.monthRange('2024-02').end, '2024-02-29');
  assert.equal(date.monthRange('2026-02').end, '2026-02-28');
  assert.equal(date.monthRange('2026-12').end, '2026-12-31');
  assert.equal(date.displayDate('2026-09-01'), '1 Sep 2026');
  for (const invalid of ['2026-02-29', '2026-04-31', '0000-01-01', '2026-13-01', '2026-01-00', '2026-9-01']) assert.equal(date.validDate(invalid), false);
  assert.throws(() => date.monthRange('2026-13'));
}
async function main() {
  dates();
  if (process.argv.includes('--dates-only')) return;
  await runtimeBoundaryTests();
  for (const zone of ['Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Auckland']) {
    execFileSync(process.execPath, [__filename, '--dates-only'], { env: { ...process.env, TZ: zone }, stdio: 'pipe' });
  }
  for (const [input, expected] of [['125.50', 12550], ['1,250', 125000], ['12,450.50', 1245050], ['1,00,000.01', 10000001], ['0.01', 1], [' 5.5 ', 550]]) assert.equal(money.parseMoney(input), expected);
  for (const invalid of ['', '0', '-1', 'NaN', 'Infinity', '1e3', '1.001', '12,34', '1,234,567', '₹12', '1.', '.50', '9999999999']) assert.throws(() => money.parseMoney(invalid));
  assert.equal(money.formatMoney(125000), '₹1,250');
  assert.equal(money.formatMoney(1245050), '₹12,450.50');
  assert.equal(money.formatMoney(-1), '-₹0.01');
  assert.equal(money.formatMoney(0), '₹0');
  assert.equal(money.parseMoney(money.moneyInput(12550)), 12550);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifepilot-personal-'));
  const filename = path.join(root, 'test.sqlite');
  let { raw, db } = database(filename);
  for (const step of migrations.slice(0, 7)) raw.exec(step[1]);
  raw.exec(`PRAGMA foreign_keys = ON;
    INSERT INTO vehicles(id, vehicle_type, registration_number, make, model, model_year, fuel_type, odometer_km, created_at, updated_at)
      VALUES (1, 'Car', 'PRESERVE', 'Test', 'Model', 2020, 'Petrol', 1000, 'before', 'before');
    INSERT INTO vehicle_photos VALUES ('gallery', 1, 'file:///gallery.jpg', 1, 'before');
    INSERT INTO vehicle_services(id, vehicle_id, service_date, odometer, title, parts_cost, created_at, updated_at)
      VALUES ('service', 1, '2026-09-01', 1000, 'Service', 9000, 'before', 'before');
    INSERT INTO service_bill_photos VALUES ('bill', 1, 'service', 'file:///bill.jpg', 'before');
    INSERT INTO vehicle_insurance(id, vehicle_id, provider, policy_number, expiry_date, created_at, updated_at)
      VALUES ('insurance', 1, 'Insurer', 'POLICY', '2027-01-01', 'before', 'before');
    INSERT INTO vehicle_puc(id, vehicle_id, expiry_date, created_at, updated_at)
      VALUES ('puc', 1, '2027-02-01', 'before', 'before');
    INSERT INTO insurance_documents VALUES ('policy', 1, 'insurance', 'file:///policy.jpg', 'before');
    INSERT INTO puc_documents VALUES ('certificate', 1, 'puc', 'file:///puc.jpg', 'before');
    INSERT INTO vehicle_reminder_schedule(notification_id, source_id, source_type, due_date, offset_days, fire_at, fingerprint, created_at, updated_at)
      VALUES ('owned', 'insurance:1:insurance', 'insurance', '2027-01-01', 7, 1800000000000, 'fingerprint', 'before', 'before');
    INSERT INTO reminder_notification_cleanup VALUES ('pending', 'before');`);
  const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name);
  const snapshot = () => JSON.stringify(tables.map((name) => raw.prepare(`SELECT * FROM "${name}"`).all()));
  const before = snapshot();
  await migration.migrateDatabase(db); await migration.migrateDatabase(db);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 8);
  assert.equal(snapshot(), before);
  assert.equal((await repo.getCategories(db)).length, 15);
  assert.equal((await repo.getTransactions(db)).rows.length, 0);
  assert.equal((await repo.getMonthlyTotals(db, '2026-09')).balance, '0');
  const draft = { type: 'expense', amount: '125.50', categoryId: 'expense-food', transactionDate: '2026-09-01', description: 'Lunch', notes: '', paymentMethod: 'UPI' };
  const expense = await repo.saveTransaction(db, draft);
  const income = await repo.saveTransaction(db, { ...draft, type: 'income', categoryId: 'income-salary', amount: '1000', description: '' });
  assert.equal((await repo.getTransaction(db, expense)).amount, 12550);
  assert.equal((await repo.getTransaction(db, income)).description, null);
  let totals = await repo.getMonthlyTotals(db, '2026-09');
  assert.equal(totals.income, '100000'); assert.equal(totals.expenses, '12550'); assert.equal(totals.balance, '87450');
  assert.equal(money.formatMoney(totals.balance), '₹874.50');
  assert.deepEqual(JSON.parse(JSON.stringify(totals)), { income: '100000', expenses: '12550', balance: '87450' });
  for (const changed of [{ type: 'bad' }, { amount: '0' }, { categoryId: 'income-salary' }, { categoryId: '' }, { transactionDate: '2026-02-29' }, { description: 'x'.repeat(201) }, { notes: 'x'.repeat(2001) }, { paymentMethod: 'Crypto' }]) {
    await assert.rejects(repo.saveTransaction(db, { ...draft, ...changed }));
  }
  const original = await repo.getTransaction(db, expense);
  assert.equal(await repo.saveTransaction(db, { ...draft, amount: '200' }, expense), expense);
  assert.equal((await repo.getTransaction(db, expense)).createdAt, original.createdAt);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM personal_transactions').get().n, 2);
  assert.equal((await repo.getMonthlyTotals(db, '2026-09')).balance, '80000');
  await repo.saveTransaction(db, { ...draft, transactionDate: '2026-08-31', amount: '10' });
  await repo.saveTransaction(db, { ...draft, transactionDate: '2026-09-30', amount: '20' });
  await repo.saveTransaction(db, { ...draft, transactionDate: '2026-10-01', amount: '30' });
  assert.equal((await repo.getMonthlyTotals(db, '2026-09')).expenses, '22000');
  assert.equal((await repo.getMonthlyTotals(db, '2026-08')).expenses, '1000');
  assert.equal((await repo.getMonthlyTotals(db, '2026-10')).expenses, '3000');
  assert.equal((await repo.getTransactions(db, { type: 'income' })).rows.length, 1);
  assert.equal((await repo.getTransactions(db, { type: 'expense', month: '2026-09' })).rows.length, 2);
  assert.throws(() => raw.prepare("UPDATE personal_transactions SET category_id = 'income-salary' WHERE id = ?").run(expense));
  assert.throws(() => raw.prepare('UPDATE personal_transactions SET amount = 0.5 WHERE id = ?').run(expense));
  assert.throws(() => raw.exec("DELETE FROM personal_categories WHERE id = 'expense-food'"));
  await repo.saveTransaction(db, { ...draft, type: 'income', categoryId: 'income-gift', amount: '250' }, expense);
  assert.equal((await repo.getMonthlyTotals(db, '2026-09')).income, '125000');
  await repo.deleteTransaction(db, expense);
  assert.equal(await repo.getTransaction(db, expense), null);
  assert.ok(await repo.getTransaction(db, income));
  await assert.rejects(repo.saveTransaction(db, draft, expense));
  await assert.rejects(repo.deleteTransaction(db, expense));
  assert.equal(snapshot(), before);
  for (let index = 0; index < 95; index++) await repo.saveTransaction(db, { ...draft, transactionDate: '2026-11-10' });
  let page, cursor; const ids = [];
  do {
    page = await repo.getTransactions(db, { type: 'expense', month: '2026-11' }, cursor);
    assert.ok(page.rows.length <= 40);
    ids.push(...page.rows.map((row) => row.id)); cursor = page.rows.at(-1);
  } while (page.hasMore);
  assert.equal(ids.length, 95); assert.equal(new Set(ids).size, 95);
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
  assert.equal((await repo.getTransactions(db)).rows[0].transactionDate, '2026-11-10');
  await assert.rejects(repo.getTransactions(db, {}, undefined, 100000));
  assert.equal(raw.prepare('PRAGMA foreign_key_check').all().length, 0);
  raw.close(); ({ raw, db } = database(filename));
  await migration.migrateDatabase(db);
  assert.equal((await repo.getCategories(db)).length, 15);
  assert.ok(await repo.getTransaction(db, income)); assert.equal(snapshot(), before);
  raw.exec('DELETE FROM vehicles WHERE id = 1');
  assert.ok(await repo.getTransaction(db, income));
  raw.close();
  const fresh = database(':memory:'); await migration.migrateDatabase(fresh.db);
  assert.equal((await repo.getCategories(fresh.db)).length, 15);
  fresh.raw.exec(`WITH RECURSIVE sequence(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM sequence WHERE n < 100001)
    INSERT INTO personal_transactions(type, amount, category_id, transaction_date, created_at, updated_at)
    SELECT 'expense', 99999999999, 'expense-food', '2026-09-01', 'now', 'now' FROM sequence;`);
  assert.equal((await repo.getMonthlyTotals(fresh.db, '2026-09')).expenses, (99999999999n * 100001n).toString());
  assert.equal((await repo.getTransactions(fresh.db)).rows.length, 40);
  fresh.raw.exec('PRAGMA user_version = 9'); await assert.rejects(migration.migrateDatabase(fresh.db)); fresh.raw.close();
  const failed = database(':memory:');
  for (const step of migrations.slice(0, 7)) failed.raw.exec(step[1]);
  await assert.rejects(migration.migrateDatabase({ ...failed.db, execAsync: async (sql) => {
    if (sql.includes('CREATE TABLE personal_categories')) { failed.raw.exec('CREATE TABLE partial(id)'); throw new Error('disk full'); }
    return failed.db.execAsync(sql);
  } }));
  assert.equal(failed.raw.prepare('PRAGMA user_version').get().user_version, 7);
  assert.equal(failed.raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'partial'").get().n, 0);
  failed.raw.close();
  console.log('PASS: v7→v8 preservation/rollback, category seeds, expense/income CRUD and isolation, integer money, monthly totals/boundaries, validation/FKs, filters, keyset pagination and restart persistence.');
}
async function runtimeBoundaryTests() {
  const integration = database(':memory:'); await migration.migrateDatabase(integration.db);
  for (const type of ['expense', 'income']) {
    const flow = createSaveFlow();
    const persist = () => repo.saveTransaction(integration.db, {
      type, categoryId: type === 'income' ? 'income-salary' : 'expense-food', amount: '125.50',
      transactionDate: '2026-09-17', description: '', notes: '', paymentMethod: '',
    });
    assert.equal(await flow.run(persist, () => { throw new Error('post-commit navigation error'); }, () => {}), 'navigation-failed');
    assert.equal(await flow.run(persist, (id) => { assert.equal(typeof id, 'string'); }, () => {}), 'saved');
    assert.equal((await repo.getTransactions(integration.db, { type })).rows.length, 1);
  }
  const integratedTotals = await repo.getMonthlyTotals(integration.db, '2026-09');
  assert.equal(money.formatMoney(integratedTotals.income), '₹125.50');
  assert.equal(money.formatMoney(integratedTotals.expenses), '₹125.50');
  assert.equal(money.formatMoney(integratedTotals.balance), '₹0');
  integration.raw.close();
  // Amounts stay exact internally; all public aggregate values are JSON-safe strings.
  for (const value of [12550, '12550', 12550n]) {
    assert.equal(money.integerMoney(value), '12550');
    assert.equal(money.formatMoney(value), '₹125.50');
    const totals = await repo.getMonthlyTotals({ getFirstAsync: async () => ({ income: value, expenses: '50' }) }, '2026-09');
    assert.equal(totals.balance, '12500');
    assert.doesNotThrow(() => JSON.stringify(totals));
    assert.equal(money.formatMoney(totals.balance), '₹125');
    const row = await repo.getTransaction({ getFirstAsync: async () => ({ id: '1', amount: value }) }, 1);
    assert.equal(row.id, 1); assert.equal(row.amount, 12550);
    assert.doesNotThrow(() => JSON.stringify(row));
  }
  for (const invalid of [null, undefined, {}, true, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '12.50', '1e3']) {
    assert.throws(() => money.integerMoney(invalid));
    await assert.rejects(repo.getTransaction({ getFirstAsync: async () => ({ id: 1, amount: invalid }) }, 1));
  }
  const exact = '9007199254740993';
  const totals = await repo.getMonthlyTotals({ getFirstAsync: async () => ({ income: exact, expenses: '1' }) }, '2026-09');
  assert.equal(totals.balance, '9007199254740992');
  assert.equal(money.formatMoney(totals.income), '₹9,00,71,99,25,47,409.93');
  await assert.rejects(repo.getMonthlyTotals({ getFirstAsync: async () => ({ income: 9007199254740992, expenses: 0 }) }, '2026-09'));
  await assert.rejects(repo.getMonthlyTotals({ getFirstAsync: async () => ({ income: null, expenses: 0 }) }, '2026-09'));
  const flow = createSaveFlow();
  let writes = 0, release;
  const stages = [], report = (stage) => stages.push(stage);
  const pendingWrite = new Promise((resolve) => { release = resolve; });
  const persist = async () => { writes++; await pendingWrite; return 42; };
  const first = flow.run(persist, () => { throw new Error('navigation failed after commit'); }, report);
  assert.equal(await flow.run(persist, () => {}, report), 'busy');
  release();
  assert.equal(await first, 'navigation-failed');
  assert.equal(writes, 1);
  let params;
  assert.equal(await flow.run(persist, (id) => { params = { id }; }, report), 'saved');
  assert.equal(writes, 1);
  assert.deepEqual(params, { id: '42' });
  assert.doesNotThrow(() => JSON.stringify(params));
  assert.equal(await flow.run(persist, () => {}, report), 'saved');
  assert.equal(writes, 1);
  assert.deepEqual(stages.slice(0, 4), ['save-start', 'save-success', 'navigation-start', 'navigation-failed']);
  const retry = createSaveFlow(); let navigated = false;
  assert.equal(await retry.run(async () => { throw new Error('write failed'); }, () => { navigated = true; }, report), 'save-failed');
  assert.equal(navigated, false);
  assert.equal(await retry.run(async () => 5, () => { navigated = true; }, report), 'saved');
  assert.equal(navigated, true);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
