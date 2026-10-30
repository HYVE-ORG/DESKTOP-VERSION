import {spawn} from 'node:child_process';
import {mkdtemp,readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const base=resolve(root,'../../work/desktop-smoke');await mkdir(base,{recursive:true});
const run=await mkdtemp(join(base,'session-'));
const inputs=process.argv.slice(2),corrupt=inputs.includes('--corrupt-data');
const packageArgument=inputs.find(arg=>!arg.startsWith('--'));
const packaged=packageArgument?resolve(packageArgument):null;
const executable=packaged||join(root,'node_modules/electron/dist/electron.exe');
const report=join(run,'report.json'),profile=join(run,'profile');
await mkdir(profile,{recursive:true});await writeFile(join(profile,'appearance.json'),'"dark"');
if(corrupt){await mkdir(join(profile,'data'),{recursive:true});await writeFile(join(profile,'data/state.json'),'{"schemaVersion":2}');}
const env={...process.env,FORMA_DESKTOP_PROFILE:profile,FORMA_DESKTOP_SMOKE_REPORT:report};
delete env.ELECTRON_RUN_AS_NODE;delete env.FORMA_DESKTOP_URL;
const args=packaged?['--smoke-test']:[join(root,'apps/desktop/main.cjs'),'--smoke-test'];
const child=spawn(executable,args,{cwd:run,windowsHide:true,env,stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
child.stdout.resume();
const timeout=setTimeout(()=>child.kill(),45000);
const exit=await new Promise((res,rej)=>{child.once('error',rej);child.once('exit',res);}).finally(()=>clearTimeout(timeout));
let result;try{result=JSON.parse(await readFile(report,'utf8'));}catch{throw new Error('Electron não produziu relatório: '+stderr.slice(-3000));}
if(corrupt){assert.equal(exit,1);assert.equal(result.ok,false);assert.equal(await readFile(join(profile,'data/state.json'),'utf8'),'{"schemaVersion":2}');}
else{
 assert.equal(exit,0,JSON.stringify(result));assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.appearance,'dark');
 assert.equal(result.profile,profile);assert.equal(result.nodeIntegration,false);assert.equal(result.contextIsolation,true);assert.equal(result.sandbox,true);assert.equal(result.webSecurity,true);assert.equal(result.initialized,false);
 await assert.rejects(fetch(new URL('/api/status',result.url),{signal:AbortSignal.timeout(2000)}));
}
console.log(JSON.stringify({pass:true,packaged:!!packaged,corrupt,report,result},null,2));
