import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CentralDomain} from '../apps/api/src/central-domain';
test('Storage usa bucket privado fixo, sem upsert/URL pública e nega caminho livre',async()=>{
 const calls:{url:string;init:RequestInit}[]=[];
 const domain=new CentralDomain({url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'},async(url,init)=>{calls.push({url,init});return init.method==='GET'?new Response(Buffer.from('const a=1;')):Response.json({Key:'ok'});});
 const key='30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001';
 await domain.storageUpload('Bearer fixture-token',key,Buffer.from('const a=1;'),'text/plain; charset=utf-8');
 assert.equal((calls[0].init.headers as Record<string,string>)['x-upsert'],'false');
 assert.equal((calls[0].init.headers as Record<string,string>)['Content-Type'],'text/plain');
 assert.equal(calls[0].url,'https://forma-test.supabase.co/storage/v1/object/forma-private/'+key);
 assert.equal((await domain.storageDownload('Bearer fixture-token',key)).toString(),'const a=1;');
 await domain.storageDelete('Bearer fixture-token',key);assert.deepEqual(JSON.parse(calls[2].init.body as string),{prefixes:[key]});
 await assert.rejects(domain.storageDownload('Bearer fixture-token','../other'),{status:400});assert.equal(calls.length,3);
});
test('Storage nega anônimo, não segue redirect e limita bytes de download',async()=>{
 const config={url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'};let calls=0;
 const domain=new CentralDomain(config,async(_url,init)=>{calls++;assert.equal(init.redirect,'error');return new Response(new Uint8Array(15728641));});
 const key='30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001';
 await assert.rejects(domain.storageDownload(undefined,key),{status:401});assert.equal(calls,0);
 await assert.rejects(domain.storageDownload('Bearer fixture-token',key),{status:503});
});
