/* global __dirname */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const settings=read('src/app/settings.tsx'),screen=read('src/app/backup-restore.tsx'),layout=read('src/app/_layout.tsx'),coordinator=read('src/features/backup/restore-coordinator.tsx');
assert.match(settings,/router\.push\('\/backup-restore'\)/,'Settings route missing');
assert.match(screen,/inspectRestore\(picked\.result\)/);assert.ok(screen.indexOf('inspectRestore(picked.result)')<screen.indexOf("coordinator.runRestore(picked.result)"),'inspection must precede restore');
assert.match(screen,/style:'destructive'/);assert.match(screen,/text:'Cancel'.*onPress:finish/);
assert.match(layout,/<RestoreCoordinator><ThemedNavigation/);
assert.match(coordinator,/restoreBlocksNavigation\(state\)/);
assert.match(coordinator,/session.run/);
assert.match(coordinator,/Close and reopen LifePilot/);
assert.match(coordinator,/Stop using LifePilot and close the application/);
assert.match(coordinator,/restoreBlocksNavigation\(session.getState\(\)\)/);
assert.match(screen,/Directory\.pickDirectoryAsync/);assert.match(screen,/File\.pickFileAsync/);
assert.match(screen,/const begin=.*busyRef\.current/,'backup immediate invocation guard missing');
assert.match(screen,/The operation could not be completed\. Please try again\./,'unexpected backup errors must be safe');
const {createLoader}=require('./helpers/load-typescript.cjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject};};
let finished=false;
process.on('beforeExit',()=>{if(!finished){console.error('FAIL: backup UI tests did not finish');process.exitCode=1;}});
async function main(){
 let index=0,cells=[],calls=0,picks=0,next=deferred(),alerted=deferred();const alerts=[];
 const jsx=(type,props)=>({type,props:props??{}});
 const load=createLoader({
  react:{useState(initial){const slot=index++;if(!(slot in cells))cells[slot]=initial;return[cells[slot],v=>{cells[slot]=v;}];},useRef(initial){const slot=index++;return cells[slot]??={current:initial};}},
  'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{Alert:{alert:(...args)=>{alerts.push(args);alerted.resolve();}},ScrollView:'ScrollView',Text:'Text',View:'View'},
  'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'expo-symbols':{SymbolView:'SymbolView'},'expo-sqlite':{useSQLiteContext:()=>({})},
  'expo-file-system':{Directory:{pickDirectoryAsync:async()=>({createFile:()=>({})})},File:{pickFileAsync:async()=>{picks++;return{canceled:true};}}},
  '@/components/ui/button':{Button:'Button'},'@/components/ui/card':{StandardCard:'StandardCard',StatusCard:'StatusCard'},
  '@/components/ui/screen-header':{ScreenHeader:'ScreenHeader'},'@/components/ui/section':{Section:'Section'},
  '@/features/appearance/appearance-provider':{useAppearance:()=>({colors:{}})},
  '@/features/backup/backup-service':{createBackup:()=>{calls++;return next.promise;}},
  '@/features/backup/restore-service':{inspectRestore:async()=>({})},
  '@/features/backup/restore-coordinator':{useRestoreCoordinator:()=>({lastError:null})},
 });
 const Component=load('src/app/backup-restore.tsx').default;
 const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...Object.values(t.props??{}).flatMap(nodes)];
 const render=()=>{index=0;return Component();};
 const button=(tree,label)=>nodes(tree).find(n=>n.type==='Button'&&n.props.label===label).props;
 const tree=render(),press=button(tree,'Create Backup').onPress;
 press();press();button(tree,'Restore Backup').onPress();
 assert.equal(calls,1,'two invocations before render must start only one service call');assert.equal(picks,0);
 const result={file:{size:4},manifest:{createdAt:'2026-09-29'},cleanupIncomplete:true};
 next.resolve(result);await alerted.promise;
 assert.ok(alerts.some(a=>a[0]==='Backup created'&&a[1].includes('cleanup')));
 next=deferred();alerted=deferred();button(render(),'Create Backup').onPress();assert.equal(calls,2);
 const {BackupError}=load('src/features/backup/backup-format.ts');const error=new BackupError('snapshot','Snapshot failed');error.cleanupIncomplete=true;
 next.reject(error);await alerted.promise;
 assert.ok(alerts.some(a=>a[0]==='Backup not created'&&a[1].includes('cleanup')));
 next=deferred();alerted=deferred();button(render(),'Create Backup').onPress();assert.equal(calls,3,'failure must release immediate guard');next.resolve(result);await alerted.promise;
 finished=true;
 console.log('PASS: rendered rapid double invocation admits one service operation; cross-action guard, success/failure release and cleanup messages.');
 console.log('PASS: Settings route, inspect-before-confirm, cancel, root suspension, restart lock, error release, export and picker integration.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
