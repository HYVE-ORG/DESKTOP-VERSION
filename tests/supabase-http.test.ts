import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app';
import {SupabaseIdentity} from '../apps/api/src/supabase-identity';

test('rota de identidade verifica provedor sem conceder sessão local ou Studio',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-supabase-http-'));let server:Awaited<ReturnType<typeof createApp>>|undefined;
 try{
  server=await createApp(dir,0);let base=`http://127.0.0.1:${server.port}/api`;
  assert.equal((await fetch(base+'/auth/identity')).status,503);await server.close();server=undefined;
  const identity=new SupabaseIdentity({url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'},async()=>Response.json({id:'4adf1601-68e1-4d8b-90a1-58c9f6115603',user_metadata:{role:'admin'}}));
  server=await createApp(dir,0,{identity});base=`http://127.0.0.1:${server.port}/api`;
  assert.equal((await fetch(base+'/auth/identity')).status,401);
  const headers={Authorization:'Bearer fixture-token'};
  const response=await fetch(base+'/auth/identity',{headers});assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{provider:'supabase',id:'4adf1601-68e1-4d8b-90a1-58c9f6115603'});
  assert.equal((await fetch(base+'/state',{headers})).status,401);
  assert.equal((await fetch(base+'/account',{headers})).status,401);
  await assert.rejects(access(join(dir,'state.json')));
 }finally{await server?.close();await rm(dir,{recursive:true,force:true});}
});
