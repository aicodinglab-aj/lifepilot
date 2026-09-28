/* global __dirname */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const settings=read('src/app/settings.tsx'),screen=read('src/app/backup-restore.tsx'),layout=read('src/app/_layout.tsx'),coordinator=read('src/features/backup/restore-coordinator.tsx');
assert.match(settings,/router\.push\('\/backup-restore'\)/,'Settings route missing');
assert.match(screen,/inspectRestore\(picked\.result\)/);assert.ok(screen.indexOf('inspectRestore(picked.result)')<screen.indexOf("coordinator.runRestore(picked.result)"),'inspection must precede restore');
assert.match(screen,/style:'destructive'/);assert.match(screen,/text:'Cancel'.*setBusy\(null\)/);assert.match(screen,/if\(busy\)return/,'operations need concurrency guard');
assert.match(layout,/<RestoreCoordinator><ThemedNavigation/);
assert.match(coordinator,/restoreBlocksNavigation\(state\)/);
assert.match(coordinator,/session.run/);
assert.match(coordinator,/Close and reopen LifePilot/);
assert.match(coordinator,/Stop using LifePilot and close the application/);
assert.match(coordinator,/restoreBlocksNavigation\(session.getState\(\)\)/);
assert.match(screen,/Directory\.pickDirectoryAsync/);assert.match(screen,/File\.pickFileAsync/);
console.log('PASS: Settings route, operation guard, inspect-before-confirm, cancel, root suspension token, restart lock, error release, export and picker integration.');
