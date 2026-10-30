import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedState} from '../apps/api/src/seed';
import {execute} from '../apps/api/src/actions';
import {snapshot} from '../apps/api/src/views';
import {hydrateState,serializeState} from '../apps/api/src/migrate';
const fixture=()=>seedState('Admin','admin@test.local','hash',true);
const act=(s:ReturnType<typeof fixture>,u:string,type:string,payload:unknown,key=crypto.randomUUID())=>execute(s,u,{type,payload,requestId:key}) as {id:string;version:number};
const fields={name:'Product Design',description:'Projetos do produto',icon:'code',color:'#8b75cb',cover:'lavender',timezone:'America/Sao_Paulo'};
const edit=(s:ReturnType<typeof fixture>,id=s.workspaces[0].id)=>({...fields,id,version:s.workspaces.find(w=>w.id===id)?.version||1,memberIds:s.users.filter(p=>p.workspaceIds.includes(id)).map(p=>p.id),expectedMemberIds:s.users.filter(p=>p.workspaceIds.includes(id)).map(p=>p.id)});
test('Space criado tem identidade, capa, auditoria e membros sem conceder projetos',()=>{
 const s=fixture(),a=s.users[0],p=s.users[2],before=[...p.projectIds];
 const r=act(s,a.id,'workspace.create',{...fields,memberIds:[p.id]});
 const w=s.workspaces.find(w=>w.id===r.id)!;
 assert.equal(w.description,fields.description);assert.equal(w.icon,'code');assert.equal(w.version,1);assert.ok(w.createdAt);assert.equal(w.createdBy,a.id);
 assert.ok(a.workspaceIds.includes(w.id));assert.ok(p.workspaceIds.includes(w.id));assert.deepEqual(p.projectIds,before);
 assert.ok(s.conversations.some(c=>c.kind==='workspace'&&c.workspaceId===w.id));assert.ok(s.audit.some(e=>e.action==='workspace.create'&&e.targetId===w.id));
});
test('Space legado aceita edição versionada, retry não duplica e snapshot persiste campos',()=>{
 const s=fixture(),a=s.users[0],w=s.workspaces[0],payload=edit(s),key=crypto.randomUUID();
 const r=act(s,a.id,'workspace.update',payload,key);assert.equal(w.version,2);assert.equal(w.name,fields.name);
 assert.deepEqual(act(s,a.id,'workspace.update',payload,key),r);assert.equal(w.version,2);
 assert.throws(()=>act(s,a.id,'workspace.update',payload),/versão|atualiz|alterad/i);
 const restored=hydrateState(serializeState(s));assert.equal(snapshot(restored,restored.users[0]).workspaces.find(x=>x.id===w.id)?.cover,'lavender');
 a.role='user';assert.throws(()=>act(s,a.id,'workspace.update',payload,key));
});
test('somente Admin cria/edita e retry de criação revalida o cargo',()=>{
 const s=fixture(),a=s.users[0],key=crypto.randomUUID();
 for(const p of s.users.filter(p=>p.role!=='admin')){assert.throws(()=>act(s,p.id,'workspace.create',fields));assert.throws(()=>act(s,p.id,'workspace.update',edit(s)));}
 act(s,a.id,'workspace.create',fields,key);a.role='coordinator';assert.throws(()=>act(s,a.id,'workspace.create',fields,key));
});
test('Space rejeita dados extras, membro externo, cor, ícone e fuso inválidos sem mutar',()=>{
 const s=fixture(),a=s.users[0];s.users.push({...s.users[2],id:'outside',orgId:'outro-studio'});
 for(const extra of [{color:'url(evil)'},{icon:'injetado'},{cover:'https://evil.invalid'},{timezone:'Não/existe'},{memberIds:['outside']},{memberIds:['ausente']},{visibleToEveryone:true}]){
  const before=structuredClone(s);assert.throws(()=>act(s,a.id,'workspace.create',{...fields,...extra}));assert.deepEqual(s,before);
 }
 const other={...s.workspaces[0],id:'foreign-space',orgId:'outro-studio'};s.workspaces.push(other);assert.throws(()=>act(s,a.id,'workspace.update',{...edit(s),id:other.id}));
});
test('retirar membro revoga a área e seus projetos, preservando outra área',()=>{
 const s=fixture(),a=s.users[0],p=s.users[2],w=s.workspaces[0],other=s.projects.find(pr=>pr.workspaceId!==w.id)!;
 p.projectIds.push(other.id);p.workspaceIds.push(other.workspaceId);
 act(s,a.id,'workspace.update',{...edit(s),memberIds:s.users.filter(x=>x.id!==p.id&&x.workspaceIds.includes(w.id)).map(x=>x.id)});
 assert.ok(!p.workspaceIds.includes(w.id));assert.ok(!p.projectIds.includes(s.projects[0].id));assert.ok(p.projectIds.includes(other.id));
 const view=snapshot(s,p);assert.ok(!view.workspaces.some(x=>x.id===w.id));assert.ok(!view.conversations.some(c=>c.workspaceId===w.id));
});
test('participação direta no Space sobrevive à edição de acessos por projeto',()=>{
 const s=fixture(),a=s.users[0],p=s.users[2];const w=act(s,a.id,'workspace.create',{...fields,memberIds:[p.id]});
 act(s,a.id,'member.access',{id:p.id,projectIds:[]});assert.ok(p.workspaceIds.includes(w.id));
 act(s,a.id,'member.update',{id:p.id,role:'user',status:'active',projectIds:[]});assert.ok(p.workspaceIds.includes(w.id));assert.deepEqual(p.projectIds,[]);
});
test('membro suspenso não ganha área nova; vínculo existente pode ser preservado',()=>{
 const s=fixture(),a=s.users[0],p=s.users[2];p.status='suspended';assert.throws(()=>act(s,a.id,'workspace.create',{...fields,memberIds:[p.id]}));
 act(s,a.id,'workspace.update',edit(s));assert.ok(p.workspaceIds.includes(s.workspaces[0].id));
});

test('edição antiga não revoga acesso de projeto concedido depois de abrir o formulário',()=>{
 const s=fixture(),a=s.users[0],p=s.users[3],w=s.workspaces[0];
 p.projectIds=[];p.workspaceIds=[];const old=edit(s);
 act(s,a.id,'member.access',{id:p.id,projectIds:[s.projects.find(pr=>pr.workspaceId===w.id)!.id]});
 const before=structuredClone(s);assert.throws(()=>act(s,a.id,'workspace.update',old),/acesso.*mudou/i);assert.deepEqual(s,before);
 assert.throws(()=>act(s,a.id,'workspace.update',{...old,expectedMemberIds:undefined}));
});
test('limite de cinquenta membros inclui o criador',()=>{
 const s=fixture(),a=s.users[0];const members=Array.from({length:50},(_,i)=>({...s.users[2],id:`extra-${i}`,workspaceIds:[],projectIds:[]}));s.users.push(...members);
 assert.throws(()=>act(s,a.id,'workspace.create',{...fields,memberIds:members.map(p=>p.id)}),/50 membros/);
});
