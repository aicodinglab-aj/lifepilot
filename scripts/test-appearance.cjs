/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function load(relative, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Error, require: (name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}
const legacy = load('src/constants/lifepilot-theme.ts');
const theme = load('src/features/appearance/theme.ts', { '@/constants/lifepilot-theme': legacy });
function preferences() {
  return load('src/features/appearance/preference.ts', { './theme': theme });
}
function storage(entries = []) {
  const values = new Map(entries);
  return {
    values,
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => { values.set(key, value); },
  };
}
const custom = (base, accent, system = null) => theme.resolveTheme('custom', system, { base, accent });

test('shared V2 header renders an icon-only accessible Back action', () => {
  const jsx = (type, props) => typeof type === 'function' ? type(props) : ({ type, props });
  const actions = [];
  let canGoBack = true;
  const header = load('src/components/ui/screen-header.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { Stack: { Screen: 'Screen' }, router: { canGoBack: () => canGoBack,
      back: () => actions.push('back'), replace: (route) => actions.push(route) } },
    'expo-symbols': { SymbolView: 'SymbolView' },
    'react-native': { View: 'View' },
    '@/constants/design-system': { iconSizes: { navigation: 24 } },
    '@/features/appearance/appearance-provider': { useAppearance: () => ({ colors: theme.resolveTheme('lifepilot').colors }) },
    './button': { IconButton: (props) => ({ type: 'IconButton', props }) },
  }).ScreenHeader({ title: 'Tasks / To-Do', fallbackHref: '/tasks' });
  assert.equal(header.props.options.title, 'Tasks / To-Do');
  assert.equal(header.props.options.headerBackVisible, false);
  const back = header.props.options.headerLeft().props.children;
  assert.equal(back.props.accessibilityLabel, 'Back');
  assert.equal(back.props.icon.type, 'SymbolView');
  back.props.onPress(); assert.equal(actions.pop(), 'back');
  canGoBack = false; back.props.onPress(); assert.equal(actions.pop(), '/tasks');
});

test('Settings About navigation and developer information render safely across appearances', () => {
  const jsx = (type, props) => typeof type === 'function' ? type(props) : ({ type, props });
  let resolved = theme.resolveTheme('lifepilot', null);
  let config = { version: '2.3.4', android: { versionCode: 42 }, ios: { buildNumber: '17' } };
  const platform = { OS: 'android' }, actions = [];
  let canGoBack = true;
  const dependencies = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-constants': { __esModule: true, default: { get expoConfig() { return config; } } },
    'expo-image': { Image: 'Image' },
    'expo-symbols': { SymbolView: 'SymbolView' },
    'expo-router': { Stack: { Screen: 'Screen' }, router: {
      push: (route) => actions.push(route), replace: (route) => actions.push(route),
      back: () => actions.push('back'), canGoBack: () => canGoBack,
    } },
    'react-native': { Platform: platform, Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/ui/card': {
      StandardCard: ({ children }) => jsx('View', { children }),
      InteractiveCard: ({ accessibilityLabel, onPress, children }) => jsx('Pressable', { accessibilityLabel, onPress, children }),
    },
    '@/components/ui/screen-header': { ScreenHeader: ({ title, fallbackHref }) => jsx('Screen', { options: { title,
      headerLeft: () => jsx('Pressable', { onPress: () => canGoBack ? actions.push('back') : actions.push(fallbackHref) }) } }) },
    '@/components/ui/section': { Section: ({ title, children }) => jsx('View', { title, children }) },
    '@/constants/design-system': { iconSizes: { card: 28, action: 20 }, layout: { screenContent: {} },
      radii: { lg: 18, md: 14 }, spacing: { xs: 4, sm: 8, md: 12, base: 16 },
      typography: { hero: {}, sectionHeading: {}, cardTitle: {}, body: {}, secondaryBody: {}, label: {}, caption: {} } },
    '@/assets/images/lifepilot-icon.png': 'existing-logo',
    '@/features/appearance/appearance-provider': { useAppearance: () => ({
      colors: resolved.colors, preference: 'lifepilot', custom: { base: 'dark', accent: 'emerald' }, saving: false,
    }) },
    '@/features/appearance/theme': theme,
  };
  const about = load('src/app/about.tsx', dependencies);
  const settings = load('src/app/settings.tsx', dependencies);
  const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
  const text = (tree) => JSON.stringify(tree);
  const row = nodes(settings.default()).find((node) => node.props?.accessibilityLabel === 'About LifePilot');
  assert.ok(row); row.props.onPress(); assert.equal(actions.pop(), '/about');
  for (const selected of [theme.resolveTheme('lifepilot', null), theme.resolveTheme('light', null),
    theme.resolveTheme('system', 'dark'), theme.resolveTheme('system', 'light'), custom('dark', 'purple'), custom('light', 'purple')]) {
    resolved = selected;
    const tree = about.default();
    assert.equal(tree.props.style.backgroundColor, selected.colors.background);
    assert.match(text(tree), /DMJ Labs/); assert.match(text(tree), /Your personal vehicle and expense companion/);
    assert.match(text(tree), /2\.3\.4/); assert.match(text(tree), /42/);
    assert.equal(nodes(tree).find((node) => node.type === 'Image').props.source, 'existing-logo');
    const header = nodes(tree).find((node) => node.type === 'Screen').props.options.headerLeft();
    header.props.onPress(); assert.equal(actions.pop(), 'back');
    canGoBack = false; header.props.onPress(); assert.equal(actions.pop(), '/settings'); canGoBack = true;
  }
  platform.OS = 'ios'; assert.match(text(about.default()), /17/);
  platform.OS = 'web'; assert.match(text(about.default()), /Not available/);
  config = null; platform.OS = 'android'; assert.match(text(about.default()), /Not available/);
});

