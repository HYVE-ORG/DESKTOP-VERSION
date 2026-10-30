import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedState} from '../apps/api/src/seed';
import {meetingAccess,mediaFromEnv,MeetingMedia} from '../apps/api/src/meeting-media';
test('entrada exige convite/projeto ativo e sala fica isolada por Studio/evento',()=>{
 const s=seedState('Admin','qa@test.local','hash',true),u=s.users[0],e=s.calendar[0];e.start=new Date().toISOString();e.end=new Date(Date.now()+3600000).toISOString();
 const access=meetingAccess(s,u,e.id);assert.match(access.room,/^forma-[a-f0-9]{40}$/);assert.equal(access.identity,u.id);
 e.meeting=false;assert.throws(()=>meetingAccess(s,u,e.id));e.meeting=true;
 s.projects.find(p=>p.id===e.projectId)!.archived=true;assert.throws(()=>meetingAccess(s,u,e.id));
});
test('configuração não aceita WS remoto nem segredo local em serviço público',()=>{
 assert.equal(mediaFromEnv({}),undefined);
 assert.throws(()=>mediaFromEnv({LIVEKIT_URL:'ws://evil.test',LIVEKIT_API_KEY:'devkey',LIVEKIT_API_SECRET:'secret'}));
 assert.throws(()=>mediaFromEnv({LIVEKIT_URL:'wss://media.example.com',LIVEKIT_API_KEY:'devkey',LIVEKIT_API_SECRET:'secret'}));
});
test('token só concede entrada/publicação na sala e servidor limita8 participantes',async()=>{
 let created:any;const service={createRoom:async(input:any)=>{created=input;return {} as any;},removeParticipant:async()=>{},listRooms:async()=>[],listParticipants:async()=>[]};
 const media=new MeetingMedia({url:'ws://127.0.0.1:7880',apiKey:'devkey',apiSecret:'secret'},service);
 const join=await media.join({room:'forma-test',identity:'opaque-id',name:'QA'});
 const claim=JSON.parse(Buffer.from(join.token.split('.')[1],'base64url').toString());
 assert.equal(created.maxParticipants,8);assert.equal(claim.video.room,'forma-test');assert.equal(claim.video.roomJoin,true);assert.equal(claim.video.roomAdmin,undefined);assert.equal(claim.sub,'opaque-id');
 assert.ok(claim.exp-claim.nbf<=120);assert.equal(join.serverUrl,'ws://127.0.0.1:7880');
});
test('capacidade considera salas ativas do provedor, sem consumir vagas por histórico',async()=>{
 const rooms=Array.from({length:32},(_,i)=>({name:'active-'+i,numParticipants:1} as any));let created=0;
 const media=new MeetingMedia({url:'ws://127.0.0.1:7880',apiKey:'devkey',apiSecret:'secret'},{listRooms:async()=>rooms,listParticipants:async()=>[],createRoom:async()=>{created++;return {} as any;},removeParticipant:async()=>{}});
 await assert.rejects(media.join({room:'new-room',identity:'qa',name:'QA'}),/capacidade/);assert.equal(created,0);
 await media.join({room:'active-0',identity:'qa',name:'QA'});assert.equal(created,1);
 rooms.forEach(r=>r.numParticipants=0);await media.join({room:'new-room',identity:'qa',name:'QA'});assert.equal(created,2);
});
