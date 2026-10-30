import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,access,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app';
import {emptyState} from '../apps/api/src/store';
import {seedState} from '../apps/api/src/seed';
import {hydrateState} from '../apps/api/src/migrate';
import {passwordHash} from '../apps/api/src/auth';
import type {State} from '../packages/contracts';
import type {StateStore} from '../apps/api/src/state-store';

// Test-only adapter: isolated state and a transaction queue, no directory property.
function memoryStore(initial=emptyState()):StateStore {
 let committed=structuredClone(initial),queue=Promise.resolve();
 return {
  async read(){await queue;return structuredClone(committed);},
  transact<T>(change:(draft:State)=>T|Promise<T>):Promise<T>{
   const job=queue.then(async()=>{const draft=structuredClone(committed);const result=await change(draft);committed=draft;return result;});
   queue=job.then(()=>{},()=>{});return job;
  }
 };
}
type Running=Awaited<ReturnType<typeof createApp>>;
const password='Senha-teste-beta-2026';
const request=(server:Running,path:string,body?:unknown,cookie='')=>fetch(`http://127.0.0.1:${server.port}/api${path}`,{method:body===undefined?'GET':'POST',headers:{origin:'http://localhost:5173','Content-Type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});
const cookieOf=(response:Response)=>response.headers.get('set-cookie')!.split(';')[0];

test('APIs usam adapter compartilhado sem directory e mantêm autorização',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-injected-'));const servers:Running[]=[];
 try{
  const store=memoryStore();
  for(const name of ['a','b'])servers.push(await createApp(join(dir,name),0,{store}));
  assert.equal(servers[0].store,store);
  const registered=await request(servers[0],'/register',{name:'Pessoa Beta',email:'beta@test.local',password});
  assert.equal(registered.status,201);const cookie=cookieOf(registered);
  const account=await request(servers[1],'/account',undefined,cookie);assert.equal(account.status,200);
  assert.match(JSON.stringify(await account.json()),/beta@test.local/);
  assert.equal((await request(servers[1],'/actions',{type:'help.create',payload:{title:'Teste',body:'Sem associação'},requestId:crypto.randomUUID()},cookie)).status,403);
  assert.equal((await request(servers[1],'/state',undefined,cookie)).status,403);
  for(const name of ['a','b'])await assert.rejects(access(join(dir,name,'state.json')));
 }finally{await Promise.all(servers.map(s=>s.close()));await rm(dir,{recursive:true,force:true});}
});

test('adapter inválido falha antes de iniciar a API e não cai em JSON',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-invalid-store-'));
 try{
  for(const store of [null,{}, {read:()=>{},transact:1}, {transact:()=>{}}]){
   let unexpected:Running|undefined;
   try{await assert.rejects(async()=>{unexpected=await createApp(dir,0,{store:store as unknown as StateStore});},/persistência|store/i);}
   finally{await unexpected?.close();}
  }
  await assert.rejects(access(join(dir,'state.json')));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('erros read/transact retornam falha HTTP sem criar estado JSON',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-failed-store-'));let server:Running|undefined;
 try{
  const store:StateStore={read:async()=>{throw Error('leitura de teste indisponível');},transact:async()=>{throw Error('escrita de teste indisponível');}};
  server=await createApp(dir,0,{store});
  assert.equal((await request(server,'/status')).status,500);
  const result=await request(server,'/register',{name:'Teste',email:'failed@test.local',password});
  assert.equal(result.status,500);assert.equal(result.headers.get('set-cookie'),null);
  assert.ok(!JSON.stringify(await result.json()).includes('indisponível'));
  await assert.rejects(access(join(dir,'state.json')));
 }finally{await server?.close();await rm(dir,{recursive:true,force:true});}
});

test('uploads com adapter injetado usam diretório da API e mantêm acesso privado',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-injected-file-'));let server:Running|undefined;
 try{
  const hash=await passwordHash(password),store=memoryStore(hydrateState(seedState('Admin','admin@test.local',hash,true)));
  server=await createApp(dir,0,{store});
  const adminCookie=cookieOf(await request(server,'/login',{email:'admin@test.local',password}));
  const userCookie=cookieOf(await request(server,'/login',{email:'lucas@forma.local',password}));
  const state=await store.read(),project=state.projects.find(p=>p.name.includes('Onboarding'))!;assert.ok(project);
  const bytes=Buffer.from('const beta = true;');
  const uploaded=await fetch(`http://127.0.0.1:${server.port}/api/files?name=beta.ts&scope=project&scopeId=${project.id}`,{method:'POST',headers:{origin:'http://localhost:5173',cookie:adminCookie,'Content-Type':'application/octet-stream'},body:bytes});
  assert.equal(uploaded.status,201);const file=await uploaded.json() as {id:string};
  assert.deepEqual(await readFile(join(dir,'uploads',file.id)),bytes);
  const downloaded=await request(server,`/files/${file.id}`,undefined,adminCookie);assert.equal(downloaded.status,200);
  assert.equal(await downloaded.text(),bytes.toString());
  assert.equal((await request(server,`/files/${file.id}`,undefined,userCookie)).status,404);
  await assert.rejects(access(join(dir,'state.json')));
 }finally{await server?.close();await rm(dir,{recursive:true,force:true});}
});

test('sem adapter mantém JSON, identidade e sessão após reabrir API',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-default-store-'));let server:Running|undefined;
 try{
  server=await createApp(dir,0);
  const hash=await passwordHash(password);
  await server.store.transact(s=>Object.assign(s,seedState('Admin','admin@test.local',hash,true)));
  const cookie=cookieOf(await request(server,'/login',{email:'admin@test.local',password}));
  const before=await (await request(server,'/state',undefined,cookie)).json() as any;
  await server.close();server=undefined;server=await createApp(dir,0);
  const after=await request(server,'/state',undefined,cookie);assert.equal(after.status,200);
  const restored=await after.json() as any;assert.equal(restored.me.id,before.me.id);
  assert.deepEqual(restored.projects.map((p:any)=>p.id),before.projects.map((p:any)=>p.id));
  assert.equal(restored.me.role,'admin');assert.equal((await request(server,'/status')).status,200);
  await access(join(dir,'state.json'));
 }finally{await server?.close();await rm(dir,{recursive:true,force:true});}
});
