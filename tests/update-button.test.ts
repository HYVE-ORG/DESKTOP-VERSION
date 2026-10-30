import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

test('bridge de atualização só invoca canal fixo sem argumentos do renderer',async()=>{
 let bridge:any;const calls:any[]=[];
 runInNewContext(readFileSync(new URL('../apps/desktop/preload.cjs',import.meta.url),'utf8'),{
  require:()=>({contextBridge:{exposeInMainWorld:(_name:string,value:any)=>bridge=value},ipcRenderer:{invoke:(...args:any[])=>{calls.push(args);return Promise.resolve(true);},sendSync:()=>null}}),
  window:{addEventListener:()=>{}}
 });
 assert.equal(await bridge.checkUpdate('https://evil.test'),true);
 assert.deepEqual(calls,[['forma:update:check']]);
});

test('pedido de atualização exige autorização do main e rejeição não dispara fluxo',async()=>{
 const {registerUpdateRequest}=require('../apps/desktop/update-request.cjs');let count=0,handler:any;
 const trusted={};registerUpdateRequest({handle:(channel:string,fn:any)=>{assert.equal(channel,'forma:update:check');handler=fn;}},(event:any)=>event===trusted,async()=>{count++;});
 assert.equal(await handler({}),false);assert.equal(count,0);
 assert.equal(await handler(trusted,'https://evil.test'),true);assert.equal(count,1);
});
