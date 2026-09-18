/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

function load(relative, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => {
    if (name in mocks) return mocks[name];
    if (name === 'expo-sqlite') return {};
    const target = name.startsWith('@/') ? `src/${name.slice(2)}` : path.join(path.dirname(relative), name);
    return load(`${target}.ts`, mocks);
  } });
  return exports;
}

async function main() {
  const raw = new DatabaseSync(':memory:');
  const queries = [];
  const db = {
    execAsync: async (sql) => raw.exec(sql),
    getFirstAsync: async (sql, params = []) => { queries.push(sql); return raw.prepare(sql).get(...params) ?? null; },
    withTransactionAsync: async (fn) => { raw.exec('BEGIN'); try { await fn(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; } },
  };
  await load('src/database/migrate.ts').migrateDatabase(db);
  for (const id of [1, 2]) raw.prepare(`INSERT INTO vehicles
    (id, vehicle_type, registration_number, make, model, model_year, fuel_type, odometer_km, created_at, updated_at)
    VALUES (?, 'Car', ?, 'Test', 'Model', 2020, 'Petrol', 500, 'before', 'before')`).run(id, `OVERVIEW-${id}`);
  const api = load('src/features/vehicles/overview-summary.ts');
  const today = '2026-09-18';
  const read = (id = 1) => api.getOverviewSummary(db, id, today);
  const plain = (value) => JSON.parse(JSON.stringify(value));
  const empty = await read();
  assert.equal(api.coverageQuickStatus(empty.insurance, today).value, 'Not added');
  assert.equal(api.coverageQuickStatus(empty.puc, today).value, 'Not added');
  assert.equal(api.serviceQuickStatus(empty.service, 500, today).value, 'Not scheduled');
  for (const kind of ['insurance', 'puc']) {
    const table = `vehicle_${kind}`, start = kind === 'insurance' ? 'start_date' : 'issue_date';
    const fields = kind === 'insurance' ? ', provider, policy_number' : '';
    const values = kind === 'insurance' ? ", 'Provider', 'Policy'" : '';
    raw.prepare(`INSERT INTO ${table} (id, vehicle_id, ${start}, expiry_date, created_at, updated_at${fields})
      VALUES (?, 1, '2026-01-01', '2027-02-15', 'before', 'before'${values})`).run(kind);
    for (const [expiry, status] of [['2027-02-15', 'Valid'], ['2026-09-25', 'Expiring soon'], ['2026-09-10', 'Expired']]) {
      raw.prepare(`UPDATE ${table} SET expiry_date = ? WHERE id = ?`).run(expiry, kind);
      assert.equal(api.coverageQuickStatus((await read())[kind], today).value, status);
    }
    raw.prepare(`UPDATE ${table} SET expiry_date = '2027-02-15' WHERE id = ?`).run(kind);
    raw.prepare(`INSERT INTO ${table} (id, vehicle_id, ${start}, expiry_date, created_at, updated_at${fields})
      VALUES (?, 1, '2027-02-16', '2028-02-15', 'after', 'after'${values})`).run(`${kind}-future`);
    assert.equal((await read())[kind].id, kind, 'future renewal must not hide current coverage');
    raw.prepare(`DELETE FROM ${table} WHERE id = ?`).run(kind);
    assert.equal(api.coverageQuickStatus((await read())[kind], today).value, 'Not started');
    raw.prepare(`DELETE FROM ${table}`).run();
  }
  raw.exec(`INSERT INTO vehicle_services (id, vehicle_id, service_date, odometer, title, next_service_date, next_service_odometer, created_at, updated_at)
    VALUES ('service', 1, '2026-09-01', 500, 'Visit', '2026-12-15', 1000, 'before', 'before')`);
  let service = api.serviceQuickStatus((await read()).service, 500, today);
  assert.equal(service.value, '15 Dec 2026');
  assert.match(service.detail, /Due in 88 days/);
  assert.match(service.detail, /500 km/);
  raw.exec("UPDATE vehicle_services SET next_service_date = '2026-09-10'");
  assert.match(api.serviceQuickStatus((await read()).service, 1100, today).detail, /Overdue 8 days ago.*100 km overdue/);
  raw.exec('UPDATE vehicle_services SET next_service_date = NULL');
  assert.equal(api.serviceQuickStatus((await read()).service, 500, today).value, '1,000 km');
  raw.exec(`INSERT INTO vehicle_services (id, vehicle_id, service_date, odometer, title, created_at, updated_at)
    VALUES ('newer', 1, '2026-09-18', 600, 'Latest visit', 'after', 'after')`);
  assert.equal(api.serviceQuickStatus((await read()).service, 600, today).value, 'Not scheduled', 'latest visit must win, not an older schedule');
  assert.deepEqual(plain(await read(2)), plain(empty), 'vehicle B must remain empty');
  assert.ok(queries.filter((sql) => sql.includes('vehicle_services')).every((sql) => sql.includes('LIMIT 1')));
  assert.ok(queries.every((sql) => !/FROM (insurance_documents|puc_documents|service_bill_photos|personal_|reminder)/.test(sql)));

  // Exercise the real hook callback with a small state/focus harness and real SQLite reads.
  let state, effect, cleanup;
  const hook = load('src/features/vehicles/use-overview-summary.ts', {
    react: { useState: () => [state ?? null, (value) => { state = value; }], useCallback: (fn) => fn },
    'expo-router': { useFocusEffect: (fn) => { effect = fn; } },
    'expo-sqlite': { useSQLiteContext: () => db },
    './use-coverage': { useCoverageToday: () => today },
    './overview-summary': api,
  });
  const render = (id = 1) => hook.useOverviewSummary(id);
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  async function focus(id = 1) { cleanup?.(); render(id); cleanup = effect(); await flush(); return render(id); }
  assert.equal(render().loading, true);
  await focus();
  for (const kind of ['insurance', 'puc']) {
    cleanup();
    const fields = kind === 'insurance' ? ', provider, policy_number' : '';
    const values = kind === 'insurance' ? ", 'Provider', 'Policy'" : '';
    raw.prepare(`INSERT INTO vehicle_${kind} (id, vehicle_id, expiry_date, created_at, updated_at${fields})
      VALUES (?, 1, '2027-02-15', 'before', 'before'${values})`).run(kind);
    assert.equal(api.coverageQuickStatus((await focus()).data[kind], today).value, 'Valid');
    cleanup();
    raw.exec(`UPDATE vehicle_${kind} SET expiry_date = '2026-09-25'`);
    assert.equal(api.coverageQuickStatus((await focus()).data[kind], today).value, 'Expiring soon');
    cleanup();
    raw.exec(`DELETE FROM vehicle_${kind}`);
    assert.equal(api.coverageQuickStatus((await focus()).data[kind], today).value, 'Not added');
  }
  cleanup(); raw.exec("UPDATE vehicle_services SET next_service_date = '2026-12-15' WHERE id = 'newer'");
  assert.equal((await focus()).data.service.nextServiceDate, '2026-12-15');
  cleanup(); raw.exec('DELETE FROM vehicle_services');
  assert.equal((await focus()).data.service, null);
  cleanup(); raw.exec(`INSERT INTO vehicle_services (id, vehicle_id, service_date, odometer, title, next_service_date, created_at, updated_at)
    VALUES ('added-on-service-screen', 1, '2026-09-18', 600, 'New visit', '2026-12-15', 'after', 'after')`);
  assert.equal((await focus()).data.service.id, 'added-on-service-screen');
  const cached = render().data;
  cleanup(); render(); cleanup = effect();
  assert.equal(render().data, cached, 'refocus must retain loaded cards while querying');
  cleanup();
  assert.equal(render(2).data, null, 'route change must hide the previous snapshot immediately');
  await flush();
  assert.equal(render(2).data, null, 'blurred request cannot publish stale results');
  assert.deepEqual(plain((await focus(2)).data), plain(empty));
  const originalQuery = db.getFirstAsync;
  db.getFirstAsync = async () => { throw new Error('read failure'); };
  assert.equal((await focus(2)).error, 'Could not load');
  db.getFirstAsync = originalQuery;
  assert.equal((await focus(2)).error, null);
  cleanup(); raw.close();
  console.log('PASS: Overview coverage states, renewals, latest service/date/mileage, isolation, bounded queries, focus CRUD refresh, loading, stale-result protection, and error recovery.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
