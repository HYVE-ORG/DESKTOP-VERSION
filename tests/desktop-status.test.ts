import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('retorno nativo aguarda provisionamento e rejeição de retry permite nova tentativa',async()=>{
 const elements=new Map<string,any>();let finish!:(value:unknown)=>void;
 const get=(id:string)=>{if(!elements.has(id))elements.set(id,{disabled:false,hidden:false,textContent:'',listeners:{},addEventListener(name:string,fn:Function){this.listeners[name]=fn;}});return elements.get(id);};
 const pending=new Promise(resolve=>finish=resolve);
 runInNewContext(readFileSync(new URL('../apps/desktop/status.js',import.meta.url),'utf8'),{location:{search:'?state=admin'},URLSearchParams,document:{getElementById:get},FormData:class{get(key:string){return key==='email'?'operator@teste.local':'Studio teste';}},window:{formaDesktop:{provision:()=>pending,retry:async()=>false,quit(){}}}});
 const submit=get('operator').listeners.submit({preventDefault(){},currentTarget:{}});
 assert.equal(get('retry').disabled,true,'não pode voltar durante gravação');
 finish({ok:true,message:'Pronto'});await submit;assert.equal(get('retry').disabled,false);
 await get('retry').listeners.click();assert.equal(get('retry').disabled,false,'retry rejeitado deve permitir nova tentativa');
});
