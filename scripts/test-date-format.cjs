/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function load(relative, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports, Error, require: (name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}

const dates = load('src/features/dates/date-format.ts');
const legacy = load('src/constants/lifepilot-theme.ts');
const theme = load('src/features/appearance/theme.ts', {
  '@/constants/lifepilot-theme': legacy,
});
const preferences = load('src/features/appearance/preference.ts', {
  './theme': theme,
  '@/features/dates/date-format': dates,
});

function storage(entries = []) {
  const values = new Map(entries);
  return {
    values,
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => { values.set(key, value); },
  };
}

test('the three date formats render and parse the same ISO date without timezone conversion', () => {
  const iso = '2026-11-26';
  const examples = new Map([
    ['DD-MM-YYYY', '26-11-2026'],
    ['MM-DD-YYYY', '11-26-2026'],
    ['YYYY-MM-DD', '2026-11-26'],
  ]);
  for (const [format, expected] of examples) {
    assert.equal(dates.formatDate(iso, format), expected);
    assert.equal(dates.parseFormattedDate(expected, format), iso);
  }
  assert.equal(dates.formatDate('2026-11-26T00:00:00Z', 'DD-MM-YYYY'), 'Not added');
});

test('date formats reject invalid dates and incomplete inputs safely', () => {
  assert.equal(dates.isIsoDate('2026-02-29'), false);
  assert.equal(dates.isIsoDate('2024-02-29'), true);
  assert.equal(dates.formatDate(null), 'Not added');
  assert.equal(dates.formatDate('not-a-date'), 'Not added');
  assert.equal(dates.parseFormattedDate('31-02-2026', 'DD-MM-YYYY'), null);
  assert.equal(dates.parseFormattedDate('26-11', 'DD-MM-YYYY'), null);
  assert.equal(dates.formatDateTime('invalid', 'MM-DD-YYYY'), 'Not available');
  assert.match(dates.formatDateTime('2026-11-26T12:30:00.000Z', 'YYYY-MM-DD'), /^2026-11-26 /);
});

test('date format preference defaults to DD-MM-YYYY and persists independently of other preferences', async () => {
  const store = storage([['unrelated.setting', 'keep'], ['appearance.theme', 'dark']]);
  assert.equal(await preferences.readDateFormat(store), 'DD-MM-YYYY');
  for (const format of dates.DATE_FORMATS) {
    await preferences.writeDateFormat(store, format);
    assert.equal(await preferences.readDateFormat(store), format);
    assert.equal(await preferences.readDateFormat(store), format); // a fresh read simulates application restart
  }
  assert.equal(store.values.get('unrelated.setting'), 'keep');
  assert.equal(store.values.get('appearance.theme'), 'dark');
  store.values.set(preferences.DATE_FORMAT_KEY, 'invalid');
  assert.equal(await preferences.readDateFormat(store), 'DD-MM-YYYY');
  await assert.rejects(() => preferences.writeDateFormat(store, 'invalid'));
});
