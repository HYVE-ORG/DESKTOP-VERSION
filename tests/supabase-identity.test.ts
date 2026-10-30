import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseIdentity,supabaseIdentityFromEnv} from '../apps/api/src/supabase-identity';

const config={url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'};
test('Supabase exige configuração explícita e chave pública; não aceita destino arbitrário',()=>{
 assert.equal(supabaseIdentityFromEnv({}),undefined);
 assert.throws(()=>supabaseIdentityFromEnv({SUPABASE_URL:config.url}),/configur/i);
 for(const url of ['http://localhost:54321','https://evil.test','https://x.supabase.co/path','https://user:password@x.supabase.co'])assert.throws(()=>new SupabaseIdentity({...config,url}),/configur/i);
 assert.throws(()=>new SupabaseIdentity({...config,publishableKey:'sb_secret_private'}),/configur/i);
});

test('Auth valida bearer no provedor e não retorna metadata de permissões',async()=>{
 let calls=0;
 const identity=new SupabaseIdentity(config,async(url,options)=>{
  calls++;assert.equal(url,config.url+'/auth/v1/user');
  const headers=new Headers(options?.headers);assert.equal(headers.get('apikey'),config.publishableKey);assert.equal(headers.get('authorization'),'Bearer fixture-token');
  assert.equal(options?.redirect,'error');assert.equal(options?.cache,'no-store');
  return Response.json({id:'4adf1601-68e1-4d8b-90a1-58c9f6115603',email:'test@example.test',user_metadata:{role:'admin'},app_metadata:{provider:'email'}});
 });
 assert.deepEqual(await identity.verify('Bearer fixture-token'),{provider:'supabase',id:'4adf1601-68e1-4d8b-90a1-58c9f6115603'});
 await assert.rejects(identity.verify(undefined),{status:401});await assert.rejects(identity.verify('Bearer x\nsecret'),{status:401});assert.equal(calls,1);
});

test('Auth diferencia credencial rejeitada de serviço indisponível e limita resposta',async()=>{
 for(const status of [401,403,429,500]){
  const identity=new SupabaseIdentity(config,async()=>new Response('private details',{status}));
  await assert.rejects(identity.verify('Bearer token'),{status:status===401||status===403?401:503});
 }
 const offline=new SupabaseIdentity(config,async()=>{throw Error('network private secret');});
 await assert.rejects(offline.verify('Bearer token'),e=>!String(e).includes('private')&&(e as any).status===503);
 const invalid=new SupabaseIdentity(config,async()=>Response.json({id:'not-a-uuid'}));await assert.rejects(invalid.verify('Bearer token'),{status:503});
 const oversized=new SupabaseIdentity(config,async()=>new Response('x'.repeat(70_000)));await assert.rejects(oversized.verify('Bearer token'),{status:503});
});

test('checagem operacional prova apenas Auth, nunca banco central',async()=>{
 const identity=new SupabaseIdentity(config,async(url,options)=>{assert.equal(url,config.url+'/auth/v1/settings');assert.equal(new Headers(options.headers).has('authorization'),false);return Response.json({external:{email:true}});});
 assert.deepEqual(await identity.checkConnection(),{authReachable:true,databaseVerified:false});
});
