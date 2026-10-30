import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../apps/api/src/app';
import { seedState } from '../apps/api/src/seed';
import { passwordHash } from '../apps/api/src/auth';
import {io} from 'socket.io-client';

test('member presence follows authenticated sockets and stops after session revocation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-presence-')),server=await createApp(dir,0);
 let socket:ReturnType<typeof io>|undefined;
 try{
  const hash=await passwordHash('Senha-teste-2026');
  await server.store.transact(s=>Object.assign(s,seedState('Admin','admin@forma.local',hash,true)));
  const call=(path:string,cookie='',body?:unknown)=>fetch(`http://127.0.0.1:${server.port}/api${path}`,{method:body?'POST':'GET',headers:{origin:'http://localhost:5173',cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const login=async()=>{const response=await call('/login','',{email:'admin@forma.local',password:'Senha-teste-2026'});return response.headers.get('set-cookie')!.split(';')[0];};
  const cookie=await login(),observer=await login();
  const initial=await(await call('/state',observer)).json();
  assert.ok(initial.people.every((p:any)=>p.presence==='offline'));
  socket=io(`http://127.0.0.1:${server.port}`,{autoConnect:false,reconnection:false,extraHeaders:{origin:'http://localhost:5173',cookie}});
  await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Socket connection timed out')),3000);socket!.once('connect',()=>{clearTimeout(timeout);resolve();});socket!.once('connect_error',error=>{clearTimeout(timeout);reject(error);});socket!.connect();});
  const connected=await(await call('/state',observer)).json();
  assert.equal(connected.people.find((p:any)=>p.id===initial.me.id).presence,'online');
  await call('/logout',cookie,{});
  const revoked=await(await call('/state',observer)).json();
  assert.equal(revoked.people.find((p:any)=>p.id===initial.me.id).presence,'offline');
  assert.equal((await call('/state')).status,401);
 }finally{socket?.disconnect();await server.close();await rm(dir,{recursive:true,force:true});}
});
test('public signup starts without Studio and invitation acceptance survives restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-account-'));let server=await createApp(dir,0);
 try {
  const call=(path:string,cookie='',body?:unknown)=>fetch(`http://127.0.0.1:${server.port}/api${path}`,{method:body?'POST':'GET',headers:{origin:'http://localhost:5173',cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const hash=await passwordHash('Senha-teste-2026');
  await server.store.transact(s=>Object.assign(s,seedState('Admin','admin@forma.local',hash,true)));
  const adminLogin=await call('/login','',{email:'admin@forma.local',password:'Senha-teste-2026'});
  const admin=adminLogin.headers.get('set-cookie')!.split(';')[0];
  const reg=await call('/register','',{name:'Pessoa nova',email:'nova@forma.local',password:'Senha-teste-2026'});
  assert.equal(reg.status,201);const cookie=reg.headers.get('set-cookie')!.split(';')[0];
  const account=await (await call('/account',cookie)).json();assert.equal(account.studios.length,0);
  assert.equal((await call('/state',cookie)).status,403);
  assert.equal((await call('/studios/select',cookie,{orgId:'foreign'})).status,403);
  const state=await (await call('/state',admin)).json();
  const invitation=await (await call('/invitations',admin,{email:'nova@forma.local',name:'Nova',role:'user',projectIds:[state.projects[0].id]})).json();
  assert.equal((await (await call('/account',cookie)).json()).invitations.length,1);
  assert.equal((await call(`/invitations/${invitation.id}/respond`,admin,{decision:'accept'})).status,404);
  assert.equal((await call(`/invitations/${invitation.id}/respond`,cookie,{decision:'accept'})).status,201);
  assert.equal((await call(`/invitations/${invitation.id}/respond`,cookie,{decision:'accept'})).status,201);
  assert.equal((await (await call('/account',cookie)).json()).studios.length,1);
  const studioId=state.org.id;
  await server.store.transact(s=>{const a=s.accounts!.find(a=>a.email==='nova@forma.local')!;s.orgs.push({id:'second-studio',name:'Outro Studio',description:''});s.users.push({...a,id:'second-membership',accountId:a.id,orgId:'second-studio',role:'admin',workspaceIds:[],projectIds:[]});});
  assert.equal((await call('/studios/select',cookie,{orgId:'second-studio'})).status,201);
  const second=await (await call('/state',cookie)).json();assert.equal(second.org.id,'second-studio');assert.equal(second.projects.length,0);assert.equal(second.messages.length,0);
  assert.equal((await call('/account/profile',cookie,{name:'Nome atualizado',title:'Designer',bio:'Olá',location:''})).status,201);
  assert.equal((await call('/studios/select',cookie,{orgId:studioId})).status,201);
  assert.equal((await (await call('/state',cookie)).json()).me.name,'Nome atualizado');
  await server.store.transact(s=>{s.users.find(u=>u.id==='second-membership')!.status='suspended';});
  assert.equal((await call('/studios/select',cookie,{orgId:'second-studio'})).status,403);
  assert.equal((await call('/setup',cookie,{})).status,403);
  const disk=JSON.parse(await readFile(join(dir,'state.json'),'utf8'));assert.equal('users' in disk,false);assert.equal(disk.accounts.length,5);
  await server.close();server=await createApp(dir,0);
  assert.equal((await (await call('/account',cookie)).json()).studios.length,1);
 }finally{await server.close();await rm(dir,{recursive:true,force:true});}
});
