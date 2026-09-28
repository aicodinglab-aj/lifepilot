const assert = require('node:assert/strict');
const { createLoader } = require('./helpers/load-typescript.cjs');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
let completed = false;
process.on('beforeExit', () => { if (!completed) { console.error('FAIL: session test did not finish'); process.exitCode = 1; } });

async function main() {
  const result = { restoredSchemaVersion: 9, persistentFileCount: 0, restartRequired: true, cleanupIncomplete: false };
  for (const outcome of ['pre-replacement', 'rolled-back', 'success', 'catastrophic']) {
    const load = createLoader({ 'expo-file-system': {}, 'expo-sqlite': {}, 'expo-crypto': {}, 'expo-constants': {} });
    const activity = load('src/features/activity/operation-lifecycle.ts').applicationActivity;
    const { RollbackFailureError } = load('src/features/backup/restore-service.ts');
    const { createRestoreSession, restoreBlocksNavigation } = load('src/features/backup/restore-session.ts');
    const session = createRestoreSession(), end = deferred();
    const operation = activity.run(async () => { await end.promise; });
    let called = false;
    const restore = session.run(async token => {
      called = true; activity.assertExclusive(token);
      assert.equal(token.dataAccessSuspended, true);
      if (outcome === 'catastrophic') throw new RollbackFailureError();
      if (outcome !== 'success') throw Error('private/path/should/not/appear');
      return result;
    });
    const settled = restore.then(() => null, error => error);
    assert.equal(session.getState(), 'suspending');
    assert.equal(restoreBlocksNavigation(session.getState()), true);
    await Promise.resolve(); assert.equal(called, false);
    await assert.rejects(activity.run(async () => assert.fail('must not start')));
    end.resolve(); await operation; const error = await settled;
    if (outcome === 'pre-replacement' || outcome === 'rolled-back') {
      assert.ok(error); assert.equal(session.getState(), 'idle');
      assert.equal(restoreBlocksNavigation(session.getState()), false);
      assert.doesNotMatch(session.getError(), /private\/path/);
      await activity.run(async () => {});
    } else {
      assert.equal(session.getState(), outcome === 'success' ? 'success' : 'recovery');
      assert.equal(activity.getState(), 'exclusive');
      assert.equal(restoreBlocksNavigation(session.getState()), true);
      await assert.rejects(activity.run(async () => assert.fail('must stay locked')));
      await assert.rejects(session.run(async () => result));
    }
    console.log(`PASS: session ${outcome} ownership, drain and navigation outcome`);
  }

  // Execute the actual component with a minimal hook/native harness. The Back
  // handler must consult live session state even before the next render.
  let session, backHandler;
  class RollbackFailureError extends Error {}
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useState: init => { session ??= init(); return [session]; },
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useEffect: action => action(),
  };
  const load = createLoader({
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { View: 'View', Text: 'Text', BackHandler: { addEventListener: (_event, action) => { backHandler = action; return { remove() {} }; } } },
    'expo-sqlite': { useSQLiteContext: () => ({}) },
    '@/features/appearance/appearance-provider': { useAppearance: () => ({ colors: {} }) },
    '@/constants/design-system': { spacing: {}, typography: {} },
    './restore-service': { RollbackFailureError, restoreBackup: async () => { throw new RollbackFailureError(); } },
  });
  const Component = load('src/features/backup/restore-coordinator.tsx').RestoreCoordinator;
  const normal = Component({ children: 'navigation' }); assert.equal(backHandler(), false);
  const running = normal.props.value.runRestore({});
  assert.equal(backHandler(), true);
  await assert.rejects(running);
  const locked = Component({ children: 'navigation' });
  assert.equal(backHandler(), true); assert.equal(locked.type, 'View');
  assert.doesNotMatch(JSON.stringify(locked), /navigation|Continue anyway/);
  assert.match(JSON.stringify(locked), /Reopening does not confirm/);
  console.log('PASS: actual coordinator removes navigation and blocks Android Back throughout catastrophic lock');
  completed = true;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
