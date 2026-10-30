import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app';
import {Store} from '../apps/api/src/store';
import {seedState} from '../apps/api/src/seed';
import {passwordHash} from '../apps/api/src/auth';
import {MeetingMedia} from '../apps/api/src/meeting-media';
test('entrada e presença conferem sessão/origem/convite e mídia não concede poderes de gestor',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-media-')),store=new Store(dir);const state=seedState('QA','qa@test.local',await passwordHash('QA-media-2026'),true);
 const event=state.calendar[0];event.start=new Date().toISOString();event.end=new Date(Date.now()+3600000).toISOString();await store.transact(s=>Object.assign(s,state));
 const removed:string[]=[];const media=new MeetingMedia({url:'ws://127.0.0.1:7880',apiKey:'devkey',apiSecret:'secret'},{createRoom:async()=>({} as any),removeParticipant:async(_room,identity)=>{removed.push(identity);},listRooms:async()=>[],listParticipants:async()=>[]});
 const server=await createApp(dir,0,{store,media}),origin='http://127.0.0.1:'+server.port;
 const send=(path:string,body:unknown,cookie='')=>fetch(origin+path,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  const url=`/api/meetings/${event.id}/join`;
  assert.equal((await send(url,{})).status,401);
  const login=await send('/api/login',{email:'qa@test.local',password:'QA-media-2026'});assert.equal(login.status,201);const cookie=login.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await send(url,{room:'forged'},cookie)).status,400);
  const response=await send(url,{},cookie);assert.equal(response.status,201);const result=await response.json() as any;assert.equal(result.serverUrl,'ws://127.0.0.1:7880');assert.ok(result.token);
  const claim=JSON.parse(Buffer.from(result.token.split('.')[1],'base64url').toString());assert.equal(claim.video.roomAdmin,undefined);
  await store.transact(s=>{s.projects.find(p=>p.id===event.projectId)!.archived=true;});
  assert.equal((await send(`/api/meetings/${event.id}/presence`,{},cookie)).status,403);assert.equal((await send(url,{},cookie)).status,403);
  await new Promise(resolve=>setTimeout(resolve,3400));assert.ok(removed.includes(state.users[0].id));
 }finally{await server.close();await rm(dir,{recursive:true,force:true});}
});
