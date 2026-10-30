import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app';
import {CentralDomain} from '../apps/api/src/central-domain';
import {uploadProof} from '../apps/api/src/central-work';
const studio='30000000-0000-4000-8000-000000000001',project='40000000-0000-4000-8000-000000000001',fileId='50000000-0000-4000-8000-000000000001',actor='10000000-0000-4000-8000-000000000001';
test('duas APIs usam domínio central, validam DTO e não criam JSON local',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-online-http-'));const servers:Awaited<ReturnType<typeof createApp>>[]=[];let count=0;
 const domain=new CentralDomain({url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'},async(url,options)=>{
  assert.equal((options.headers as Record<string,string>).Authorization,'Bearer fixture-token');
  if(url.endsWith('/forma_work_action')){count++;return Response.json({id:project,version:1});}
  return Response.json({projects:Array.from({length:count},()=>({id:project}))});
 });
 try{
  servers.push(await createApp(dir,0,{central:domain}));servers.push(await createApp(dir,0,{central:domain}));
  const a=`http://127.0.0.1:${servers[0].port}`,b=`http://127.0.0.1:${servers[1].port}`;
  const headers={Authorization:'Bearer fixture-token',Origin:a,'Content-Type':'application/json'};
  assert.equal((await fetch(a+`/api/central/studios/${studio}/work`)).status,401);
  const action={type:'workspace.create',requestId:crypto.randomUUID(),payload:{name:'Design',color:'#6b815b'}};
  assert.equal((await fetch(a+`/api/central/studios/${studio}/actions`,{method:'POST',headers,body:JSON.stringify(action)})).status,201);
  const response=await fetch(b+`/api/central/studios/${studio}/work`,{headers:{Authorization:headers.Authorization}});assert.equal(response.status,200);assert.equal((await response.json()).projects.length,1);
  assert.equal((await fetch(a+`/api/central/studios/${studio}/actions`,{method:'POST',headers,body:JSON.stringify({...action,payload:{...action.payload,role:'admin'}})})).status,400);
  assert.equal(count,1);await assert.rejects(access(join(dir,'state.json')));
 }finally{for(const server of servers)await server.close();await rm(dir,{recursive:true,force:true});}
});

test('cancelamento antes de um upload aceita só IDs e não depende de acesso local',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-online-cancel-'));let server:Awaited<ReturnType<typeof createApp>>|undefined;let calls=0;
 const domain=new CentralDomain({url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'},async(url,options)=>{calls++;assert.ok(url.endsWith('/forma_upload_cancel'));const body=JSON.parse(options.body as string);assert.equal(body.p_studio,studio);assert.notEqual(body.p_request,body.p_cleanup_request);return Response.json({canceled:true});});
 try{server=await createApp(dir,0,{central:domain});const origin=`http://127.0.0.1:${server.port}`;
 const response=await fetch(origin+`/api/central/studios/${studio}/uploads/${crypto.randomUUID()}/cancel`,{method:'POST',headers:{Origin:origin,Authorization:'Bearer fixture-token'}});
 assert.equal(response.status,201);assert.deepEqual(await response.json(),{ok:true,canceled:true,cleanupChecked:true});assert.equal(calls,1);
 }finally{await server?.close();await rm(dir,{recursive:true,force:true});}
});
test('arquivo central valida bytes, finaliza com prova interna e baixa com hash, sem expor objeto',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-online-file-'));let server:Awaited<ReturnType<typeof createApp>>|undefined;
 let metadata:any,stored:Buffer|undefined;let uploads=0,finishes=0;const verifier='e'.repeat(64);
 const domain=new CentralDomain({url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'},async(url,options)=>{
  if(url.includes('/storage/')){
   if(options.method==='POST'){uploads++;stored=Buffer.from(options.body as Uint8Array);return Response.json({Key:'ok'});}
   if(options.method==='GET')return new Response(stored?new Uint8Array(stored):null,{status:stored?200:404});
   stored=undefined;return Response.json([]);
  }
  const data=JSON.parse(options.body as string);
  if(url.endsWith('/forma_work_action')){
   if(data.p_kind==='file.reserve')metadata||={...data.p_data,id:fileId,studio_id:studio,project_id:project,conversation_id:null,uploader_id:actor,object_key:`${studio}/${fileId}`,status:'pending',expires_at:new Date(Date.now()+900000).toISOString()};
   if(data.p_kind==='file.finish'){assert.equal(data.p_data.proof,uploadProof(verifier,metadata));metadata.status='ready';finishes++;}
   if(data.p_kind==='file.delete')metadata.status='deleted';
  }
  return Response.json(metadata);
 });
 try{
  server=await createApp(dir,0,{central:domain,uploadVerifier:verifier});const origin=`http://127.0.0.1:${server.port}`;
  const headers={Authorization:'Bearer fixture-token',Origin:origin,'Content-Type':'application/octet-stream'};
  const query=new URLSearchParams({name:'exemplo.ts',projectId:project,requestId:crypto.randomUUID()});
  const url=origin+`/api/central/studios/${studio}/files?${query}`;
  const response=await fetch(url,{method:'POST',headers,body:'const a=1;'});assert.equal(response.status,201);
  const file=await response.json();assert.equal(file.name,'exemplo.ts');assert.equal(file.object_key,undefined);assert.equal(file.proof,undefined);
  assert.equal((await fetch(url,{method:'POST',headers,body:'const a=1;'})).status,201);assert.equal(uploads,1);assert.equal(finishes,1);
  const download=await fetch(origin+`/api/central/files/${fileId}`,{headers:{Authorization:headers.Authorization}});assert.equal(download.status,200);assert.equal(await download.text(),'const a=1;');assert.equal(download.headers.get('x-content-type-options'),'nosniff');
  stored=Buffer.from('alterado!!');assert.equal((await fetch(origin+`/api/central/files/${fileId}`,{headers:{Authorization:headers.Authorization}})).status,503);
  stored=Buffer.from('const a=1;');
  const partial=await fetch(origin+`/api/central/files/${fileId}`,{headers:{Authorization:headers.Authorization,Range:'bytes=0-4'}});assert.equal(partial.status,206);assert.equal(await partial.text(),'const');
  const removed=await fetch(origin+`/api/central/studios/${studio}/files/${fileId}/delete`,{method:'POST',headers:{Authorization:headers.Authorization,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID()})});assert.equal(removed.status,201);assert.deepEqual(await removed.json(),{ok:true,purged:true});assert.equal(stored,undefined);
  assert.equal((await fetch(origin+`/api/central/files/${fileId}`,{headers:{Authorization:headers.Authorization}})).status,404);
  const bad=new URLSearchParams({name:'malware.exe',projectId:project,requestId:crypto.randomUUID()});assert.equal((await fetch(origin+`/api/central/studios/${studio}/files?${bad}`,{method:'POST',headers,body:'MZ'})).status,415);
  await assert.rejects(access(join(dir,'uploads')));
 }finally{await server?.close();await rm(dir,{recursive:true,force:true});}
});