test('fresh installation and upgrade without preference preserve LifePilot and existing data', async () => {
  for (const system of ['light', 'dark', null]) {
    const store = storage([['unrelated.setting', 'preserved']]);
    const selected = await preferences().readTheme(store);
    assert.equal(selected, 'lifepilot');
    assert.equal(theme.resolveTheme(selected, system).id, 'lifepilot');
    assert.deepEqual([...store.values], [['unrelated.setting', 'preserved']]);
  }
  const resolved = theme.resolveTheme('lifepilot', null);
  for (const [token, color] of Object.entries(legacy.lifePilotColors)) {
    assert.equal(resolved.colors[token], color);
    assert.equal(theme.themeColor(color, resolved), color);
  }
  const styles = { card: { backgroundColor: '#14201B', padding: 18 } };
  assert.equal(theme.themedStyles(styles, resolved), styles);
});

test('exactly LifePilot, Light, System default, and Custom are selectable', () => {
  assert.deepEqual([...theme.THEME_OPTIONS], ['lifepilot', 'light', 'system', 'custom']);
});

test('Light is explicit; System Light -> Light and System Dark -> LifePilot', () => {
  const light = theme.resolveTheme('light', 'dark');
  assert.equal(light.id, 'light');
  assert.equal(light.isDark, false);
  assert.equal(light.colors.card, '#FFFFFF');
  assert.equal(theme.resolveTheme('system', 'light'), light);
  assert.equal(theme.resolveTheme('system', 'dark'), theme.resolveTheme('lifepilot', 'light'));
  assert.equal(theme.resolveTheme('system', null), light);
});

test('Custom defaults to Dark + Emerald', () => {
  const resolved = theme.resolveTheme('custom', 'light');
  assert.equal(resolved.isDark, true);
  assert.equal(resolved.colors.primary, '#35D98A');
  assert.equal(resolved.colors.card, '#202020');
});

