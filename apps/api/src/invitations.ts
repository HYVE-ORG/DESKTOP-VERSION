import { randomBytes } from 'node:crypto';
import type { Account, AccountView, Role, State, User } from '../../../packages/contracts';
import { ensure } from './errors';
import { canManage } from './policy';
import { id, now } from './seed';
import { tokenHash } from './auth';

export function accountView(s: State, a: Account): AccountView {
    const {passwordHash, ...me} = a;
    return { me, studios: s.users.filter(u => (u.accountId || u.id) === a.id && u.status === 'active').map(u => ({id:u.orgId,name:s.orgs.find(o=>o.id===u.orgId)!.name,role:u.role})),
        invitations:s.invitations.filter(i=>i.email===a.email && !i.used && i.expiresAt>Date.now()).map(i=>({id:i.id,studio:s.orgs.find(o=>o.id===i.orgId)?.name || 'Studio',role:i.role,expiresAt:i.expiresAt,status:i.status || 'pending'})) };
}
export function inviteAccount(s:State,u:User,data:{email:string;name:string;role:Role;projectIds:string[]}, token=randomBytes(32).toString('hex')) {
    ensure(u.status==='active' && u.role!=='user');
    ensure(u.role==='admin' || data.role==='user');
    ensure(data.projectIds.length>0 && data.projectIds.every(pid=>canManage(s,u,pid)),'Projeto fora do escopo.');
    const email=data.email.trim().toLowerCase();
    const a=s.accounts?.find(a=>a.email===email);
    ensure(!s.users.some(p=>p.orgId===u.orgId && p.status!=='removed' && (a ? (p.accountId||p.id)===a.id : p.email===email)),'Esta conta já participa do Studio.',409);
    for(const i of s.invitations) if(i.orgId===u.orgId && i.email===email && !i.used) {i.used=true;i.status='revoked';}
    const invitation:State['invitations'][number]={id:id(),orgId:u.orgId,email,name:data.name,role:data.role,projectIds:[...new Set(data.projectIds)],hash:tokenHash(token),expiresAt:Date.now()+7*86400000,used:false,status:'pending',inviterId:u.id};
    s.invitations.push(invitation);
    return invitation;
}
export function respondInvitation(s:State,a:Account,invitationId:string,decision:'accept'|'decline') {
    const i=s.invitations.find(i=>i.id===invitationId && i.email===a.email);
    ensure(i,'Convite não encontrado.',404);
    if(i.used && i.status===(decision==='accept'?'accepted':'declined')) return {ok:true};
    ensure(!i.used && i.expiresAt>Date.now(),'Convite expirado ou indisponível.',409);
    if(decision==='decline') {i.used=true;i.status='declined';return {ok:true};}
    const sender=s.users.find(u=>u.id===i.inviterId);
    ensure(sender && sender.orgId===i.orgId && sender.status==='active' && sender.role!=='user' && (sender.role==='admin'||i.role==='user') && i.projectIds.every(pid=>canManage(s,sender,pid)),'O convite não possui mais autorização válida.',409);
    let member=s.users.find(u=>(u.accountId||u.id)===a.id && u.orgId===i.orgId);
    ensure(!member || member.status==='removed','A conta já possui uma participação neste Studio.',409);
    const workspaceIds=[...new Set(s.projects.filter(p=>i.projectIds.includes(p.id)).map(p=>p.workspaceId))];
    ensure(!s.users.some(u=>u.orgId===i.orgId && (u.accountId||u.id)!==a.id && u.handle.toLowerCase()===a.handle.toLowerCase()),'O @ precisa ser ajustado antes de entrar neste Studio.',409);
    const record:User={...a,id:member?.id || id(),accountId:a.id,orgId:i.orgId,role:i.role,status:'active',workspaceIds,projectIds:[...i.projectIds]};
    if(member) Object.assign(member,record); else s.users.push(record);
    i.used=true;i.status='accepted';i.acceptedUserId=record.id;
    s.audit.push({id:id(),orgId:i.orgId,actorId:record.id,action:'invitation.accept',targetId:i.id,at:now()});
    return {ok:true};
}
