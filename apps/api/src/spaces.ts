import {z} from 'zod';
import type {State,User,Workspace} from '../../../packages/contracts';
import {SPACE_ICONS,SPACE_COVERS} from '../../../packages/contracts/spaces';
import {ensure} from './errors';
import {id,now} from './seed';
const identity={name:z.string().trim().min(1).max(80),description:z.string().trim().max(500).optional(),icon:z.enum(SPACE_ICONS).optional(),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),cover:z.enum(SPACE_COVERS).optional(),timezone:z.string().min(1).max(100).optional(),memberIds:z.array(z.string().min(1).max(100)).max(50).optional()};
export const workspaceSchemas={
 'workspace.create':z.object(identity).strict(),
 'workspace.update':z.object({...identity,id:z.string().min(1).max(100),version:z.number().int().positive(),expectedMemberIds:z.array(z.string().min(1).max(100)).max(500).optional()}).strict().refine(d=>d.memberIds===undefined||d.expectedMemberIds!==undefined,{message:'Informe os membros originais para atualizar o acesso.'}),
};
/** Explicit area membership is independent of access to individual projects. */
export function workspaceMembershipIds(s:State,u:User){
 return [...new Set([...s.projects.filter(p=>p.orgId===u.orgId&&u.projectIds.includes(p.id)).map(p=>p.workspaceId),...s.workspaces.filter(w=>w.orgId===u.orgId&&w.memberIds?.includes(u.id)).map(w=>w.id)])];
}
export function executeWorkspace(s:State,u:User,type:keyof typeof workspaceSchemas,raw:unknown){
 ensure(u.role==='admin');
 const data=workspaceSchemas[type].parse(raw),creating=type==='workspace.create';
 const existing=!creating?s.workspaces.find(w=>w.id===('id' in data?data.id:'')&&w.orgId===u.orgId):undefined;
 if(!creating){ensure(existing,'Space não encontrado.',404);ensure((existing.version||1)===('version' in data?data.version:0),'Outra pessoa atualizou este Space. Recarregue antes de salvar.',409);}
 if(data.timezone){try{new Intl.DateTimeFormat('pt-BR',{timeZone:data.timezone});}catch{ensure(false,'Fuso horário inválido.',400);}}
 if(!creating&&'expectedMemberIds' in data&&Array.isArray(data.expectedMemberIds)){const current=s.users.filter(p=>p.orgId===u.orgId&&p.status!=='removed'&&p.workspaceIds.includes(existing!.id)).map(p=>p.id).sort();const expected=[...new Set(data.expectedMemberIds)].sort();ensure(JSON.stringify(current)===JSON.stringify(expected),'O acesso deste Space mudou. Recarregue antes de salvar.',409);}
 const chosen=data.memberIds!==undefined?[...new Set(data.memberIds)]:creating?[u.id]:undefined;
 const members=creating?[...new Set([u.id,...chosen!])]:chosen;
 if(members)ensure(members.length<=50,'Selecione até 50 membros por Space.',400);
 if(members)ensure(members.every(member=>s.users.some(p=>p.id===member&&p.orgId===u.orgId&&p.status!=='removed'&&(p.status==='active'||!creating&&p.workspaceIds.includes(existing!.id)))),'Membro fora do Studio, inativo ou não disponível.',400);
 const w:Workspace=existing||{id:id(),orgId:u.orgId,name:data.name,color:'#85a9cb',version:0,createdAt:now(),createdBy:u.id};
 const oldName=w.name;
 Object.assign(w,{name:data.name,description:data.description??w.description??'',icon:data.icon??w.icon??'layers',color:data.color??w.color,cover:data.cover??w.cover??'lavender',timezone:data.timezone??w.timezone??u.timezone,version:(w.version||1)+(creating?0:1)});
 if(creating){w.version=1;s.workspaces.push(w);s.conversations.push({id:id(),orgId:u.orgId,kind:'workspace',workspaceId:w.id,name:`Geral · ${w.name}`,memberIds:[],archived:false});}
 if(members){
  w.memberIds=members;
  const projectIds=new Set(s.projects.filter(p=>p.orgId===u.orgId&&p.workspaceId===w.id).map(p=>p.id));
  for(const person of s.users.filter(p=>p.orgId===u.orgId)){
   if(members.includes(person.id)){if(!person.workspaceIds.includes(w.id))person.workspaceIds.push(w.id);}
   else{person.workspaceIds=person.workspaceIds.filter(id=>id!==w.id);person.projectIds=person.projectIds.filter(id=>!projectIds.has(id));}
  }
 }
 for(const c of s.conversations.filter(c=>c.orgId===u.orgId&&c.kind==='workspace'&&c.workspaceId===w.id&&c.name===`Geral · ${oldName}`))c.name=`Geral · ${w.name}`;
 s.audit.push({id:id(),orgId:u.orgId,actorId:u.id,action:type,targetId:w.id,at:now()});
 return {id:w.id,version:w.version!};
}