test('Custom Dark + Blue and Custom Light + Purple use base-specific palettes', () => {
  const blue = custom('dark', 'blue');
  assert.equal(blue.colors.primary, '#79B8FF');
  assert.equal(blue.colors.background, '#121212');
  const purple = custom('light', 'purple');
  assert.equal(purple.colors.primary, '#7030B5');
  assert.equal(purple.colors.card, '#FFFFFF');
  assert.equal(purple.isDark, false);
});

test('accent/base changes update styles without mutating or leaking cached variants', () => {
  const styles = { card: { backgroundColor: '#14201B', color: '#35D98A', padding: 18 },
    action: { color: '#0B1110' } };
  for (const base of theme.CUSTOM_BASES) {
    for (const accent of theme.ACCENT_OPTIONS) {
      const resolved = custom(base, accent);
      const converted = theme.themedStyles(styles, resolved);
      assert.equal(converted.card.backgroundColor, resolved.colors.card);
      assert.equal(converted.card.color, resolved.colors.primary);
      assert.equal(converted.action.color, resolved.colors.onPrimary);
      assert.equal(converted.card.padding, 18);
      assert.equal(theme.themedStyles(styles, resolved), converted);
      assert.equal(custom(base, accent, 'dark'), custom(base, accent, 'light'));
    }
  }
  assert.equal(styles.card.color, '#35D98A');
  assert.equal(styles.card.backgroundColor, '#14201B');
});

test('semantic income, expense, danger, success and warning are independent of accent', () => {
  for (const base of theme.CUSTOM_BASES) {
    const emerald = custom(base, 'emerald').colors;
    for (const accent of theme.ACCENT_OPTIONS) {
      const resolved = custom(base, accent);
      for (const token of ['text', 'muted', 'income', 'expense', 'danger', 'success', 'warning']) {
        assert.equal(resolved.colors[token], emerald[token]);
      }
      assert.equal(theme.themeColor('#5BE49B', resolved), emerald.success);
      assert.equal(theme.themeColor('#F5C76B', resolved), emerald.warning);
      assert.equal(theme.themeColor('#FFB6A6', resolved), emerald.expense);
    }
  }
});

