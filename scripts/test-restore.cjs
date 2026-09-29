/* global __dirname, Buffer */
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const files=new Map(),dirs=new Set(['document:','cache:']);
class Directory{constructor(base,...p){this.uri=[base.uri||base,...p].join('/')}get exists(){return dirs.has(this.uri)}create(){dirs.add(this.uri)}delete(){for(const k of [...files.keys()])if(k.startsWith(this.uri+'/'))files.delete(k);for(const k of [...dirs])if(k===this.uri||k.startsWith(this.uri+'/'))dirs.delete(k)}list(){const p=this.uri+'/',n=new Set([...dirs,...files.keys()].filter(k=>k.startsWith(p)&&!k.slice(p.length).includes('/')).map(k=>k.slice(p.length)));return[...n].map(x=>dirs.has(p+x)?new Directory(this,x):new File(this,x))}}
class File{constructor(base,...p){this.uri=[base.uri||base,...p].join('/')}get name(){return this.uri.split('/').pop()}get parentDirectory(){return new Directory(this.uri.slice(0,this.uri.lastIndexOf('/')))}get exists(){return files.has(this.uri)}create(){files.set(this.uri,new Uint8Array())}write(v){files.set(this.uri,typeof v==='string'?new TextEncoder().encode(v):new Uint8Array(v))}async bytes(){if(!this.exists)throw Error('missing');return files.get(this.uri)}async text(){return new TextDecoder().decode(await this.bytes())}async copy(d){d.write(await this.bytes())}delete(){files.delete(this.uri)}}
class DB{constructor(bytes){this.bytes=Uint8Array.from(bytes);this.version=this.bytes[0];this.marker=this.bytes[1]||0;this.closed=false;this.deviceMetadataCleared=false}async serializeAsync(){return Uint8Array.from([this.version,this.marker])}async getFirstAsync(sql){if(sql.includes('integrity_check'))return{integrity_check:this.bad?'bad':'ok'};return{user_version:this.version}}async execAsync(sql){if(sql.includes('permission_requested = 0')&&sql.includes('DELETE FROM vehicle_reminder_schedule'))this.deviceMetadataCleared=true}async closeAsync(){this.closed=true}}
let failIncomingCopy=false, failRollback=false;
let replacementChecks=0;
const sqlite={deserializeDatabaseAsync:async b=>new DB(b),backupDatabaseAsync:async({sourceDatabase:s,destDatabase:d})=>{
const recovery=[...files.keys()].filter(k=>k.endsWith('/recovery.json')).map(k=>[k,JSON.parse(new TextDecoder().decode(files.get(k)))]).find(([,m])=>m.phase==='replacing');
assert.ok(recovery,'metadata must be on disk before replacement');
const root=recovery[0].slice(0,-'recovery.json'.length);
if(s.marker!==files.get(root+'previous.db')[1]){for(const[k,v]of files){if(k.startsWith('document:/vehicle-photos/'))assert.deepEqual([...files.get(root+'previous-files/'+k.slice('document:/vehicle-photos/'.length))],[...v],'previous files must be on disk before replacement')}}
assert.ok(files.has(root+'previous.db'),'previous SQLite bytes must exist on disk');
assert.ok(recovery[1].files==='previous-files'); replacementChecks++;
if(failRollback&&s.marker===3)throw Error('rollback failed');
d.version=s.version;d.marker=s.marker;d.deviceMetadataCleared=s.deviceMetadataCleared;if(failIncomingCopy&&s.marker===7){failIncomingCopy=false;throw Error('replace failed')}}};
const hash=async(_a,b)=>{const h=crypto.createHash('sha256').update(Buffer.from(b)).digest();return h.buffer.slice(h.byteOffset,h.byteOffset+h.byteLength)};
const mocks={'@/features/activity/operation-lifecycle':require('./helpers/load-typescript.cjs').activity,'expo-file-system':{Directory,File,Paths:{document:{uri:'document:'},cache:{uri:'cache:'}}},'expo-constants':{default:{expoConfig:{version:'1'},nativeBuildVersion:'1'}},'expo-crypto':{randomUUID:crypto.randomUUID,CryptoDigestAlgorithm:{SHA256:'SHA-256'},digest:hash},'expo-sqlite':sqlite,'@/database/migrate':{DATABASE_VERSION:11,migrateDatabase:async db=>{if(db.marker===99)throw Error('migration');db.version=11;db.bytes[0]=11}}};
function load(rel){const e={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',rel),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:e,require:n=>n in mocks?mocks[n]:load(`${n.startsWith('@/')?'src/'+n.slice(2):path.join(path.dirname(rel),n)}.ts`),TextEncoder,TextDecoder,Uint8Array,Date,JSON,Set,Object,Error});return e}
let packageNumber=0;
async function packageFor(service,version=11,marker=7,withFile=true){
 const saved=[...files].filter(([k])=>k.startsWith('document:/vehicle-photos/')); if(!withFile){for(const[k]of saved)files.delete(k);dirs.delete('document:/vehicle-photos')}else{dirs.add('document:/vehicle-photos');files.set('document:/vehicle-photos/old.jpg',Uint8Array.from([4]))}
 const out=new File('document:',`source-${++packageNumber}.lpbackup`),created=(await service.createBackup(new DB([version,marker]),{destination:out,now:new Date('2026-01-01T00:00:00Z')})).file;
 if(!withFile){dirs.add('document:/vehicle-photos');for(const[k,v]of saved)files.set(k,v)} return created;
}
async function mutate(file,fn){const p=JSON.parse(await file.text());fn(p);file.write(JSON.stringify(p))}
async function main(){const backup=load('src/features/backup/backup-service.ts'),restore=load('src/features/backup/restore-service.ts');
 const source=await packageFor(backup),sourceBefore=await source.text(),active=new DB([11,1]);files.set('document:/vehicle-photos/current.jpg',Uint8Array.from([8]));
 const inspection=await restore.inspectRestore(source);assert.equal(inspection.compatibility,'current');assert.equal(active.marker,1);assert.equal(await source.text(),sourceBefore);
 const coordinated={dataAccessSuspended:true};
 const engineRestore=restore.restoreBackup;
 await assert.rejects(()=>engineRestore(active,source,coordinated),/exclusive maintenance/);
 restore.restoreBackup=async(db,file)=>{const owner=await mocks['@/features/activity/operation-lifecycle'].applicationActivity.suspend();try{return await engineRestore(db,file,owner.authorization)}finally{owner.resume()}};const result=await restore.restoreBackup(active,source,coordinated);assert.equal(active.marker,7);assert.equal(active.deviceMetadataCleared,true,'source-device notification metadata must be reset');assert.equal(result.restartRequired,true);assert.equal(new Directory('cache:','lifepilot-restore-staging').exists,false);assert.equal(await source.text(),sourceBefore);assert.equal(files.has('document:/vehicle-photos/old.jpg'),true);
 const corrupt=await packageFor(backup,11,8);await mutate(corrupt,p=>p.payloads['database/lifepilot.db']='AAAA');await assert.rejects(()=>restore.inspectRestore(corrupt),e=>e.code==='integrity');
 const attach=await packageFor(backup,11,8);await mutate(attach,p=>{const k=Object.keys(p.payloads).find(x=>x.startsWith('files/'));p.payloads[k]='AAAA'});await assert.rejects(()=>restore.inspectRestore(attach),e=>e.code==='integrity');
 const missing=await packageFor(backup,11,8);await mutate(missing,p=>delete p.payloads[p.manifest.entries[0].path]);await assert.rejects(()=>restore.inspectRestore(missing),e=>e.code==='integrity');
 const extra=await packageFor(backup,11,8);await mutate(extra,p=>p.payloads['files/vehicle-photos/extra']='AA==');await assert.rejects(()=>restore.inspectRestore(extra),e=>e.code==='integrity');
 const duplicate=await packageFor(backup,11,8);await mutate(duplicate,p=>p.manifest.entries.push({...p.manifest.entries[0]}));await assert.rejects(()=>restore.inspectRestore(duplicate),e=>e.code==='integrity');
 const unsafe=await packageFor(backup,11,8);await mutate(unsafe,p=>p.manifest.entries[1].path='files/vehicle-photos/../escape');await assert.rejects(()=>restore.inspectRestore(unsafe),e=>e.code==='unsafe-path');assert.equal(files.has('document:/sentinel'),false);
 const newer=await packageFor(backup,12,8,false);await assert.rejects(()=>restore.inspectRestore(newer),e=>e.code==='incompatible-schema');assert.equal(active.marker,7);
 const older=await packageFor(backup,8,6,false);assert.equal((await restore.inspectRestore(older)).compatibility,'upgrade');await restore.restoreBackup(active,older,coordinated);assert.equal(active.version,11);assert.equal(active.marker,6);
 const mismatch=await packageFor(backup,11,8,false);await mutate(mismatch,p=>p.manifest.database.schemaVersion=8);await assert.rejects(()=>restore.inspectRestore(mismatch),e=>e.code==='database-validation');
 const migration=await packageFor(backup,8,99,false);const beforeMigration=active.marker;await assert.rejects(()=>restore.restoreBackup(active,migration,coordinated),e=>e.code==='migration');assert.equal(active.marker,beforeMigration);
 const rollbackSource=await packageFor(backup,11,7,false);files.set('document:/vehicle-photos/keep.jpg',Uint8Array.from([42]));active.marker=3;failIncomingCopy=true;await assert.rejects(()=>restore.restoreBackup(active,rollbackSource,coordinated));assert.equal(active.marker,3);assert.equal(files.get('document:/vehicle-photos/keep.jpg')[0],42);
 const empty=await packageFor(backup,11,5,false);await restore.restoreBackup(active,empty,coordinated);assert.equal(new Directory('document:','vehicle-photos').list().length,0);

 // A failed rollback retains its database, files, metadata and staged incoming files.
 const catastrophic=await packageFor(backup,11,7,true);active.marker=3;
 files.set('document:/vehicle-photos/keep.jpg',Uint8Array.from([42]));
 failIncomingCopy=true;failRollback=true;
 await assert.rejects(()=>restore.restoreBackup(active,catastrophic,coordinated),e=>e instanceof restore.RollbackFailureError);
 const retained=[...files].filter(([k])=>k.startsWith('document:/lifepilot-recovery/'));
 assert.ok(retained.some(([k,v])=>k.endsWith('/previous.db')&&v[1]===3));
 assert.ok(retained.some(([k,v])=>k.endsWith('/previous-files/keep.jpg')&&v[0]===42));
 assert.ok(retained.some(([k,v])=>k.endsWith('/recovery.json')&&JSON.parse(new TextDecoder().decode(v)).phase==='rollback-failed'));
 assert.ok(retained.some(([k])=>k.includes('/incoming/vehicle-photos/')));
 const evidence=retained.map(([k,v])=>[k,[...v]]);
 // A UUID collision cannot erase an existing recovery set.
 const uuid=retained[0][0].split('/')[2].slice('restore-'.length);
 mocks['expo-crypto'].randomUUID=()=>uuid;
 await assert.rejects(()=>restore.restoreBackup(active,catastrophic,coordinated),e=>e.code==='rollback-preparation');
 for(const[k,v]of evidence)assert.deepEqual([...files.get(k)],v);
 mocks['expo-crypto'].randomUUID=crypto.randomUUID;
 // Simulate another maintenance owner/process. Engine must never erase older sets.
 failRollback=false;await restore.restoreBackup(active,catastrophic,coordinated);
 for(const[k,v]of evidence)assert.deepEqual([...files.get(k)],v);
 assert.equal([...files.keys()].filter(k=>k.endsWith('/previous.db')).length,1,'successful attempt cleans only its own workspace');
 assert.ok(replacementChecks>=6);
 console.log('PASS: persistent database/files/metadata before replacement, catastrophic retention, workspace collision isolation, later-attempt preservation and safe cleanup.');
 console.log('PASS: inspection, integrity/path rejection, schema compatibility/mismatch/migration, replacement, rollback DB/files, empty files, cleanup, and source immutability.');}
main().catch(e=>{console.error(e);process.exitCode=1});
