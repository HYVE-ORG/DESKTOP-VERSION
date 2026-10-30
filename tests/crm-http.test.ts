import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../apps/api/src/app';
import { seedState } from '../apps/api/src/seed';
import { passwordHash } from '../apps/api/src/auth';
test('CRM por HTTP autentica, filtra snapshot, nega mass assignment e converte com persistência',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'forma-crm-http-'));let server:any;
    try {
        server=await createApp(dir,0);
        const hash=await passwordHash('Senha-CRM-teste-2026');
        await server.store.transact((s:any)=>Object.assign(s,seedState('Admin','admin@test.local',hash,true)));
        const request=(path:string,body?:unknown,cookie='')=>fetch(`http://127.0.0.1:${server.port}/api${path}`,{method:body===undefined?'GET':'POST',headers:{origin:'http://localhost:5173','Content-Type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});
        const login=async(email:string)=>(await request('/login',{email,password:'Senha-CRM-teste-2026'})).headers.get('set-cookie')!.split(';')[0];
        const admin=await login('admin@test.local'),user=await login('lucas@forma.local');
        const state=await (await request('/state',undefined,admin)).json() as any;
        const payload={workspaceId:state.workspaces[0].id,name:'Contato HTTP',email:'http@teste.local',phone:'',company:'Empresa',notes:'Informação restrita',kind:'client'};
        const mutate=(type:string,payload:unknown,cookie=admin)=>request('/actions',{type,payload,requestId:crypto.randomUUID()},cookie);
        assert.equal((await mutate('crm.contact.save',payload,'')).status,401);
        assert.equal((await mutate('crm.contact.save',payload,user)).status,403);
        assert.equal((await mutate('crm.contact.save',{...payload,orgId:'outro'})).status,400);
        const contact=await (await mutate('crm.contact.save',payload)).json() as any;
        assert.equal((await (await request('/state',undefined,user)).json() as any).crm.contacts.length,0);
        const opp=await (await mutate('crm.opportunity.save',{workspaceId:payload.workspaceId,contactId:contact.id,title:'Fluxo HTTP',description:'Teste',stage:'qualified',valueCents:10000})).json() as any;
        const proposal=await (await mutate('crm.proposal.save',{opportunityId:opp.id,title:'Proposta HTTP',body:'Escopo HTTP',totalCents:10000})).json() as any;
        const response=await mutate('crm.proposal.accept',{id:proposal.id,version:1,acceptanceNote:'Aceite registrado no teste HTTP'});
        assert.equal(response.status,201);
        const converted=await response.json() as any;
        const persisted=await server.store.read();
        assert.ok(persisted.projects.some((p:any)=>p.id===converted.projectId));
        assert.equal(persisted.crm.proposals[0].status,'accepted');
    } finally {if(server)await server.close();await rm(dir,{recursive:true,force:true});}
});
