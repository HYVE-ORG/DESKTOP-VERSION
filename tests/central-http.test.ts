import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app';
import {CentralDomain} from '../apps/api/src/central-domain';

test('rotas centrais exigem bearer, origem e DTO; não criam cookie/base local',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-central-'));let server:Awaited<ReturnType<typeof createApp>>|undefined;
 let calls=0;const domain=new CentralDomain({url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'},async()=>{calls++;return Response.json({studios:[],invitations:[]});});
 try{
  server=await createApp(dir,0,{central:domain});const base=`http://127.0.0.1:${server.port}/api`;
  assert.equal((await fetch(base+'/central/account')).status,401);
  const headers={Authorization:'Bearer fixture-token','Content-Type':'application/json',Origin:`http://127.0.0.1:${server.port}`};
  const res=await fetch(base+'/central/account',{headers});assert.equal(res.status,200);assert.equal(res.headers.get('set-cookie'),null);assert.equal(res.headers.get('cache-control'),'no-store');
  const post=(path:string,body:unknown,origin=headers.Origin)=>fetch(base+path,{method:'POST',headers:{...headers,Origin:origin},body:JSON.stringify(body)});
  assert.equal((await post('/central/profile',{name:'Pessoa',handle:'pessoa',bio:'',title:'',location:'',role:'admin'})).status,400);
  assert.equal((await post('/central/profile',{name:'Pessoa',handle:'pessoa',bio:'',title:'',location:''},'https://evil.invalid')).status,403);
  assert.equal((await post('/central/profile',{name:'Pessoa',handle:'pessoa',bio:'',title:'',location:''})).status,201);
  assert.equal((await post('/central/invitations',{studioId:'not-uuid',email:'a@b.com',role:'user'})).status,400);
  assert.equal(calls,2);
  assert.equal((await fetch(base+'/account',{headers})).status,401);
  await assert.rejects(access(join(dir,'state.json')));
 }finally{await server?.close();await rm(dir,{recursive:true,force:true});}
});

test('login central guarda tokens somente em cookies HttpOnly e exige origem no refresh',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-central-auth-'));let server:Awaited<ReturnType<typeof createApp>>|undefined;
 const domain=new CentralDomain({url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'},async(url,options)=>{
  if(url.includes('/auth/v1/token'))return Response.json({access_token:'access-fixture',refresh_token:'refresh-fixture',expires_in:3600});
  assert.equal((options.headers as Record<string,string>).Authorization,'Bearer access-fixture');
  return Response.json({studios:[],invitations:[]});
 });
 try{
  server=await createApp(dir,0,{central:domain});const base=`http://127.0.0.1:${server.port}/api/central`,origin=`http://127.0.0.1:${server.port}`;
  const res=await fetch(base+'/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'person@forma.invalid',password:'password-fixture'})});
  assert.equal(res.status,201);assert.deepEqual(await res.json(),{ok:true});
  const cookies=res.headers.getSetCookie();assert.equal(cookies.length,2);assert.ok(cookies.every(c=>c.includes('HttpOnly')&&c.includes('Path=/api/central')));
  const Cookie=cookies.map(c=>c.split(';')[0]).join('; ');
  assert.equal((await fetch(base+'/account',{headers:{Cookie}})).status,200);
  assert.equal((await fetch(base+'/refresh',{method:'POST',headers:{Origin:'https://evil.invalid',Cookie}})).status,403);
  assert.equal((await fetch(base+'/refresh',{method:'POST',headers:{Origin:origin,Cookie}})).status,201);
 }finally{await server?.close();await rm(dir,{recursive:true,force:true});}
});

test('logout central renova acesso expirado antes de revogar a sessão remota',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-central-logout-'));let server:Awaited<ReturnType<typeof createApp>>|undefined;const paths:string[]=[];
 const domain=new CentralDomain({url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'},async(url,options)=>{
  paths.push(url);
  if(url.includes('grant_type=refresh_token'))return Response.json({access_token:'renewed-access',refresh_token:'renewed-refresh',expires_in:3600});
  if(url.includes('/logout')){assert.equal((options.headers as Record<string,string>).Authorization,'Bearer renewed-access');return new Response(null,{status:204});}
  throw Error('Rota inesperada');
 });
 try{
  server=await createApp(dir,0,{central:domain});const origin=`http://127.0.0.1:${server.port}`;
  const res=await fetch(origin+'/api/central/logout',{method:'POST',headers:{Origin:origin,Cookie:'forma_central_refresh=refresh-fixture'}});
  assert.equal(res.status,201);assert.equal(paths.length,2);
  assert.ok(paths[0].includes('grant_type=refresh_token'));assert.ok(paths[1].includes('/logout?scope=local'));
  assert.ok(res.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));
 }finally{await server?.close();await rm(dir,{recursive:true,force:true});}
});
