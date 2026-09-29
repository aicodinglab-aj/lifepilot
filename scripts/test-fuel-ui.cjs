/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLoader } = require('./helpers/load-typescript.cjs');
const pure = createLoader();
const presentation = pure('src/features/vehicles/fuel-presentation.ts');
const vehicle = { id: 1, fuelType: 'Petrol', odometerKm: 1200, registrationNumber: 'TEST' };
const entry = { id: 1, vehicleId: 1, kind: 'refuel', fuelType: 'Petrol', date: '2026-09-01', odometerMetres: 1000000,
  costPaise: 10001, quantityMilliUnits: 10000, pricePerUnitPaise: null, fullTank: true, location: null, notes: null };
const ui = Object.fromEntries(['Button', 'Chip', 'FieldMessage', 'FormInput', 'ToggleRow', 'StandardCard', 'Section', 'EmptyState'].map(name => [name, name]));
let passes = 0;
function pass(text) { passes++; console.log(`PASS: ${text}`); }
function harness(realResource = false) {
  let cells = [], index = 0, effects = [], currentVehicle = vehicle, params = {}, tree;
  let resource = { data: null, loading: false, error: null, reload() {} };
  const navigation = [], writes = [], confirmations = [];
  let create = async (...args) => { writes.push(args); return 9; };
  let update = async (...args) => { writes.push(args); return 1; };
  let remove = async (...args) => { writes.push(args); };
  let history = async () => ({ entries: [], nextCursor: null });
  const react = {
    useState(initial) { const slot = index++; if (!(slot in cells)) cells[slot] = typeof initial === 'function' ? initial() : initial;
      return [cells[slot], value => { cells[slot] = typeof value === 'function' ? value(cells[slot]) : value; }]; },
    useRef(initial) { const slot = index++; return cells[slot] ??= { current: initial }; },
    useCallback(fn, deps) { const slot = index++, old = cells[slot]; if (!old || deps.some((d, i) => d !== old.deps[i])) cells[slot] = { fn, deps }; return cells[slot].fn; },
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const loader = createLoader({ react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View', Alert: { alert: (...args) => confirmations.push(args) }, FlatList: 'FlatList' },
    'expo-router': { router: Object.fromEntries(['push', 'dismissTo'].map(name => [name, value => navigation.push([name, value])])),
      useLocalSearchParams: () => params, useFocusEffect(callback) { const slot = index++; if (cells[slot]?.callback !== callback) {
        cells[slot]?.cleanup?.(); const cleanup = callback(); cells[slot] = { callback, cleanup }; effects.push(cleanup); } } },
    'expo-sqlite': { useSQLiteContext: () => 'db' }, '@/components/ui': ui,
    '@/components/vehicles/fuel-ui': { FuelFrame: 'FuelFrame', FuelText: 'FuelText', FuelEntryCard: 'FuelEntryCard' },
    '@/features/vehicles/use-vehicle': { useVehicle: () => ({ vehicle: currentVehicle, vehicleId: currentVehicle.id, loading: false, error: null, reload() {} }) },
    ...(!realResource ? { '@/features/vehicles/use-fuel-resource': { useFuelResource: () => resource } } : {}),
    '@/database/vehicle-fuel': { createFuelEntry: (...a) => create(...a), updateFuelEntry: (...a) => update(...a), deleteFuelEntry: (...a) => remove(...a),
      getFuelEntry: async () => entry, getFuelSummary: async () => resource.data, getFuelHistory: (...a) => history(...a) },
  });
  return { load: loader, navigation, writes, confirmations, setVehicle: v => { currentVehicle = v; }, setParams: p => { params = p; },
    setResource: data => { resource = { ...resource, data }; }, setCreate: fn => { create = fn; }, setHistory: fn => { history = fn; },
    render(Component, props = {}) { index = 0; tree = Component(props); return tree; },
    blur() { effects.forEach(fn => fn?.()); effects = []; },
    get tree() { return tree; },
  };
}
function nodes(tree) {
  if (tree == null || typeof tree === 'boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== 'object') return [tree];
  return [tree, ...Object.values(tree.props ?? {}).flatMap(value => typeof value === 'object' ? nodes(value) : [])];
}
function find(tree, type, label) { const result = nodes(tree).find(n => n?.type === type && (label === undefined || n.props.label === label)); assert.ok(result, `${type}: ${label}`); return result.props; }
function strings(tree) { return JSON.stringify(tree); }
const flush = () => new Promise(resolve => setImmediate(resolve));
async function main() {
  const overview = fs.readFileSync(path.join(__dirname, '../src/app/vehicle/[id].tsx'), 'utf8');
  assert.match(overview, /pathname: '\/vehicle\/fuel'/); assert.match(overview, /fuelTitle\(vehicle.fuelType\)/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/app/vehicle/module.tsx'), 'utf8'), /module === 'fuel'.*Redirect/);
  assert.equal(presentation.fuelTitle('Petrol'), 'Fuel'); assert.equal(presentation.fuelTitle('Electric'), 'Charging');
  pass('active Vehicle Detail destination and legacy redirect, adaptive labels');
  const form = presentation.initialFuelForm(vehicle);
  assert.equal(form.odometerKm, '1200');
  Object.assign(form, { quantity: '3', totalCost: '10', odometerKm: '900' });
  assert.equal(presentation.previewPaidPrice(form), '\u20b93.33');
  assert.equal(presentation.validateFuelForm(form, 'Petrol'), null);
  form.price = '500'; assert.equal(presentation.previewPaidPrice(form), '\u20b93.33'); assert.equal(form.totalCost, '10');
  form.totalCost = '0'; assert.equal(presentation.previewPaidPrice(form), '\u20b90.00');
  form.quantity = '0'; assert.ok(presentation.validateFuelForm(form, 'Petrol')); assert.equal(presentation.previewPaidPrice(form), null);
  assert.equal(presentation.rupeeRatio({ numerator: '100', denominator: '3' }), '\u20b90.33');
  assert.equal(presentation.milliText(0), '0'); assert.equal(presentation.milliText(100010), '100.01');
  pass('odometer prefill/history, authoritative total, exact rounded paid price and validation');
  for (const fuelType of ['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid']) {
    const h = harness(), v = { ...vehicle, fuelType }, Editor = h.load('src/app/vehicle/fuel-edit.tsx').FuelEditor;
    let tree = h.render(Editor, { db: 'db', vehicle: v });
    assert.ok(find(tree, 'FormInput', fuelType === 'Electric' ? 'Energy added (kWh)' : `Quantity (${fuelType === 'CNG' ? 'kg' : 'L'})`));
    if (fuelType === 'Electric') { assert.ok(!strings(tree).includes('Full tank')); find(tree, 'FormInput', 'Battery before (%)'); }
    else find(tree, 'ToggleRow', 'Full tank');
    find(tree, 'FormInput', 'Total paid (\u20b9)').onChangeText('200.25');
    find(tree, 'FormInput', fuelType === 'Electric' ? 'Energy added (kWh)' : `Quantity (${fuelType === 'CNG' ? 'kg' : 'L'})`).onChangeText('2.5');
    tree = h.render(Editor, { db: 'db', vehicle: v });
    const label = fuelType === 'Electric' ? 'Save charging entry' : 'Save fuel entry';
    let finish; h.setCreate(async (...args) => { h.writes.push(args); await new Promise(resolve => { finish = resolve; }); return 9; });
    find(tree, 'Button', label).onPress(); find(tree, 'Button', label).onPress();
    assert.equal(h.writes.length, 1); assert.equal(h.writes[0][2].kind, fuelType === 'Electric' ? 'charge' : 'refuel');
    assert.equal(find(h.render(Editor, { db: 'db', vehicle: v }), 'Button', label).loading, true);
    finish(); await flush(); assert.equal(h.navigation[0][1].params.entryId, '9');
  }
  pass('ICE/Diesel/CNG/EV/Hybrid rendered forms, refuel/charge submits and synchronous double-save prevention');
  {
    const h = harness(), Editor = h.load('src/app/vehicle/fuel-edit.tsx').FuelEditor;
    let tree = h.render(Editor, { db: 'db', vehicle }); find(tree, 'Button', 'Save fuel entry').onPress();
    tree = h.render(Editor, { db: 'db', vehicle }); find(tree, 'FieldMessage'); assert.equal(h.writes.length, 0);
    const edit = harness(), Edit = edit.load('src/app/vehicle/fuel-edit.tsx').FuelEditor;
    tree = edit.render(Edit, { db: 'db', vehicle, entry });
    assert.equal(find(tree, 'FormInput', 'Odometer (km)').value, '1000');
    find(tree, 'Button', 'Save fuel entry').onPress(); await flush(); assert.equal(edit.writes[0][2], entry.id);
    assert.equal(edit.writes[0][3].odometerKm, '1000');
  }
  pass('invalid form prevents persistence, edit preserves historical odometer and targets existing entry');
  const charge = { ...entry, kind: 'charge', energyMilliKwh: 20000, pricePerKwhPaise: null, chargeBeforePercent: null, chargeAfterPercent: 100, chargingLocation: 'Home' };
  const chargeRows = presentation.fuelDetailRows(charge);
  assert.ok(!chargeRows.some(([label]) => ['Fuel', 'Full tank', 'Battery before', 'Notes', 'Quoted price/kWh'].includes(label)));
  assert.ok(chargeRows.some(([label, value]) => label === 'Battery after' && value === '100%'));
  assert.ok(presentation.fuelDetailRows({ ...entry, fuelType: 'CNG' }).some(([label]) => label === 'Actual price/kg'));
  pass('entry details omit irrelevant/null fields and use CNG kg / EV kWh');
  {
    const h = harness(), Details = h.load('src/app/vehicle/fuel-details.tsx').default;
    h.setResource(entry); h.setParams({ entryId: '1' }); let tree = h.render(Details);
    find(tree, 'Button', 'Delete entry').onPress(); assert.equal(h.writes.length, 0);
    assert.equal(h.confirmations[0][2][1].style, 'destructive'); h.confirmations[0][2][0].onPress();
    tree = h.render(Details); find(tree, 'Button', 'Delete entry').onPress(); h.confirmations[1][2][1].onPress(); await flush();
    assert.equal(h.writes.length, 1); assert.equal(h.writes[0][1], 1); assert.equal(h.navigation[0][1].pathname, '/vehicle/fuel');
  }
  pass('delete requires destructive confirmation, cancel is safe, confirmed deletion is scoped');
  {
    const h = harness(), Dashboard = h.load('src/app/vehicle/fuel.tsx').default;
    const summary = { month: '2026-09', monthSpendPaise: '0', totalSpendPaise: '0', entryCount: 0, totals: [], recentEntries: [], latestEfficiency: null, costPaisePerKm: null };
    h.setResource(summary); let tree = h.render(Dashboard); find(tree, 'EmptyState'); assert.match(strings(tree), /Not enough data yet/); assert.ok(!strings(tree).includes('0 km/'));
    h.setResource({ ...summary, monthSpendPaise: '10001', totalSpendPaise: '10001', entryCount: 1, recentEntries: [entry],
      totals: [{ kind: 'refuel', fuelType: 'CNG', unit: 'kg', averagePricePaisePerUnit: { numerator: '10000', denominator: '1' } }],
      latestEfficiency: { unit: 'kg', kmPerUnit: { numerator: '142', denominator: '10' }, startDate: '2026-09-01', endDate: '2026-09-05' }, costPaisePerKm: { numerator: '100', denominator: '1' } });
    tree = h.render(Dashboard); assert.match(strings(tree), /14.20 km\/kg/); assert.match(strings(tree), /\u20b91.00/); assert.match(strings(tree), /2026-09-05/); find(tree, 'FuelEntryCard');
  }
  pass('empty/populated dashboards, null efficiency, exact valid units/cost and interval dates');
  {
    const h = harness(), History = h.load('src/app/vehicle/fuel-history.tsx').default;
    const calls = [], cursor = { vehicleId: 1, date: entry.date, id: 1 };
    h.setHistory(async (...args) => { calls.push(args); return args[2] ? { entries: [{ ...entry, id: 2 }], nextCursor: null } : { entries: [entry], nextCursor: cursor }; });
    h.render(History); await flush(); let tree = h.render(History); find(tree, 'Button', 'Load more').onPress(); find(tree, 'Button', 'Load more').onPress();
    await flush(); tree = h.render(History); assert.equal(calls.length, 2); assert.equal(calls[1][2], cursor); assert.equal(find(tree, 'FlatList').data.length, 2);
    assert.equal(find(tree, 'FlatList').ListFooterComponent, null);
  }
  pass('history uses cursor pagination, avoids duplicate page requests and stops at end');
  {
    const h = harness(), Editor = h.load('src/app/vehicle/fuel-edit.tsx').FuelEditor;
    h.setCreate(async () => { throw new Error('SQLITE secret internal error'); });
    let tree = h.render(Editor, { db: 'db', vehicle, entry: undefined });
    find(tree, 'FormInput', 'Quantity (L)').onChangeText('1'); find(tree, 'FormInput', 'Total paid (\u20b9)').onChangeText('1');
    tree = h.render(Editor, { db: 'db', vehicle }); find(tree, 'Button', 'Save fuel entry').onPress(); await flush();
    tree = h.render(Editor, { db: 'db', vehicle }); assert.match(strings(tree), /Could not save/); assert.ok(!strings(tree).includes('SQLITE'));
    assert.equal(find(tree, 'Button', 'Save fuel entry').loading, false);
    let finish; h.setCreate(async () => { await new Promise(resolve => { finish = resolve; }); return 10; });
    find(tree, 'Button', 'Save fuel entry').onPress(); h.blur(); finish(); await flush(); assert.equal(h.navigation.length, 0);
  }
  pass('save failures hide raw storage errors, release busy state and avoid navigation after blur');
  {
    const h = harness(true), hook = h.load('src/features/vehicles/use-fuel-resource.ts').useFuelResource;
    let finish; const loader = () => new Promise(resolve => { finish = resolve; });
    const Component = () => hook(loader);
    assert.equal(h.render(Component).loading, true); h.blur(); finish('stale vehicle'); await flush();
    assert.equal(h.render(Component).data, null);
  }
  pass('late focused read cannot publish after blur');
  const common = fs.readFileSync(path.join(__dirname, '../src/components/vehicles/fuel-ui.tsx'), 'utf8');
  assert.match(common, /useAppearance/); assert.match(common, /ScreenHeader/); assert.match(common, /keyboardShouldPersistTaps="handled"/);
  assert.match(common, /typography/); assert.match(common, /InteractiveCard/);
  pass('shared semantic theme/components, accessible cards and keyboard-friendly frame');
  console.log(`PASS: ${passes} Fuel UI/integration groups (React hooks/native components adapted; no device rendering).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
