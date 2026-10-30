import { z } from 'zod';
import type { State, User, CrmData, Contact, Opportunity, Proposal, ProposalRevision } from '../../../packages/contracts';
import { ensure } from './errors';
import { id, now } from './seed';

const text=(max:number)=>z.string().trim().min(1).max(max);
const note=(max:number)=>z.string().trim().max(max);
const edit={id:text(100).optional(),version:z.number().int().positive().optional()};
// BRL only in this increment: integer centavos, up to R$ 10 million per record.
const money=z.number().int().min(0).max(1_000_000_000);
export const crmSchemas={
    'crm.contact.save':z.object({...edit,workspaceId:text(100),name:text(120),email:z.union([z.literal(''),z.string().trim().toLowerCase().email().max(200)]),phone:note(40),company:note(120),notes:note(3000),kind:z.enum(['lead','client','vendor'])}).strict(),
    'crm.opportunity.save':z.object({...edit,workspaceId:text(100),contactId:text(100),title:text(100),description:note(3000),stage:z.enum(['new','qualified','proposal','lost']),valueCents:money}).strict(),
    'crm.proposal.save':z.object({...edit,opportunityId:text(100),title:text(120),body:text(10000),totalCents:money}).strict(),
    'crm.proposal.accept':z.object({id:text(100),version:z.number().int().positive(),acceptanceNote:text(1000).min(5)}).strict(),
};
export type CrmAction=keyof typeof crmSchemas;
const blank=():CrmData=>({contacts:[],opportunities:[],proposals:[]});
export function canCrm(s:State,u:User,workspaceId:string) {
    return u.status==='active' && u.role!=='user' && s.workspaces.some(w=>w.id===workspaceId && w.orgId===u.orgId) && (u.role==='admin'||u.workspaceIds.includes(workspaceId));
}
export function crmSnapshot(s:State,u:User):CrmData {
    const crm=s.crm||blank();
    const contacts=crm.contacts.filter(c=>c.orgId===u.orgId&&canCrm(s,u,c.workspaceId));
    const opportunities=crm.opportunities.filter(o=>o.orgId===u.orgId&&canCrm(s,u,o.workspaceId));
    const ids=new Set(opportunities.map(o=>o.id));
    return {contacts,opportunities,proposals:crm.proposals.filter(p=>p.orgId===u.orgId&&ids.has(p.opportunityId))};
}
function opportunity(s:State,u:User,oid:string) {
    const o=s.crm?.opportunities.find(o=>o.id===oid&&o.orgId===u.orgId);
    ensure(o&&canCrm(s,u,o.workspaceId),'Oportunidade não disponível.',404);return o;
}
function proposal(s:State,u:User,pid:string) {
    const p=s.crm?.proposals.find(p=>p.id===pid&&p.orgId===u.orgId);
    ensure(p,'Proposta não disponível.',404);return {p,o:opportunity(s,u,p.opportunityId)};
}
const conflict=(actual:number,expected?:number)=>ensure(actual===expected,'Este registro foi atualizado. Feche e abra novamente antes de salvar.',409);
function scope(s:State,u:User,wid:string) {ensure(canCrm(s,u,wid),'Área não disponível para gestão comercial.',403);}
export function authorizeCrmRetry(s:State,u:User,type:CrmAction,raw:unknown) {
    const d=crmSchemas[type].parse(raw) as any;
    if(type.startsWith('crm.proposal.')) {
        if(d.id)proposal(s,u,d.id);
        else opportunity(s,u,d.opportunityId);
    } else {
        scope(s,u,d.workspaceId);
        if(d.id) {
            const list=type==='crm.contact.save'?s.crm?.contacts:s.crm?.opportunities;
            const record=list?.find(r=>r.id===d.id&&r.orgId===u.orgId);
            ensure(record&&canCrm(s,u,record.workspaceId));
        }
    }
}
export function executeCrm(s:State,u:User,type:CrmAction,raw:unknown):unknown {
    const d=crmSchemas[type].parse(raw) as any;
    const crm=s.crm||blank();
    const at=now();
    let targetId:string;
    if(type==='crm.contact.save') {
        scope(s,u,d.workspaceId);
        const existing=d.id?crm.contacts.find(c=>c.id===d.id&&c.orgId===u.orgId):undefined;
        if(d.id) {ensure(existing&&canCrm(s,u,existing.workspaceId),'Contato não disponível.',404);conflict(existing.version,d.version);ensure(existing.workspaceId===d.workspaceId,'Não é possível mover o contato de área.',400);}
        ensure(!d.email||!crm.contacts.some(c=>c.orgId===u.orgId&&c.email===d.email&&c.id!==d.id),'Este e-mail já existe no CRM deste Studio. Peça ao Admin para revisar o cadastro.',409);
        const {id:ignored,version,...fields}=d;
        const c:Contact=existing||{...fields,id:id(),orgId:u.orgId,version:0,createdAt:at,updatedAt:at};
        Object.assign(c,fields,{version:c.version+1,updatedAt:at});
        if(!existing)crm.contacts.push(c);targetId=c.id;
    } else if(type==='crm.opportunity.save') {
        scope(s,u,d.workspaceId);
        const contact=crm.contacts.find(c=>c.id===d.contactId&&c.orgId===u.orgId&&c.workspaceId===d.workspaceId);
        ensure(contact,'Selecione um contato da mesma área.',400);
        const existing=d.id?opportunity(s,u,d.id):undefined;
        if(existing) {conflict(existing.version,d.version);ensure(!existing.projectId,'Oportunidade já convertida em projeto.',409);ensure(existing.workspaceId===d.workspaceId,'Não é possível mover a oportunidade de área.',400);}
        if(existing&&existing.contactId!==d.contactId)ensure(!crm.proposals.some(p=>p.opportunityId===existing.id),'O contato não pode ser alterado depois de criar uma proposta.',409);
        const {id:ignored,version,...fields}=d;
        const o:Opportunity=existing||{...fields,id:id(),orgId:u.orgId,currency:'BRL',version:0,createdAt:at,updatedAt:at,history:[]};
        if(!existing||o.stage!==d.stage)o.history.push({stage:d.stage,by:u.id,at});
        Object.assign(o,fields,{version:o.version+1,updatedAt:at});
        if(!existing)crm.opportunities.push(o);targetId=o.id;
    } else if(type==='crm.proposal.save') {
        const o=opportunity(s,u,d.opportunityId);
        ensure(!o.projectId&&o.stage!=='lost','Reabra a oportunidade antes de criar ou alterar uma proposta.',409);
        const existing=d.id?proposal(s,u,d.id).p:undefined;
        if(existing) {ensure(existing.opportunityId===o.id,'Origem da proposta não pode ser alterada.',400);conflict(existing.version,d.version);ensure(existing.status==='draft','Proposta aceita não pode ser alterada.',409);}
        const p:Proposal=existing||{id:id(),orgId:u.orgId,opportunityId:o.id,currency:'BRL',title:'',body:'',totalCents:0,version:0,by:u.id,at,status:'draft',revisions:[]};
        if(existing) {const {title,body,totalCents,version,by,at}=existing;p.revisions.push({title,body,totalCents,version,by,at} satisfies ProposalRevision);}
        Object.assign(p,{title:d.title,body:d.body,totalCents:d.totalCents,version:p.version+1,by:u.id,at});
        if(!existing)crm.proposals.push(p);
        if(o.stage!=='proposal') {o.stage='proposal';o.version++;o.updatedAt=at;o.history.push({stage:'proposal',by:u.id,at});}
        targetId=p.id;
    } else {
        const {p,o}=proposal(s,u,d.id);
        if(p.projectId) return {id:p.id,projectId:p.projectId};
        conflict(p.version,d.version);
        ensure(p.status==='draft'&&!o.projectId&&o.stage!=='lost','Oportunidade indisponível para conversão.',409);
        const projectId=id();
        s.projects.push({id:projectId,orgId:u.orgId,workspaceId:o.workspaceId,name:o.title,description:'Projeto criado a partir de uma proposta comercial aceita. Defina o briefing de execução com a equipe.',color:'#a3b1d4',version:1,archived:false});
        s.conversations.push({id:id(),orgId:u.orgId,name:o.title,projectId,kind:'project',memberIds:[],archived:false});
        if(!u.workspaceIds.includes(o.workspaceId))u.workspaceIds.push(o.workspaceId);
        u.projectIds.push(projectId);
        Object.assign(p,{status:'accepted',projectId,acceptedBy:u.id,acceptedAt:at,acceptanceNote:d.acceptanceNote,version:p.version+1});
        Object.assign(o,{stage:'won',projectId,version:o.version+1,updatedAt:at});
        o.history.push({stage:'won',by:u.id,at});
        s.crm=crm;
        s.audit.push({id:id(),orgId:u.orgId,actorId:u.id,action:type,targetId:p.id,at});
        return {id:p.id,projectId};
    }
    s.crm=crm;
    s.audit.push({id:id(),orgId:u.orgId,actorId:u.id,action:type,targetId,at});
    return {id:targetId};
}
