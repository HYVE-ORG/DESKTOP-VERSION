import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,writeFile,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../apps/api/src/store';
import { seedState } from '../apps/api/src/seed';
import { execute } from '../apps/api/src/actions';
test('CRM é aditivo em base legada e conversão concorrente persiste uma única vez',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'forma-crm-'));
    try {
        const original=seedState('Admin','admin@test.local','hash',false);
        await writeFile(join(dir,'state.json'),JSON.stringify(original));
        const store=new Store(dir),uid=original.users[0].id,workspaceId=original.workspaces[0].id;
        const run=(type:string,payload:unknown)=>store.transact(s=>execute(s,uid,{type,payload,requestId:crypto.randomUUID()}) as any);
        const c=await run('crm.contact.save',{workspaceId,name:'Cliente',email:'cliente@teste.local',phone:'',company:'',notes:'',kind:'client'});
        const o=await run('crm.opportunity.save',{workspaceId,contactId:c.id,title:'Projeto CRM',stage:'new',description:'Teste',valueCents:100});
        const p=await run('crm.proposal.save',{opportunityId:o.id,title:'Proposta',body:'Escopo',totalCents:100});
        const results=await Promise.all([1,2].map(()=>run('crm.proposal.accept',{id:p.id,version:1,acceptanceNote:'Aceite recebido do cliente'})));
        assert.deepEqual(results[0],results[1]);
        const restored=await new Store(dir).read();
        assert.equal(restored.projects.length,original.projects.length+1);
        assert.equal(restored.crm?.proposals[0].status,'accepted');
        assert.equal(restored.crm?.contacts.length,1);
        assert.deepEqual(restored.tasks,original.tasks);
        const before=await readFile(join(dir,'state.json'),'utf8');
        await assert.rejects(run('crm.contact.save',{workspaceId,name:'Outro',email:'cliente@teste.local',phone:'',company:'',notes:'',kind:'client'}));
        assert.equal(await readFile(join(dir,'state.json'),'utf8'),before);
    } finally {await rm(dir,{recursive:true,force:true});}
});
test('coleção CRM corrompida não é sobrescrita durante uma transação',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'forma-crm-corrupt-'));
    try {
        const state={...seedState('Admin','admin@test.local','hash',false),crm:{contacts:{},opportunities:[],proposals:[]}};
        const original=JSON.stringify(state);await writeFile(join(dir,'state.json'),original);
        await assert.rejects(new Store(dir).transact(s=>{s.orgs[0].name='Não publicar';}),/inválido/);
        assert.equal(await readFile(join(dir,'state.json'),'utf8'),original);
    } finally {await rm(dir,{recursive:true,force:true});}
});
