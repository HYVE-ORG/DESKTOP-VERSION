import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
const base=resolve(root,'../../work/desktop-smoke');await mkdir(base,{recursive:true});
const run=await mkdtemp(join(base,'operator-')),profile=join(run,'profile');
const packaged=process.argv[2]?resolve(process.argv[2]):null;
const appRoot=packaged?join(dirname(packaged),'resources/app'):root;
const {createApp}=require(join(appRoot,'dist-api/desktop.cjs'));
const server=await createApp(join(profile,'data'),0,{host:'127.0.0.1',staticDir:join(appRoot,packaged?'dist':'dist-desktop')});
const origin='http://127.0.0.1:'+server.port;
try{assert.equal((await fetch(origin+'/api/register',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({name:'Admin de teste',email:'operator@teste.local',password:'SenhaTesteOperator2026'})})).status,201);}finally{await server.close();}
const executable=packaged||join(root,'node_modules/electron/dist/electron.exe');
const env={...process.env,FORMA_DESKTOP_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.FORMA_DESKTOP_URL;
async function runElectron(admin,report){
 const args=[...(packaged?[]:[join(root,'apps/desktop/main.cjs')]),'--smoke-test'];
 const child=spawn(executable,args,{cwd:run,windowsHide:true,env:{...env,FORMA_DESKTOP_SMOKE_REPORT:report,FORMA_DESKTOP_OPERATOR_SMOKE:admin?JSON.stringify({email:'operator@teste.local',name:'Studio de teste'}):''},stdio:['ignore','pipe','pipe']});
 let errors='';child.stdout.resume();child.stderr.on('data',chunk=>errors+=chunk);
 const timer=setTimeout(()=>child.kill(),45000);
 const code=await new Promise((res,rej)=>{child.once('error',rej);child.once('exit',res);}).finally(()=>clearTimeout(timer));
 let result;try{result=JSON.parse(await readFile(report,'utf8'));}catch{throw new Error('Sem relatório Electron: '+errors);}
 assert.equal(code,0,JSON.stringify(result)+' '+errors);assert.equal(result.ok,true);return result;
}
const administration=await runElectron(true,join(run,'operator.json'));assert.equal(administration.unifiedAdministration,true);assert.equal(administration.initialized,true);
const {Store}=require(join(appRoot,'dist-api/operator.cjs'));
const state=await new Store(join(profile,'data')).read();
assert.equal(state.orgs.length,1);assert.equal(state.accounts.length,1);assert.equal(state.users[0].role,'admin');assert.equal(state.conversations.length,1);
const report=join(run,'provisioned.json');const loaded=await runElectron(false,report);assert.equal(loaded.initialized,true);
console.log(JSON.stringify({pass:true,packaged:!!packaged,report,studio:state.orgs[0].name,accounts:state.accounts.length},null,2));
