import type { State, User, Project, Conversation, Task, FileItem } from '../../../packages/contracts';
export const active = (u: User, orgId: string) => u.status === 'active' && u.orgId === orgId;
export function canProject(_s: State, u: User, p: Project): boolean {
    return active(u, p.orgId) && (u.role === 'admin' || (u.workspaceIds.includes(p.workspaceId) && u.projectIds.includes(p.id)));
}
export function canManage(s: State, u: User, projectId: string): boolean {
    const p = s.projects.find(p => p.id === projectId);
    return !!p && !p.archived && canProject(s, u, p) && u.role !== 'user';
}
export function canConversation(s: State, u: User, c: Conversation): boolean {
    if (!active(u, c.orgId))
        return false;
    if (u.role === 'admin')
        return true;
    if (c.kind === 'direct')
        return c.memberIds.includes(u.id);
    if (c.kind === 'workspace')
        return !!c.workspaceId && u.workspaceIds.includes(c.workspaceId);
    const p = s.projects.find(p => p.id === c.projectId);
    return !!p && canProject(s, u, p);
}
export function canSend(s: State, u: User, c: Conversation): boolean {
    if (c.archived || !canConversation(s, u, c))
        return false;
    if (c.kind === 'direct')
        return c.memberIds.includes(u.id);
    if (c.kind === 'workspace')
        return u.workspaceIds.includes(c.workspaceId!);
    const p = s.projects.find(p => p.id === c.projectId);
    return !!p && !p.archived && u.projectIds.includes(p.id) && u.workspaceIds.includes(p.workspaceId);
}
export function canMove(s: State, u: User, t: Task): boolean {
    const p = s.projects.find(p => p.id === t.projectId);
    return !!p && !p.archived && canProject(s, u, p) && (u.role !== 'user' || t.assigneeIds.includes(u.id));
}
export function canModerate(s: State, u: User, c: Conversation): boolean {
    if (!canConversation(s, u, c))
        return false;
    if (u.role === 'admin')
        return true;
    return u.role === 'coordinator' && c.kind !== 'direct' &&
        (c.kind === 'workspace' ? u.workspaceIds.includes(c.workspaceId!) : canManage(s, u, c.projectId!));
}
export function canFile(s: State, u: User, f: FileItem): boolean {
    if (!active(u, f.orgId))
        return false;
    if(f.scope==='studio')return f.scopeId===u.orgId && (u.role==='admin'||s.orgs.find(o=>o.id===u.orgId)?.iconId===f.id);
    if (f.scope === 'profile')
        return s.users.some(p => p.id === f.scopeId && active(p, u.orgId) && (p.id === u.id || p.avatarId === f.id || p.coverId === f.id));
    if (f.scope === 'project') {
        const p = s.projects.find(p => p.id === f.scopeId);
        return !!p && canProject(s, u, p);
    }
    const c = s.conversations.find(c => c.id === f.scopeId);
    return !!c && canConversation(s, u, c);
}
