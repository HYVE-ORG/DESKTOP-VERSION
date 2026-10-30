import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedState } from '../apps/api/src/seed';
import { execute } from '../apps/api/src/actions';
import { snapshot } from '../apps/api/src/views';
const fixture = () => seedState('Admin', 'admin@test.local', 'hash', true);
const act = (s:any, uid:string, type:string, payload:any, requestId=crypto.randomUUID()):any => execute(s,uid,{type,payload,requestId});
function setup() {
    const s=fixture(), u=s.users[0], workspaceId=s.workspaces[0].id;
    const contact=act(s,u.id,'crm.contact.save',{workspaceId,name:'Cliente de teste',email:'contato@teste.local',phone:'',company:'Empresa',notes:'Briefing',kind:'client'});
    const opportunity=act(s,u.id,'crm.opportunity.save',{workspaceId,contactId:contact.id,title:'Website novo',stage:'qualified',valueCents:123456,description:'Nova experiência'});
    return {s,u,workspaceId,contact,opportunity};
}
test('CRM persiste fluxo, revisões e conversão única com referência do aceite',()=>{
    const {s,u,opportunity}=setup();
    const proposal=act(s,u.id,'crm.proposal.save',{opportunityId:opportunity.id,title:'Proposta do website',body:'Escopo e condições',totalCents:123456});
    act(s,u.id,'crm.proposal.save',{id:proposal.id,version:1,opportunityId:opportunity.id,title:'Proposta revisada',body:'Escopo atualizado',totalCents:130000});
    const requestId=crypto.randomUUID(),payload={id:proposal.id,version:2,acceptanceNote:'Aceite recebido na reunião com o cliente'};
    const result=act(s,u.id,'crm.proposal.accept',payload,requestId);
    assert.equal(s.projects.at(-1)?.id,result.projectId);
    assert.equal(s.projects.at(-1)?.name,'Website novo');
    assert.equal(s.conversations.at(-1)?.projectId,result.projectId);
    assert.deepEqual(act(s,u.id,'crm.proposal.accept',payload,requestId),result);
    assert.deepEqual(act(s,u.id,'crm.proposal.accept',payload),result);
    const crm=(snapshot(s,u) as any).crm;
    assert.equal(crm.proposals[0].revisions.length,1);
    assert.equal(crm.proposals[0].revisions[0].totalCents,123456);
    assert.equal(crm.opportunities[0].stage,'won');
    assert.equal(crm.proposals[0].status,'accepted');
    assert.ok(u.projectIds.includes(result.projectId));
    assert.throws(()=>act(s,u.id,'crm.proposal.save',{id:proposal.id,version:3,opportunityId:opportunity.id,title:'Alterar',body:'Não pode',totalCents:1}));
});
test('CRM nega Usuário, outro Studio, outra área e retry após revogação',()=>{
    const {s,u,workspaceId,contact}=setup(), coord=s.users[1], user=s.users[2];
    assert.equal((snapshot(s,user) as any).crm.contacts.length,0);
    const payload={workspaceId,name:'Outro contato',email:'outro@teste.local',phone:'',company:'',notes:'',kind:'lead'};
    assert.throws(()=>act(s,user.id,'crm.contact.save',payload));
    const key=crypto.randomUUID();act(s,coord.id,'crm.contact.save',payload,key);
    coord.workspaceIds=[];
    assert.throws(()=>act(s,coord.id,'crm.contact.save',payload,key));
    assert.equal((snapshot(s,coord) as any).crm.contacts.length,0);
    const foreign={...u,id:crypto.randomUUID(),orgId:'outro-studio'};s.users.push(foreign);
    assert.equal((snapshot(s,foreign) as any).crm.contacts.length,0);
    assert.throws(()=>act(s,foreign.id,'crm.opportunity.save',{workspaceId,contactId:contact.id,title:'Tentativa',stage:'new',valueCents:1,description:''}));
});
test('CRM valida duplicidade, valores exatos, estados e conflitos sem perder proposta',()=>{
    const {s,u,workspaceId,contact,opportunity}=setup();
    const duplicate={workspaceId,name:'Duplicado',email:'CONTATO@TESTE.LOCAL',phone:'',company:'',notes:'',kind:'client'};
    assert.throws(()=>act(s,u.id,'crm.contact.save',duplicate));
    assert.throws(()=>act(s,u.id,'crm.opportunity.save',{workspaceId,contactId:contact.id,title:'Inválido',stage:'won',valueCents:0.5,description:''}));
    const p=act(s,u.id,'crm.proposal.save',{opportunityId:opportunity.id,title:'Proposta',body:'Termos',totalCents:100});
    assert.throws(()=>act(s,u.id,'crm.proposal.accept',{id:p.id,version:9,acceptanceNote:'Aceite externo'}));
    assert.equal((snapshot(s,u) as any).crm.proposals[0].status,'draft');
    assert.equal(s.projects.length,3);
    const key=crypto.randomUUID(),payload={workspaceId,name:'Sem duplicação',email:'retry@teste.local',phone:'',company:'',notes:'',kind:'lead'};
    const first=act(s,u.id,'crm.contact.save',payload,key);
    assert.deepEqual(act(s,u.id,'crm.contact.save',payload,key),first);
    assert.equal((snapshot(s,u) as any).crm.contacts.length,2);
});
test('conversão não publica condições privadas no projeto e cliente fica fixo após proposta',()=>{
    const {s,u,workspaceId,opportunity}=setup();
    const secret='Condições privadas: desconto reservado para a diretoria.';
    const p=act(s,u.id,'crm.proposal.save',{opportunityId:opportunity.id,title:'Privada',body:secret,totalCents:100});
    const c=act(s,u.id,'crm.contact.save',{workspaceId,name:'Outro cliente',email:'b@teste.local',phone:'',company:'',notes:'',kind:'client'});
    const current=(snapshot(s,u) as any).crm.opportunities[0];
    assert.throws(()=>act(s,u.id,'crm.opportunity.save',{id:opportunity.id,version:current.version,workspaceId,contactId:c.id,title:current.title,description:'',stage:'proposal',valueCents:100}));
    const result=act(s,u.id,'crm.proposal.accept',{id:p.id,version:1,acceptanceNote:'Confirmação pelo cliente original'});
    const user=s.users[2];user.projectIds.push(result.projectId);
    const view=snapshot(s,user);
    assert.ok(!JSON.stringify(view).includes(secret));
    assert.ok(view.projects.some(p=>p.id===result.projectId));
});
test('condições comerciais não chegam ao snapshot de um Usuário do projeto convertido',()=>{
    const {s,u,opportunity}=setup();const secret='Desconto confidencial: 45%';
    const p=act(s,u.id,'crm.proposal.save',{opportunityId:opportunity.id,title:'Proposta',body:secret,totalCents:100});
    const result=act(s,u.id,'crm.proposal.accept',{id:p.id,version:1,acceptanceNote:'Aceite de teste'});
    s.users[2].projectIds.push(result.projectId);
    assert.ok(!JSON.stringify(snapshot(s,s.users[2])).includes(secret));
});
