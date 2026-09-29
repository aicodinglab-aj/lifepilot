/* global __dirname */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { fixture } = require('./helpers/fuel-fixture.cjs');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
const refuel = (date = '2026-09-01', km = '100', quantity = '10', totalCost = '1000', fullTank = true, fuelType = 'Petrol') =>
  ({ kind: 'refuel', date, odometerKm: km, quantity, totalCost, fullTank, fuelType });
const charge = (date = '2026-09-01', km = '100', energyKwh = '10', totalCost = '100', chargeAfterPercent = 100) =>
  ({ kind: 'charge', date, odometerKm: km, energyKwh, totalCost, chargeAfterPercent });
let finished = false;
process.on('beforeExit', () => { if (!finished) { console.error('FAIL: fuel tests did not finish'); process.exitCode = 1; } });
async function main() {
  const f = fixture();
  try {
    const db = f.database(), { raw } = db, load = f.load;
    const migration = load('src/database/migrate.ts'), repo = load('src/database/vehicle-fuel.ts');
    const domain = load('src/features/vehicles/fuel-entry.ts'), calc = load('src/features/vehicles/fuel-calculations.ts');
    const activity = load('src/features/activity/operation-lifecycle.ts').applicationActivity;
    const steps = [...fs.readFileSync(path.join(__dirname, '../src/database/migrate.ts'), 'utf8').matchAll(/await db\.execAsync\(`([\s\S]*?)`\)/g)];
    for (const step of steps.slice(0, 9)) raw.exec(step[1]);
    raw.exec('PRAGMA foreign_keys = ON');
    function seed(id, fuel = 'Petrol') {
      raw.prepare(`INSERT INTO vehicles(id, vehicle_type, registration_number, make, model, model_year, fuel_type, odometer_km, created_at, updated_at)
        VALUES (?, 'Car', ?, 'Test', 'Model', 2020, ?, 50, 'before', 'before')`).run(id, `FUEL-${id}`, fuel);
    }
    for (const [id, fuel] of [[1,'Petrol'],[2,'Electric'],[3,'Diesel'],[4,'CNG'],[5,'Hybrid'],[6,'Other']]) seed(id, fuel);
    raw.exec(`INSERT INTO vehicle_photos VALUES ('photo',1,'file:///photo.jpg',1,'before');
      INSERT INTO vehicle_services(id,vehicle_id,service_date,odometer,title,created_at,updated_at) VALUES ('service',1,'2026-01-01',50,'Service','before','before');
      INSERT INTO vehicle_insurance(id,vehicle_id,provider,policy_number,expiry_date,created_at,updated_at) VALUES ('policy',1,'Provider','P','2027-01-01','before','before');
      INSERT INTO vehicle_puc(id,vehicle_id,expiry_date,created_at,updated_at) VALUES ('puc',1,'2027-01-01','before','before');
      INSERT INTO personal_transactions(type,amount,category_id,transaction_date,created_at,updated_at) VALUES ('expense',12345,'expense-food','2026-09-01','before','before');
      INSERT INTO tasks(title,created_at,updated_at) VALUES ('Preserve','before','before');`);
    const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
    const snapshot = () => JSON.stringify(tables.map(name => [name, raw.prepare(`SELECT * FROM "${name}"`).all()]));
    const before = snapshot();
    const backupService = load('src/features/backup/backup-service.ts'), restore = load('src/features/backup/restore-service.ts');
    const v9package = await backupService.createBackup(db, { destination: new f.File(f.document, 'v9.lpbackup') });
    await migration.migrateDatabase(db); await migration.migrateDatabase(db);
    assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 10); assert.equal(snapshot(), before);
    const fresh = f.database(); await migration.migrateDatabase(fresh);
    assert.equal(fresh.raw.prepare('PRAGMA user_version').get().user_version, 10);
    assert.equal(fresh.raw.prepare('SELECT COUNT(*) AS n FROM vehicle_fuel_entries').get().n, 0);
    const broken = f.database(); for (const step of steps.slice(0,9)) broken.raw.exec(step[1]);
    const exec = broken.execAsync;
    broken.execAsync = async sql => { if (sql.includes('CREATE TABLE vehicle_fuel_entries')) { await exec(sql.split('CREATE INDEX vehicle_fuel_history')[0]); throw Error('migration failure'); } return exec(sql); };
    await assert.rejects(migration.migrateDatabase(broken));
    assert.equal(broken.raw.prepare('PRAGMA user_version').get().user_version, 9);
    assert.equal(broken.raw.prepare("SELECT name FROM sqlite_master WHERE name='vehicle_fuel_entries'").get(), undefined);
    console.log('PASS: v9→v10 preservation of every existing table, fresh creation, idempotence and transactional migration rollback');

    const id = await repo.createFuelEntry(db,1,{...refuel(),pricePerUnit:'100.00',location:' Station ',notes:' Note '});
    const entry = await repo.getFuelEntry(db,1,id);
    assert.equal(entry.costPaise,100000); assert.equal(entry.quantityMilliUnits,10000); assert.equal(entry.location,'Station');
    assert.equal('energyMilliKwh' in entry,false); assert.equal(raw.prepare('SELECT odometer_km AS km FROM vehicles WHERE id=1').get().km,100);
    await repo.updateFuelEntry(db,1,id,refuel('2026-09-01','120','12','1200'));
    assert.equal(raw.prepare('SELECT odometer_km AS km FROM vehicles WHERE id=1').get().km,120);
    await repo.updateFuelEntry(db,1,id,refuel('2026-09-01','100','10','1000'));
    await repo.createFuelEntry(db,1,refuel('2026-08-01','80'));
    assert.equal(raw.prepare('SELECT odometer_km AS km FROM vehicles WHERE id=1').get().km,120);
    await assert.rejects(repo.updateFuelEntry(db,3,id,refuel(undefined,undefined,undefined,undefined,true,'Diesel')),/no longer/);
    await assert.rejects(repo.deleteFuelEntry(db,3,id),/no longer/); assert.equal(await repo.getFuelEntry(db,3,id),null);
    const electric = await repo.createFuelEntry(db,2,{...charge(),chargeBeforePercent:20,pricePerKwh:'10',chargingLocation:'Home'});
    assert.equal((await repo.getFuelEntry(db,2,electric)).energyMilliKwh,10000);
    assert.equal('fullTank' in await repo.getFuelEntry(db,2,electric),false);
    await repo.createFuelEntry(db,3,refuel(undefined,undefined,undefined,undefined,true,'Diesel'));
    await repo.createFuelEntry(db,4,refuel(undefined,undefined,undefined,undefined,true,'CNG'));
    await repo.createFuelEntry(db,5,refuel()); await repo.createFuelEntry(db,5,charge('2026-09-02','200'));
    await repo.createFuelEntry(db,6,charge());
    await assert.rejects(repo.createFuelEntry(db,1,charge())); await assert.rejects(repo.createFuelEntry(db,2,refuel()));
    for (const change of [{date:'2026-02-29'},{odometerKm:'-1'},{odometerKm:'NaN'},{odometerKm:'Infinity'},{quantity:'0'},
      {quantity:'1.0001'},{quantity:'Infinity'},{totalCost:'1.001'},{totalCost:'-1'},{totalCost:'NaN'},{totalCost:'1000000000'},
      {pricePerUnit:'Infinity'},{fullTank:1},{fuelType:'LPG'},{location:'x'.repeat(201)},{notes:'x'.repeat(2001)}]) {
      assert.throws(()=>domain.validateFuelInput({...refuel(),...change}));
    }
    for (const change of [{energyKwh:'0'},{chargeBeforePercent:-1},{chargeAfterPercent:101},{chargeBeforePercent:50,chargeAfterPercent:49},
      {chargeAfterPercent:NaN},{chargeAfterPercent:Infinity},{chargeAfterPercent:50.5},{chargingLocation:'invalid'}]) {
      assert.throws(()=>domain.validateFuelInput({...charge(),...change}));
    }
    await assert.rejects(repo.createFuelEntry(db,0,refuel())); await assert.rejects(repo.createFuelEntry(db,999,refuel()));
    assert.equal(domain.validateFuelInput({...charge(),totalCost:'0',energyKwh:'0.001',odometerKm:'0'}).energyMilliKwh,1);
    assert.equal(domain.validateFuelInput({...refuel(),totalCost:'1,00,000.01'}).costPaise,10000001);
    const baseline = raw.prepare('SELECT COUNT(*) AS n FROM vehicle_fuel_entries').get().n;
    f.interceptRun(async sql => { if (sql.startsWith('UPDATE vehicles')) throw Error('odometer failed'); });
    await assert.rejects(repo.createFuelEntry(db,1,refuel('2026-09-03','999')));
    f.interceptRun(async () => {});
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM vehicle_fuel_entries').get().n,baseline);
    assert.equal(raw.prepare('SELECT odometer_km AS km FROM vehicles WHERE id=1').get().km,120);
    assert.throws(()=>raw.prepare('UPDATE vehicle_fuel_entries SET cost_paise=0.1 WHERE id=?').run(id));
    assert.throws(()=>raw.prepare('UPDATE vehicle_fuel_entries SET fuel_type=NULL WHERE id=?').run(id));
    console.log('PASS: refuel/charge CRUD, discriminated fields, fuel compatibility, validation, exact minor units, owner isolation and atomic monotonic odometer');

    await repo.createFuelEntry(db,1,refuel('2026-09-02','200','5','500',false));
    assert.equal((await repo.getFuelSummary(db,1,'2026-09')).latestEfficiency.endEntryId,id,'partial fill must not become an endpoint');
    const endId = await repo.createFuelEntry(db,1,refuel('2026-09-03','400','15','1500'));
    let summary = await repo.getFuelSummary(db,1,'2026-09');
    assert.equal(summary.latestEfficiency.startEntryId,id); assert.equal(summary.latestEfficiency.endEntryId,endId);
    assert.equal(summary.latestEfficiency.quantityMilli,'20000'); assert.equal(summary.latestEfficiency.intervalCostPaise,'200000');
    assert.equal(calc.formatFuelRatio(summary.latestEfficiency.kmPerUnit),'15.00');
    assert.equal(calc.formatFuelRatio(summary.costPaisePerKm),'666.67'); // paise/km
    assert.equal(summary.monthSpendPaise,'300000'); assert.equal(summary.totalSpendPaise,'400000');
    assert.equal(calc.formatFuelRatio(summary.totals[0].averagePricePaisePerUnit),'10000.00');
    await repo.createFuelEntry(db,2,charge('2026-09-02','200','5','50',60));
    assert.equal((await repo.getFuelSummary(db,2)).latestEfficiency,null);
    await repo.createFuelEntry(db,2,charge('2026-09-03','250','10','100',100));
    summary=await repo.getFuelSummary(db,2,'2026-09');
    assert.equal(calc.formatFuelRatio(summary.latestEfficiency.kmPerUnit),'10.00');
    assert.equal(calc.formatFuelRatio(summary.costPaisePerKm),'100.00');
    assert.equal(summary.totals[0].quantityMilli,'25000');
    assert.equal((await repo.getFuelSummary(db,5)).latestEfficiency,null);
    await repo.createFuelEntry(db,4,refuel('2026-09-02','200','5','500',true,'CNG'));
    assert.equal((await repo.getFuelSummary(db,4)).latestEfficiency.unit,'kg');
    const scan=calc.createFuelEfficiencyScanner('Petrol');
    assert.equal(scan.push({...entry,id:99,date:'2026-09-03',odometerMetres:100000}),null);
    assert.equal(scan.push({...entry,id:98,date:'2026-09-02',odometerMetres:100000}),null);
    assert.equal(calc.distanceBetweenEntries(entry,{...entry,id:999,vehicleId:2}),null);
    seed(7); const empty=await repo.getFuelSummary(db,7); assert.equal(empty.totalSpendPaise,'0'); assert.equal(empty.costPaisePerKm,null); assert.deepEqual([...empty.totals],[]);
    console.log('PASS: full-to-full intervals include partial purchases, exclude initial fill, ICE/CNG/EV units, actual prices, monthly totals and unavailable metrics');

    for(let i=0;i<83;i++) await repo.createFuelEntry(db,7,refuel('2026-09-04',String(100+i),'0.001','0.01',false));
    const seen=[]; let cursor;
    do { const page=await repo.getFuelHistory(db,7,cursor); seen.push(...page.entries.map(e=>e.id)); cursor=page.nextCursor; } while(cursor);
    assert.equal(seen.length,83); assert.equal(new Set(seen).size,83); assert.deepEqual(seen,[...seen].sort((a,b)=>b-a));
    summary=await repo.getFuelSummary(db,7); assert.equal(summary.totalSpendPaise,'83'); assert.equal(summary.totals[0].quantityMilli,'83'); assert.equal(summary.latestEfficiency,null);
    assert.equal((await repo.getFuelSummary(db,7,'2026-08')).monthSpendPaise,'0');
    await assert.rejects(repo.getFuelHistory(db,1,{vehicleId:7,date:'2026-09-04',id:seen[0]}));
    await repo.deleteFuelEntry(db,7,seen[0]); assert.equal(await repo.getFuelEntry(db,7,seen[0]),null);
    assert.equal(raw.prepare('SELECT odometer_km AS km FROM vehicles WHERE id=7').get().km,182);
    await load('src/features/vehicles/delete-vehicle.ts').deleteVehicle(db,7);
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM vehicle_fuel_entries WHERE vehicle_id=7').get().n,0);
    assert.equal(raw.prepare('SELECT amount FROM personal_transactions').get().amount,12345);
    console.log('PASS: keyset pagination/tie order, zero/empty metrics, deletion/cascade, unchanged personal data and non-rewinding odometer');

    // Exercise SQLite sums above Number.MAX_SAFE_INTEGER, not just a mocked sum.
    const large=f.database();await migration.migrateDatabase(large);
    large.raw.exec(`INSERT INTO vehicles(id,vehicle_type,registration_number,make,model,model_year,fuel_type,odometer_km,created_at,updated_at)
      VALUES (1,'Car','LARGE','Test','Model',2020,'Hybrid',0,'before','before');
      WITH RECURSIVE count(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM count WHERE n<100000)
      INSERT INTO vehicle_fuel_entries(vehicle_id,kind,entry_date,odometer_metres,cost_paise,quantity_milli,fuel_type,full_tank,created_at,updated_at)
      SELECT 1,'refuel','2026-09-01',n,99999999999,1,'Petrol',0,'before','before' FROM count;`);
    const exact=await repo.getFuelSummary(large,1,'2026-09');
    assert.equal(exact.totalSpendPaise,'9999999999900000');assert.equal(exact.monthSpendPaise,exact.totalSpendPaise);
    assert.equal(exact.totals[0].quantityMilli,'100000');assert.equal(exact.entryCount,100000);
    assert.equal(calc.formatFuelRatio(exact.totals[0].averagePricePaisePerUnit),'99999999999000.00');
    console.log('PASS: real SQLite money totals above JS safe-integer range remain exact decimal strings');

    const entered=deferred(), finish=deferred(), closing=deferred(), finishClose=deferred();
    f.interceptRun(async sql=>{if(sql.includes('INSERT INTO vehicle_fuel_entries')){entered.resolve();await finish.promise;}});
    f.interceptClose(async()=>{closing.resolve();await finishClose.promise;});
    const parent=activity.acquire();
    const pending=repo.createFuelEntry(db,1,refuel('2026-09-05','500'),parent.context);
    await entered.promise; parent.release(); let exclusive=false;
    const maintenance=activity.suspend().then(o=>{exclusive=true;return o;});
    await assert.rejects(repo.createFuelEntry(db,2,charge()),/maintenance/);
    await assert.rejects(repo.updateFuelEntry(db,2,electric,charge()),/maintenance/);
    await assert.rejects(repo.deleteFuelEntry(db,2,electric),/maintenance/);
    finish.resolve();await closing.promise;assert.equal(exclusive,false);finishClose.resolve();await pending;
    const owner=await maintenance;owner.resume(); f.interceptRun(async()=>{});f.interceptClose(async()=>{});
    console.log('PASS: shared parent lease, synchronous mutation blocking, complete transaction/odometer/private-close drain');

    const current=await backupService.createBackup(db,{destination:new f.File(f.document,'v10.lpbackup')});
    assert.equal(current.manifest.database.schemaVersion,10);
    const currentPackage=JSON.parse(await current.file.text());
    assert.equal(Object.keys(currentPackage.payloads).length,1,'whole database only; no table-specific format additions');
    assert.equal((await restore.inspectRestore(current.file)).compatibility,'current');
    assert.equal((await restore.inspectRestore(v9package.file)).compatibility,'upgrade');
    const count=raw.prepare('SELECT COUNT(*) AS n FROM vehicle_fuel_entries').get().n;
    const target=f.database();await migration.migrateDatabase(target);
    let exclusiveOwner=await activity.suspend();
    await restore.restoreBackup(target,current.file,exclusiveOwner.authorization);exclusiveOwner.resume();
    assert.equal(target.raw.prepare('SELECT COUNT(*) AS n FROM vehicle_fuel_entries').get().n,count);
    exclusiveOwner=await activity.suspend();await restore.restoreBackup(target,v9package.file,exclusiveOwner.authorization);exclusiveOwner.resume();
    assert.equal(target.raw.prepare('PRAGMA user_version').get().user_version,10);
    assert.equal(target.raw.prepare('SELECT COUNT(*) AS n FROM vehicle_fuel_entries').get().n,0);
    assert.equal(target.raw.prepare('SELECT amount FROM personal_transactions').get().amount,12345);
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM vehicle_fuel_entries').get().n,count,'source remains unchanged');
    console.log('PASS: real SQLite snapshot includes fuel table; actual v9 migration and v10 restore preserve records (Expo bridge mocked)');
  } finally { await f.dispose(); }
  finished=true;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
