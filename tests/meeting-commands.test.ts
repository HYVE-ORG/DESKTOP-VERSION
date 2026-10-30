import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedState} from '../apps/api/src/seed';
import {execute} from '../apps/api/src/actions';
import {meetingShortcut} from '../apps/web/src/media';
test('meet creation obeys hierarchy and listing is scoped to accessible meetings',()=>{
 const s=seedState('Admin','admin@test.local','hash',true),admin=s.users[0];
 const c=s.conversations.find(c=>c.projectId===s.projects[0].id)!;
 const call=(userId:string,text:string)=>execute(s,userId,{type:'command.execute',payload:{conversationId:c.id,text},requestId:crypto.randomUUID()}) as any;
 assert.equal(call(admin.id,'/meet').navigate,'meetings');
 assert.equal(call(admin.id,'/meet criar').open,'reuniao');
 const user=s.users.find(u=>u.role==='user'&&u.projectIds.includes(c.projectId!))!;
 assert.throws(()=>call(user.id,'/meet criar'));
 c.archived=true;assert.throws(()=>call(admin.id,'/meet criar'));
});
test('meeting shortcuts ignore editing and modified keys',()=>{
 assert.equal(meetingShortcut('m','INPUT',false,false),null);
 assert.equal(meetingShortcut('c','DIV',true,false),null);
 assert.equal(meetingShortcut('m','BUTTON',false,true),null);
 assert.equal(meetingShortcut('M','BUTTON',false,false),'audio');
 assert.equal(meetingShortcut('c','DIV',false,false),'video');
});
