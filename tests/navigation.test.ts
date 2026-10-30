import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedState} from '../apps/api/src/seed';
import {snapshot} from '../apps/api/src/views';
import {quickActions,spaceTab} from '../apps/web/src/navigation';
const fixture=()=>seedState('Admin','admin@test.local','hash',true);
test('ações rápidas seguem cargo, projeto e área autorizados',()=>{
 const s=fixture(),a=s.users[0],p=s.projects[0];
 const actions=quickActions(snapshot(s,a),`workspace/${p.workspaceId}/chat`);
 assert.ok(actions.some(x=>x.dialog.kind==='workspace'));
 assert.equal(actions.find(x=>x.dialog.kind==='task-create')?.dialog.projectId,p.id);
 const user=s.users.find(x=>x.role==='user')!;assert.deepEqual(quickActions(snapshot(s,user),'home'),[]);
 const c=s.users.find(x=>x.role==='coordinator')!;assert.ok(!quickActions(snapshot(s,c),'home').some(x=>x.dialog.kind==='workspace'));
});
test('contexto inexistente ou sem projeto gerenciável não oferece criação indevida',()=>{
 const s=fixture(),a=s.users[0],view=snapshot(s,a);
 assert.deepEqual(quickActions(view,'workspace/ausente').map(x=>x.dialog.kind),['workspace']);
 s.projects.forEach(p=>p.archived=true);assert.deepEqual(quickActions(snapshot(s,a),'home').map(x=>x.dialog.kind),['workspace']);
});
test('aba de Space vem da URL e valor desconhecido volta à visão geral',()=>{
 assert.equal(spaceTab('workspace/design/chat'),'chat');assert.equal(spaceTab('workspace/design/tasks'),'tasks');
 assert.equal(spaceTab('workspace/design'),'overview');assert.equal(spaceTab('workspace/design/injetado'),'overview');
});
