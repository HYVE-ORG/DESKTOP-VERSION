import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app';
import {CentralDomain} from '../apps/api/src/central-domain';
const studio='30000000-0000-4000-8000-000000000001';
test('exportação HTTP exige sessão/cargo/origem, nega DTO extra e só entrega arquivo completo',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-export-'));let revoked=false;
 const central=new CentralDomain({url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'},async(url,options)=>{
  assert.ok(url.endsWith('/forma_studio_export_page'));assert.equal((options.headers as any).Authorization,'Bearer fixture-token');
  if(revoked)return Response.json({code:'42501'},{status:403});
  const p=JSON.parse(String(options.body));assert.equal(p.p_studio,studio);
  return Response.json({rows:p.p_section==='studio'?[{key:studio,record:{id:studio,name:'QA'}}]:[],nextCursor:null});
 });
 const server=await createApp(dir,0,{central});const origin='http://127.0.0.1:'+server.port,url=origin+'/api/central/studios/'+studio+'/export';
 const headers={Origin:origin,Authorization:'Bearer fixture-token','Content-Type':'application/json'};
 try{
  assert.equal((await fetch(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,401);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://evil.invalid'},body:'{}'})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers,body:'{"studioId":"other"}'})).status,400);
  const response=await fetch(url,{method:'POST',headers,body:'{}'});assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-disposition')||'',/attachment; filename="forma-studio-/);
  assert.match(response.headers.get('content-type')||'',/application\/x-ndjson/);
  const records=(await response.text()).trim().split('\n').map(x=>JSON.parse(x));assert.equal(records.at(-1).type,'complete');
  revoked=true;const denied=await fetch(url,{method:'POST',headers,body:'{}'});assert.equal(denied.status,403);assert.doesNotMatch(await denied.text(),/"type":"record"/);
 }finally{await server.close();await rm(dir,{recursive:true,force:true});}
});
