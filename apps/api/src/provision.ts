import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {State} from '../../../packages/contracts';
import {ensure} from './errors';
export {Store} from './store';
// Offline operator operation. Never exposed as an HTTP/renderer action.
export function provisionStudio(s:State,email:string,name:string){
 const input=z.object({email:z.string().trim().toLowerCase().email(),name:z.string().trim().min(2).max(80)}).parse({email,name});
 const account=s.accounts?.find(a=>a.email===input.email&&a.status==='active');
 ensure(account,'Conta ativa não encontrada. Cadastre a conta antes de preparar o Studio.',400);
 const orgId=randomUUID(),memberId=randomUUID(),workspaceId=randomUUID(),projectId=randomUUID();
 s.orgs.push({id:orgId,name:input.name,description:''});
 s.workspaces.push({id:workspaceId,orgId,name:'Geral',color:'#f39c35'});
 s.projects.push({id:projectId,orgId,workspaceId,name:'Primeiros passos',description:'Um espaço para começar.',color:'#f39c35',archived:false,version:1});
 s.users.push({...account,id:memberId,accountId:account.id,orgId,role:'admin',workspaceIds:[workspaceId],projectIds:[projectId]});
 s.conversations.push({id:randomUUID(),orgId,projectId,kind:'project',name:'Primeiros passos',memberIds:[],archived:false});
 s.audit.push({id:randomUUID(),orgId,actorId:memberId,action:'studio.create.operator',targetId:orgId,at:new Date().toISOString()});
 return {orgId,projectId};
}
