/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createLoader } = require('./helpers/load-typescript.cjs');
const { fixture } = require('./helpers/fuel-fixture.cjs');
const pure = createLoader(), calc = pure('src/features/personal/budget.ts');
const presentation = pure('src/features/personal/budget-presentation.ts');
const theme = pure('src/features/appearance/theme.ts');
const ui = Object.fromEntries(['Button','IconButton','StandardCard','EmptyState','Section','StatusBadge','Chip','FieldMessage','FormInput'].map(n=>[n,n]));
const flush = () => new Promise(resolve => setImmediate(resolve));
let groups=0, finished=false, runtimeActivity;
const pass = message => {groups++;console.log(`PASS: ${message}`);};
process.on('beforeExit',()=>{if(!finished){console.error('Budget UI tests did not finish');process.exitCode=1;}});
function harness(db, repository) {
 let index=0, cells=[], params={}, currentTheme=theme.resolveTheme('lifepilot'), mutationError=null, navigationError=false;
 const calls=[], navigation=[], confirmations=[], listeners=new Set();
 const react={
  useState(initial){const slot=index++;if(!(slot in cells))cells[slot]=typeof initial==='function'?initial():initial;return[cells[slot],value=>{cells[slot]=typeof value==='function'?value(cells[slot]):value;}];},
  useRef(initial){const slot=index++;return cells[slot]??={current:initial};},
  useCallback(fn,deps){const slot=index++,old=cells[slot];if(!old||deps.some((v,i)=>v!==old.deps[i]))cells[slot]={fn,deps};return cells[slot].fn;},
 };
 const jsx=(type,props)=>({type,props:props??{}});
 const methods=Object.fromEntries(Object.entries(repository).map(([name,fn])=>[name,async(...args)=>{
  calls.push({name,args});if(mutationError&&!name.startsWith('get')&&!name.startsWith('list'))throw mutationError;return fn(...args);
 }]));
 const load=createLoader({react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
  'react-native':{Text:'Text',View:'View',Keyboard:{dismiss(){}},Alert:{alert:(...a)=>confirmations.push(a)},AppState:{addEventListener(_name,fn){listeners.add(fn);return{remove:()=>listeners.delete(fn)};}}},
  'expo-symbols':{SymbolView:'SymbolView'},'expo-sqlite':{useSQLiteContext:()=>db},
  'expo-router':{useLocalSearchParams:()=>params,router:Object.fromEntries(['push','dismissTo'].map(n=>[n,value=>{if(navigationError)throw Error('navigation');navigation.push({name:n,value});}])),
   useFocusEffect(callback){const slot=index++;if(cells[slot]?.callback!==callback){cells[slot]?.cleanup?.();cells[slot]={callback,cleanup:callback(),effect:true};}}},
  '@/components/ui':ui,'@/components/personal/ui':{PersonalPage:'PersonalPage',Action:'Action'},
  '@/components/personal/budget-ui':{BudgetMonthSelector:'BudgetMonthSelector',BudgetProgressCard:'BudgetProgressCard'},
  '@/components/personal/error-boundary':{PersonalErrorBoundary:'PersonalErrorBoundary'},
  '@/features/appearance/appearance-provider':{useAppearance:()=>currentTheme},
  '@/features/activity/operation-lifecycle':runtimeActivity,
  '@/features/personal/diagnostics':{personalDiagnostic(){}},'@/database/personal-budgets':methods,
 });
 return {load,calls,navigation,confirmations,render(Component,props={}){index=0;return Component(props);},setParams:p=>{params=p;},
  setTheme:t=>{currentTheme=t;},setMutationError:e=>{mutationError=e;},setNavigationError:v=>{navigationError=v;},
  blur(){for(const cell of cells)if(cell?.effect){cell.cleanup?.();cell.callback=null;}},active(){listeners.forEach(fn=>fn('active'));}};
}
function nodes(tree){if(tree==null||typeof tree==='boolean')return[];if(Array.isArray(tree))return tree.flatMap(nodes);if(typeof tree!=='object')return[tree];return[tree,...Object.values(tree.props??{}).flatMap(v=>typeof v==='object'?nodes(v):[])];}
function find(tree,type,label){const node=nodes(tree).find(n=>n?.type===type&&(label===undefined||(n.props.label===label||n.props.title===label)));assert.ok(node,`${type} ${label}`);return node.props;}
function text(tree){return JSON.stringify(tree);}
async function main(){
 const f=fixture();try{
 runtimeActivity=f.load('src/features/activity/operation-lifecycle.ts');
 const db=f.database(),repo=f.load('src/database/personal-budgets.ts'),personal=f.load('src/database/personal.ts');await f.load('src/database/migrate.ts').migrateDatabase(db);
 const input=(amount,categoryId='expense-food',date='2026-09-01',type='expense')=>({type,amount,categoryId,transactionDate:date,description:'',notes:'',paymentMethod:''});
 const source=fs.readFileSync(path.join(__dirname,'../src/app/personal/index.tsx'),'utf8');assert.match(source,/label="Budget".*pathname: '\/personal\/budget', params: \{ month \}/);
 assert.equal(presentation.budgetRouteMonth('2026-09'),'2026-09');assert.equal(presentation.budgetRouteMonth('2026-13'),null);
 pass('Personal Expense Budget link carries month; invalid month links are rejected');
 {
  const h=harness(db,repo),components=h.load('src/components/personal/budget-ui.tsx');
  for(const [spent,status,label,fill] of [['0','ON_TRACK','On track',0],['7999','ON_TRACK','On track',79.9],['8000','NEAR_LIMIT','Near limit',80],['10000','LIMIT_REACHED','Limit reached',100],['12400','OVER_BUDGET','Over budget',100]]){
   const progress=calc.calculateBudgetProgress(10000,spent,'1');assert.equal(progress.status,status);
   const display=presentation.budgetProgressPresentation(progress);assert.equal(display.label,label);assert.equal(display.fill,fill);
   const tree=h.render(components.BudgetProgressCard,{title:'Monthly Budget',progress,onEdit(){}});
   const bar=nodes(tree).find(n=>n?.props?.accessibilityRole==='progressbar').props;
   assert.equal(bar.accessibilityValue.now,fill);assert.ok(bar.accessibilityValue.text.includes(label));
   if(status==='OVER_BUDGET'){assert.match(text(tree),/124.0%/);assert.match(text(tree),/over budget/);assert.ok(!text(tree).includes('remaining'));}
  }
  assert.equal(presentation.budgetProgressPresentation(calc.calculateBudgetProgress(null,'0','0')),null);
  for(const pref of ['lifepilot','light','system','custom'])for(const system of ['light','dark']){
   const resolved=theme.resolveTheme(pref,system,{base:system,accent:'purple'});h.setTheme(resolved);
   const tree=h.render(components.BudgetProgressCard,{title:'Food',progress:calc.calculateBudgetProgress(100,'120','1'),onEdit(){}});
   assert.ok(text(tree).includes(resolved.colors.danger));assert.equal(find(tree,'StatusBadge').label,'Over budget');
  }
  const selector=h.render(components.BudgetMonthSelector,{month:'2026-09',onChange:m=>{assert.equal(m,'2026-10');}});
  assert.match(text(selector),/September 2026/);nodes(selector).find(n=>n?.props?.accessibilityLabel==='Next month').props.onPress();
  const first=h.render(components.BudgetMonthSelector,{month:'0001-01',onChange(){}});assert.equal(nodes(first).find(n=>n?.props?.accessibilityLabel==='Previous month').props.disabled,true);
 }
 pass('exact statuses, zero/80/100/over progress, capped accessible bars, selected month and all appearance modes');
 {
  const h=harness(db,repo),Dashboard=h.load('src/app/personal/budget.tsx').BudgetDashboard;
  h.render(Dashboard,{initialMonth:'2026-09'});await flush();let tree=h.render(Dashboard,{initialMonth:'2026-09'});
  find(tree,'EmptyState','No monthly budget set');assert.ok(!nodes(tree).some(n=>n?.type==='BudgetProgressCard'));
  find(tree,'EmptyState','No monthly budget set').action.onPress();assert.equal(h.navigation[0].value.params.month,'2026-09');
  await repo.setOverallBudget(db,'2026-09','100');await repo.setCategoryBudget(db,'2026-09','expense-food','50');
  h.blur();h.render(Dashboard,{initialMonth:'2026-09'});await flush();tree=h.render(Dashboard,{initialMonth:'2026-09'});
  const cards=nodes(tree).filter(n=>n?.type==='BudgetProgressCard');assert.equal(cards.length,2);assert.equal(cards[0].props.progress.remainingPaise,'10000');assert.equal(cards[1].props.title,'Food');
  find(tree,'BudgetMonthSelector').onChange('2026-10');tree=h.render(Dashboard,{initialMonth:'2026-09'});assert.equal(find(tree,'PersonalPage').loading,true);
  await flush();tree=h.render(Dashboard,{initialMonth:'2026-09'});find(tree,'EmptyState','No monthly budget set');assert.equal(find(tree,'BudgetMonthSelector').month,'2026-10');
  assert.ok(h.calls.some(c=>c.name==='getMonthlyBudgetSummary'&&c.args[1]==='2026-10'));
 }
 pass('empty/configured dashboard, zero spending, only configured categories and isolated month reload');
 {
  await repo.removeOverallBudget(db,'2026-09');
  const h=harness(db,repo),Editor=h.load('src/app/personal/budget-edit.tsx').BudgetEditor;
  const props={db,summary:await repo.getMonthlyBudgetSummary(db,'2026-09'),category:false};let tree=h.render(Editor,props);
  find(tree,'FormInput').onChangeText('0');tree=h.render(Editor,props);find(tree,'Button','Set budget').onPress();tree=h.render(Editor,props);find(tree,'FieldMessage');assert.equal(await repo.getOverallBudget(db,'2026-09'),null);
  find(tree,'FormInput').onChangeText('100.01');tree=h.render(Editor,props);find(tree,'Button','Set budget').onPress();find(tree,'Button','Set budget').onPress();await flush();
  assert.equal(h.calls.filter(c=>c.name==='setOverallBudget').length,1);assert.equal((await repo.getOverallBudget(db,'2026-09')).amountPaise,10001);assert.equal(h.navigation[0].value.params.month,'2026-09');
  const edit=harness(db,repo),Edit=edit.load('src/app/personal/budget-edit.tsx').BudgetEditor,editProps={...props,summary:await repo.getMonthlyBudgetSummary(db,'2026-09')};
  tree=edit.render(Edit,editProps);assert.equal(find(tree,'FormInput').value,'100.01');find(tree,'FormInput').onChangeText('200');tree=edit.render(Edit,editProps);find(tree,'Button','Save changes').onPress();await flush();assert.equal((await repo.getOverallBudget(db,'2026-09')).amountPaise,20000);
 }
 pass('set/edit overall, positive exact money validation and duplicate-save prevention');
 {
  const h=harness(db,repo),Editor=h.load('src/app/personal/budget-edit.tsx').BudgetEditor;
  const props={db,summary:await repo.getMonthlyBudgetSummary(db,'2026-09'),category:true};let tree=h.render(Editor,props);
  assert.equal(find(tree,'Button','Set budget').disabled,true);
  find(tree,'Chip','Shopping').onPress();tree=h.render(Editor,props);find(tree,'FormInput').onChangeText('40');tree=h.render(Editor,props);find(tree,'Button','Set budget').onPress();await flush();
  assert.equal((await repo.getCategoryBudget(db,'2026-09','expense-shopping')).amountPaise,4000);
  const edit=harness(db,repo),Edit=edit.load('src/app/personal/budget-edit.tsx').BudgetEditor,editProps={...props,summary:await repo.getMonthlyBudgetSummary(db,'2026-09')};
  tree=edit.render(Edit,editProps);find(tree,'Chip','Shopping (Edit budget)').onPress();tree=edit.render(Edit,editProps);assert.equal(find(tree,'FormInput').value,'40.00');assert.match(text(tree),/already exists/);
  find(tree,'FormInput').onChangeText('60');tree=edit.render(Edit,editProps);find(tree,'Button','Save changes').onPress();await flush();assert.equal(edit.calls.filter(c=>c.name==='updateCategoryBudget').length,1);assert.equal((await repo.getCategoryBudget(db,'2026-09','expense-shopping')).amountPaise,6000);
 }
 pass('existing expense category selection, add/edit and explicit duplicate category/month handling');
 {
  const transaction=await personal.saveTransaction(db,input('10'));await repo.setOverallBudget(db,'2026-10','300');
  for(const category of [false,true]){
   const h=harness(db,repo),Editor=h.load('src/app/personal/budget-edit.tsx').BudgetEditor;
   const props={db,summary:await repo.getMonthlyBudgetSummary(db,'2026-09'),category,initialCategoryId:'expense-food'};
   let tree=h.render(Editor,props);find(tree,'Action','Remove budget').onPress();find(tree,'Action','Remove budget').onPress();assert.equal(h.confirmations.length,1);assert.equal(h.confirmations[0][2][1].style,'destructive');
   h.confirmations[0][2][0].onPress();assert.ok(category?await repo.getCategoryBudget(db,'2026-09','expense-food'):await repo.getOverallBudget(db,'2026-09'));
   tree=h.render(Editor,props);find(tree,'Action','Remove budget').onPress();h.confirmations[1][2][1].onPress();await flush();
   assert.equal(category?await repo.getCategoryBudget(db,'2026-09','expense-food'):await repo.getOverallBudget(db,'2026-09'),null);
   assert.ok(await personal.getTransaction(db,transaction));assert.ok((await personal.getCategories(db)).some(c=>c.id==='expense-food'));assert.equal((await repo.getOverallBudget(db,'2026-10')).amountPaise,30000);
   assert.ok(await repo.getCategoryBudget(db,'2026-09','expense-shopping'));
   if(!category){assert.ok(await repo.getCategoryBudget(db,'2026-09','expense-food'));await repo.setOverallBudget(db,'2026-09','100');}
   else assert.equal((await repo.getOverallBudget(db,'2026-09')).amountPaise,10000);
  }
 }
 pass('confirmed overall/category removal, safe cancellation, preserved transactions/categories/other budgets/months');
 {
  const h=harness(db,repo),Dashboard=h.load('src/app/personal/budget.tsx').BudgetDashboard,props={initialMonth:'2026-09'};
  h.render(Dashboard,props);await flush();let tree=h.render(Dashboard,props);assert.equal(find(tree,'BudgetProgressCard').progress.spentPaise,'1000');
  const id=await personal.saveTransaction(db,input('20'));h.blur();h.render(Dashboard,props);await flush();tree=h.render(Dashboard,props);assert.equal(find(tree,'BudgetProgressCard').progress.spentPaise,'3000');
  await personal.saveTransaction(db,input('30','expense-shopping'),id);h.active();await flush();tree=h.render(Dashboard,props);assert.equal(find(tree,'BudgetProgressCard').progress.spentPaise,'4000');
  await personal.saveTransaction(db,input('30','expense-shopping','2026-10-01'),id);h.active();await flush();tree=h.render(Dashboard,props);assert.equal(find(tree,'BudgetProgressCard').progress.spentPaise,'1000');
  await personal.saveTransaction(db,input('900','income-salary','2026-09-01','income'));h.active();await flush();assert.equal(find(h.render(Dashboard,props),'BudgetProgressCard').progress.spentPaise,'1000');
  await personal.deleteTransaction(db,id);h.active();await flush();assert.equal(find(h.render(Dashboard,props),'BudgetProgressCard').progress.spentPaise,'1000');
 }
 pass('real transaction-derived focus/foreground refresh, amount/category/month changes and income exclusion');
 {
  const h=harness(db,repo),Editor=h.load('src/app/personal/budget-edit.tsx').BudgetEditor,props={db,summary:await repo.getMonthlyBudgetSummary(db,'2026-09'),category:false};
  h.setMutationError(Error('SQLITE foreign key private details'));let tree=h.render(Editor,props);find(tree,'Button','Save changes').onPress();await flush();tree=h.render(Editor,props);assert.match(text(tree),/Could not save the budget/);assert.ok(!text(tree).includes('SQLITE'));assert.equal(find(tree,'Button','Save changes').loading,false);
  h.setMutationError(null);h.setNavigationError(true);find(tree,'Button','Save changes').onPress();await flush();tree=h.render(Editor,props);find(tree,'Button','Continue');assert.match(text(tree),/Budget saved/);assert.ok(!nodes(tree).some(n=>n?.props?.label==='Save changes'));
 }
 pass('safe mutation errors and navigation failure recovery without resubmitting saved budgets');
 {
  const h=harness(db,repo),Editor=h.load('src/app/personal/budget-edit.tsx').BudgetEditor,props={db,summary:await repo.getMonthlyBudgetSummary(db,'2026-09'),category:false};
  const owner=await runtimeActivity.applicationActivity.suspend();
  const tree=h.render(Editor,props);find(tree,'Button','Save changes').onPress();await flush();
  assert.match(text(h.render(Editor,props)),/maintenance/);owner.resume();
 }
 pass('actual lifecycle suspension reaches the UI as a safe maintenance message');
 {
  let finish;const pending=new Promise(resolve=>{finish=resolve;});
  f.interceptRun(async sql=>{if(sql.includes('UPDATE personal_monthly_budgets'))await pending;});
  const h=harness(db,repo),Editor=h.load('src/app/personal/budget-edit.tsx').BudgetEditor,props={db,summary:await repo.getMonthlyBudgetSummary(db,'2026-09'),category:false};
  const tree=h.render(Editor,props);find(tree,'Button','Save changes').onPress();h.blur();finish();await flush();
  assert.equal(h.navigation.length,0);const returned=h.render(Editor,props);find(returned,'Button','Continue');assert.match(text(returned),/Budget saved/);
  f.interceptRun(async()=>{});
 }
 pass('save completion after blur retains a saved state without late navigation or resubmission');
 {
  const september=await repo.getMonthlyBudgetSummary(db,'2026-09'),october=await repo.getMonthlyBudgetSummary(db,'2026-10');
  let release;const delayed=new Promise(resolve=>{release=resolve;});
  const h=harness(db,{...repo,getMonthlyBudgetSummary:async(_db,month)=>month==='2026-09'?delayed:october});
  const Dashboard=h.load('src/app/personal/budget.tsx').BudgetDashboard,props={initialMonth:'2026-09'};
  let tree=h.render(Dashboard,props);find(tree,'BudgetMonthSelector').onChange('2026-10');h.render(Dashboard,props);await flush();
  release(september);await flush();tree=h.render(Dashboard,props);assert.equal(find(tree,'BudgetMonthSelector').month,'2026-10');
  assert.equal(find(tree,'BudgetProgressCard').progress.limitPaise,'30000');assert.equal(find(tree,'PersonalPage').loading,false);
 }
 pass('late prior-month query cannot replace the selected month after switching');
 // Stage 1 retains vehicle exclusion and category FK coverage. No category deletion
 // UI/service exists to intercept: do not invent one as part of Budget UI.
 const personalSource=fs.readFileSync(path.join(__dirname,'../src/database/personal.ts'),'utf8');assert.ok(!personalSource.includes('DELETE FROM personal_categories'));
 assert.ok(!fs.readdirSync(path.join(__dirname,'../src/app/personal')).some(name=>name.includes('categor')));
 pass('category deletion UI absent; existing FK protection remains the Stage 1 contract');
 }finally{await f.dispose();}
 finished=true;console.log(`PASS: ${groups} Budget UI/integration groups (adapted hooks/native components; real SQLite mutations).`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
