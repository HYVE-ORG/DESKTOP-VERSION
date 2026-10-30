import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedState} from '../apps/api/src/seed';
import {execute} from '../apps/api/src/actions';
test('reunião imediata usa relógio do servidor, notifica e retry não duplica',()=>{
 const s=seedState('Admin','admin@test.local','hash',true),admin=s.users[0],p=s.projects[0];
 const guest=s.users.find(u=>u.id!==admin.id&&u.status==='active'&&u.projectIds.includes(p.id))!;assert.ok(guest);
 const start=Date.now(),requestId=crypto.randomUUID(),action={type:'meeting.instant',payload:{projectId:p.id,title:'Alinhar agora',attendeeIds:[admin.id,guest.id]},requestId};
 const result=execute(s,admin.id,action) as {id:string};const event=s.calendar.find(e=>e.id===result.id)!;
 assert.equal(event.instant,true);assert.equal(event.meeting,true);assert.ok(Date.parse(event.start)>=start);assert.ok(Date.parse(event.start)<=Date.now());
 assert.ok(s.notifications.some(n=>n.resourceId===event.id));assert.deepEqual(execute(s,admin.id,action),result);assert.equal(s.calendar.filter(e=>e.id===result.id).length,1);
 admin.role='user';assert.throws(()=>execute(s,admin.id,action));
});
test('reunião imediata recusa data enviada, projeto arquivado e convidado externo',()=>{
 const s=seedState('Admin','admin@test.local','hash',true),admin=s.users[0],p=s.projects[0];
 const start=(payload:unknown)=>execute(s,admin.id,{type:'meeting.instant',payload,requestId:crypto.randomUUID()}),valid={projectId:p.id,title:'Agora',attendeeIds:[admin.id]};
 assert.throws(()=>start({...valid,start:'2099-01-01T00:00:00Z'}));assert.throws(()=>start({...valid,attendeeIds:['outra-empresa']}));p.archived=true;assert.throws(()=>start(valid));
});
