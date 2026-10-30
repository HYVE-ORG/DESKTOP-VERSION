import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
const {automaticPreference}=require('../apps/desktop/updates-ui.cjs');
const policy=()=>require('../apps/desktop/update-policy.cjs');
function fixture(){const keys=generateKeyPairSync('ed25519');const bytes=Buffer.from('MZ-update-fixture');const manifest={schema:1,version:'0.2.1',platform:'win32',arch:'x64',file:'Forma-Setup-0.2.1-x64.exe',size:bytes.length,sha512:createHash('sha512').update(bytes).digest('base64'),releaseDate:'2026-10-23T12:00:00Z'};return {keys,bytes,manifest,envelope:{manifest,signature:sign(null,Buffer.from(JSON.stringify(manifest)),keys.privateKey).toString('base64')}};}
test('feed aceita HTTPS/loopback sem credenciais e rejeita origens inseguras',()=>{
 const {feedUrl}=policy();assert.equal(feedUrl('http://127.0.0.1:5173/downloads/installers/'),'http://127.0.0.1:5173/downloads/installers/');
 for(const url of ['http://empresa.com/','file:///tmp/','https://user:senha@host.test/','https://host.test/?token=x','http://localhost.evil.test/'])assert.throws(()=>feedUrl(url));
});
test('manifesto exige assinatura fixada, versão e arquivo exatos; metadata divergente é negada',()=>{
 const {verifyManifest,matchInfo,isNewer}=policy();const f=fixture();const publicKey=f.keys.publicKey.export({type:'spki',format:'pem'});
 assert.deepEqual(verifyManifest(f.envelope,publicKey),f.manifest);assert.equal(isNewer('0.2.1','0.2.0'),true);assert.equal(isNewer('0.1.9','0.2.0'),false);
 assert.throws(()=>verifyManifest({...f.envelope,manifest:{...f.manifest,size:1}},publicKey));
 assert.throws(()=>verifyManifest(f.envelope,fixture().keys.publicKey.export({type:'spki',format:'pem'})));
 const info={version:f.manifest.version,files:[{url:f.manifest.file,sha512:f.manifest.sha512,size:f.manifest.size}],path:f.manifest.file,sha512:f.manifest.sha512};matchInfo(info,f.manifest);
 assert.throws(()=>matchInfo({...info,files:[{...info.files[0],url:'https://evil.test/evil.exe'}]},f.manifest));
 assert.throws(()=>matchInfo({...info,files:[{...info.files[0],sha512:'bad'}]},f.manifest));
});
export {fixture};

test('binário adulterado impede download e instalação automática ao sair',async()=>{
 const {createUpdates}=require('../apps/desktop/updates.cjs');const f=fixture(),dir=await mkdtemp(join(tmpdir(),'forma-update-tamper-')),file=join(dir,'update.exe');
 try{
  await writeFile(file,f.bytes);const driver:any=new EventEmitter();
  driver.checkForUpdates=async()=>({updateInfo:{version:f.manifest.version,files:[{url:f.manifest.file,sha512:f.manifest.sha512,size:f.manifest.size}]}});
  driver.downloadUpdate=async()=>[file];
  const updates=createUpdates({driver,version:'0.2.0',config:{url:'https://updates.test/',publicKey:f.keys.publicKey.export({type:'spki',format:'pem'})},fetcher:async()=>new Response(JSON.stringify(f.envelope))});
  assert.equal((await updates.check()).status,'ready');
  updates.skipInstallation();updates.setAutomatic(true);assert.equal(driver.autoInstallOnAppQuit,false);assert.equal(await updates.install(async()=>true),false);
  await writeFile(file,'MZ-tampered');await updates.beforeQuit();assert.equal(driver.autoInstallOnAppQuit,false);assert.equal(updates.getState().status,'error');
  assert.notEqual(await driver.verifyUpdateCodeSignature([],file),null);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('preferência automática persiste e arquivo inválido não ativa instalação',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-update-pref-'));const file=join(dir,'updates.json');
 try{assert.equal(automaticPreference(file),true);await writeFile(file,'{"automatic":false}');assert.equal(automaticPreference(file),false);await writeFile(file,'invalid');assert.equal(automaticPreference(file),false);}finally{await rm(dir,{recursive:true,force:true});}
});

test('download validado habilita instalação, respeita preferência e aguarda encerramento',async()=>{
 const {createUpdates}=require('../apps/desktop/updates.cjs');const f=fixture(),dir=await mkdtemp(join(tmpdir(),'forma-update-'));const file=join(dir,'update.exe');await writeFile(file,f.bytes);
 try{
  const driver:any=new EventEmitter();let downloaded=0,installed=0,prepared=false,saved:any;
  driver.checkForUpdates=async()=>({updateInfo:{version:f.manifest.version,files:[{url:f.manifest.file,sha512:f.manifest.sha512,size:f.manifest.size}]}});
  driver.downloadUpdate=async()=>{downloaded++;return [file];};driver.quitAndInstall=()=>{assert.equal(prepared,true);installed++;};
  const updates=createUpdates({driver,version:'0.2.0',config:{url:'http://127.0.0.1:5173/downloads/installers/',publicKey:f.keys.publicKey.export({type:'spki',format:'pem'})},fetcher:async()=>new Response(JSON.stringify(f.envelope)),saveAutomatic:(value:boolean)=>saved=value});
  assert.equal((await updates.check(true,async()=>false)).status,'available');assert.equal(downloaded,0);
  assert.equal((await updates.check()).status,'ready');assert.equal(downloaded,1);assert.equal(driver.autoInstallOnAppQuit,true);
  updates.setAutomatic(false);assert.equal(saved,false);assert.equal(driver.autoInstallOnAppQuit,false);
  assert.equal(await updates.install(async()=>{prepared=true;return true;}),true);assert.equal(installed,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('offline, adulteração e check concorrente não liberam instalação',async()=>{
 const {createUpdates}=require('../apps/desktop/updates.cjs');const f=fixture();let downloads=0,checks=0,finish!:(value:unknown)=>void;
 const driver:any=new EventEmitter();driver.checkForUpdates=async()=>{checks++;return {updateInfo:{version:'0.2.1',files:[{url:f.manifest.file,size:99,sha512:'invalid'}]}};};driver.downloadUpdate=async()=>{downloads++;};
 const pending=new Promise(resolve=>finish=resolve);const updates=createUpdates({driver,version:'0.2.0',config:{url:'https://updates.test/',publicKey:f.keys.publicKey.export({type:'spki',format:'pem'})},fetcher:()=>pending});
 const first=updates.check();await updates.check();assert.equal(checks,0);finish(new Response(JSON.stringify(f.envelope)));assert.equal((await first).status,'error');assert.equal(downloads,0);assert.equal(driver.autoInstallOnAppQuit,false);assert.equal(await updates.install(async()=>true),false);
 const offline=createUpdates({driver:new EventEmitter(),version:'0.2.0',config:{url:'https://updates.test/',publicKey:f.keys.publicKey.export({type:'spki',format:'pem'})},fetcher:async()=>{throw Error('offline');}});assert.equal((await offline.check()).status,'error');
});