test('V2 surface, divider, info and disabled roles resolve for every appearance base', () => {
  const resolved = [theme.resolveTheme('lifepilot'), theme.resolveTheme('light')];
  for (const base of theme.CUSTOM_BASES) for (const accent of theme.ACCENT_OPTIONS) resolved.push(custom(base, accent));
  for (const appearance of resolved) {
    const colors = appearance.colors;
    assert.equal(colors.surface, colors.card);
    for (const token of ['surfaceSecondary', 'divider', 'info', 'disabledText', 'disabledSurface']) {
      assert.match(colors[token], /^#[0-9A-F]{6}$/i, `${appearance.id}: ${token}`);
    }
    assert.notEqual(colors.surfaceSecondary, colors.background);
  }
});

test('custom persistence and switching away/back preserve customization across module reload', async () => {
  const store = storage();
  await preferences().writeTheme(store, 'custom');
  await preferences().writeCustomTheme(store, { base: 'dark', accent: 'blue' });
  await preferences().writeTheme(store, 'lifepilot');
  assert.equal(await preferences().readTheme(store), 'lifepilot');
  await preferences().writeTheme(store, 'custom');
  assert.deepEqual({ ...await preferences().readCustomTheme(store) }, { base: 'dark', accent: 'blue' });
  await preferences().writeCustomTheme(store, { base: 'light', accent: 'purple' });
  assert.deepEqual({ ...await preferences().readCustomTheme(store) }, { base: 'light', accent: 'purple' });
  for (const selected of theme.THEME_OPTIONS) {
    await preferences().writeTheme(store, selected);
    assert.equal(await preferences().readTheme(store), selected);
  }
});

test('invalid custom base and accent fall back independently', async () => {
  const { readCustomTheme, CUSTOM_THEME_KEY } = preferences();
  const read = (value) => readCustomTheme(storage([[CUSTOM_THEME_KEY, JSON.stringify(value)]]));
  assert.deepEqual({ ...await read({ base: 'invalid', accent: 'blue' }) }, { base: 'dark', accent: 'blue' });
  assert.deepEqual({ ...await read({ base: 'light', accent: 'invalid' }) }, { base: 'light', accent: 'emerald' });
  for (const invalid of ['{broken', 'null', '42', '[]', '{}']) {
    assert.deepEqual({ ...await readCustomTheme(storage([[CUSTOM_THEME_KEY, invalid]])) }, { base: 'dark', accent: 'emerald' });
  }
});

test('legacy dark and missing/corrupted main preferences resolve to LifePilot', async () => {
  const { readTheme, THEME_KEY } = preferences();
  for (const value of ['dark', '', 'invalid', 'Dark', 'null', '{broken']) {
    assert.equal(await readTheme(storage([[THEME_KEY, value]])), 'lifepilot');
  }
  for (const value of [undefined, null, 42, {}]) assert.equal(theme.themePreference(value), 'lifepilot');
});

test('invalid writes and storage failures do not overwrite saved choices', async () => {
  const { readTheme, writeTheme, writeCustomTheme, THEME_KEY } = preferences();
  const store = storage([[THEME_KEY, 'lifepilot']]);
  await assert.rejects(writeTheme(store, 'dark'), /Invalid theme preference/);
  await assert.rejects(writeCustomTheme(store, { base: 'invalid', accent: 'blue' }), /Invalid custom theme/);
  assert.equal(await readTheme(store), 'lifepilot');
  const broken = { ...store, setItemAsync: async () => { throw new Error('disk full'); } };
  await assert.rejects(writeTheme(broken, 'custom'), /disk full/);
  await assert.rejects(writeCustomTheme(broken, theme.DEFAULT_CUSTOM), /disk full/);
  assert.equal(await readTheme(store), 'lifepilot');
});

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
test('every Custom preset has readable text/actions/statuses and visible control boundaries', () => {
  for (const base of theme.CUSTOM_BASES) for (const accent of theme.ACCENT_OPTIONS) {
    const { colors } = custom(base, accent);
    for (const surface of ['background', 'card', 'primarySurface']) {
      for (const foreground of ['text', 'muted', 'primary', 'danger', 'warning', 'success', 'income', 'expense', 'disabled']) {
        assert.ok(contrast(colors[foreground], colors[surface]) >= 4.5, `${base}/${accent}: ${foreground} on ${surface}`);
      }
    }
    assert.ok(contrast(colors.primary, colors.onPrimary) >= 4.5, `${base}/${accent}: button text`);
    assert.ok(contrast(colors.controlBorder, colors.card) >= 3, `${base}/${accent}: control border`);
  }
});

// A small hook harness exercises provider state and async storage, without a native renderer.
function providerHarness(store) {
  let cursor = 0, mounted = false, system = 'light';
  const slots = [], effects = [];
  const react = {
    createContext: (value) => ({ Provider: 'Provider', value }),
    useContext: (context) => context.value,
    useState: (initial) => {
      const index = cursor++;
      if (!mounted) slots[index] = initial;
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef: (initial) => {
      const index = cursor++;
      if (!mounted) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect: (effect) => { if (!mounted) effects.push(effect); },
  };
  const jsx = (type, props) => ({ type, props });
  const { AppearanceProvider } = load('src/features/appearance/appearance-provider.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { useColorScheme: () => system, View: 'View', ActivityIndicator: 'ActivityIndicator' },
    'expo-sqlite/kv-store': { SQLiteStorage: function () { return store; } },
    './theme': theme, './preference': preferences(),
  });
  const child = { id: 'existing application tree' };
  return {
    render: () => {
      cursor = 0;
      const tree = AppearanceProvider({ children: child });
      mounted = true;
      while (effects.length) effects.shift()();
      return tree;
    },
    setSystem: (value) => { system = value; },
    child,
  };
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test('provider previews immediately, rolls back failed saves, and retains the application subtree', async () => {
  const store = storage();
  const harness = providerHarness(store);
  harness.render();
  await flush();
  let tree = harness.render();
  assert.equal(tree.props.value.preference, 'lifepilot');
  await tree.props.value.setPreference('custom');
  tree = harness.render();
  const original = tree.props.value.resolved;
  let rejectWrite;
  store.setItemAsync = () => new Promise((resolve, reject) => { rejectWrite = reject; });
  const pending = tree.props.value.setCustom({ base: 'dark', accent: 'blue' });
  tree = harness.render();
  assert.equal(tree.props.value.colors.primary, '#79B8FF');
  assert.equal(tree.props.value.saving, true);
  assert.equal(tree.props.children, harness.child);
  rejectWrite(new Error('disk full'));
  await pending;
  tree = harness.render();
  assert.equal(tree.props.value.resolved, original);
  assert.equal(tree.props.value.saving, false);
  assert.match(tree.props.value.error, /restored/);
});

test('provider startup restores custom settings and only System reacts to device changes', async () => {
  const store = storage();
  await preferences().writeCustomTheme(store, { base: 'light', accent: 'purple' });
  await preferences().writeTheme(store, 'custom');
  const harness = providerHarness(store);
  harness.render();
  await flush();
  let value = harness.render().props.value;
  assert.equal(value.colors.primary, '#7030B5');
  harness.setSystem('dark');
  assert.equal(harness.render().props.value.resolved, value.resolved);
  await value.setPreference('system');
  value = harness.render().props.value;
  assert.equal(value.resolved.id, 'lifepilot');
  harness.setSystem('light');
  value = harness.render().props.value;
  assert.equal(value.resolved.id, 'light');
  await value.setPreference('custom');
  assert.equal(harness.render().props.value.colors.primary, '#7030B5');
});

test('root theme updates retain SQLite setup identities and update navigation colors', () => {
  let resolved = theme.resolveTheme('lifepilot', null);
  const jsx = (type, props) => ({ type, props });
  const migrateDatabase = async () => {};
  const root = load('src/app/_layout.tsx', {
    '@/features/appearance/appearance-provider': {
      AppearanceProvider: 'AppearanceProvider',
      useThemedStyles: (styles) => theme.themedStyles(styles, resolved),
      useAppearance: () => ({ resolved, colors: resolved.colors, isDark: resolved.isDark }),
    },
    react: { useState: () => [null, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { DarkTheme: { colors: {} }, DefaultTheme: { colors: {} },
      router: {}, Stack: { Screen: 'Screen' }, ThemeProvider: 'ThemeProvider' },
    'expo-splash-screen': { preventAutoHideAsync: () => {} },
    'expo-sqlite': { SQLiteProvider: 'SQLiteProvider' },
    'react-native': { Pressable: 'Pressable', StatusBar: 'StatusBar', Text: 'Text', View: 'View', StyleSheet: { create: (styles) => styles } },
    '@/components/animated-icon': { AnimatedSplashOverlay: 'AnimatedSplashOverlay' },
    '@/constants/lifepilot-theme': legacy,
    '@/database/migrate': { migrateDatabase },
    '@/features/reminders/reminder-provider': { ReminderProvider: 'ReminderProvider' },
    '@/features/tasks/task-provider': { TaskProvider: 'TaskProvider' },
  });
  const render = root.default().props.children.type;
  const first = render();
  for (const base of theme.CUSTOM_BASES) for (const accent of theme.ACCENT_OPTIONS) {
    resolved = custom(base, accent);
    const next = render();
    assert.equal(next.type, first.type);
    for (const prop of ['databaseName', 'options', 'onInit', 'key']) {
      assert.equal(next.props[prop], first.props[prop], prop);
    }
    assert.equal(next.props.children.type, first.props.children.type);
    const navigation = next.props.children.type();
    assert.equal(navigation.props.value.colors.primary, resolved.colors.primary);
  }
});
