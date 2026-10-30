import type { State, User, Note } from '../../../packages/contracts';
import { canConversation, canProject } from './policy';
import { id, now } from './seed';
export function note(s: State, actor: User, recipientId: string, type: Note['type'], title: string, resourceType: Note['resourceType'], resourceId: string, sourceId?: string) {
    if (recipientId === actor.id || (sourceId && s.notifications.some(n => n.recipientId === recipientId && n.type === type && n.sourceId === sourceId)))
        return;
    s.notifications.push({ id: id(), orgId: actor.orgId, recipientId, actorId: actor.id, type, title, resourceType, resourceId, sourceId, createdAt: now(), sequence: Math.max(0, ...s.notifications.map(n => n.sequence)) + 1 });
}
export function noteVisible(s: State, u: User, n: Note): boolean {
    if (n.orgId !== u.orgId || n.recipientId !== u.id || u.status !== 'active')
        return false;
    if (n.resourceType === 'conversation') {
        const c = s.conversations.find(c => c.id === n.resourceId);
        if (!c || !canConversation(s, u, c))
            return false;
        if (n.sourceId) {
            const m = s.messages.find(m => m.id === n.sourceId);
            if (!m || m.deletedAt || (n.type === 'mention' && !m.recipients.includes(u.id)))
                return false;
        }
        return true;
    }
    if (n.resourceType === 'task') {
        const t = s.tasks.find(t => t.id === n.resourceId), p = s.projects.find(p => p.id === t?.projectId);
        if (!t || !p || !canProject(s, u, p))
            return false;
        if (n.sourceId && n.type === 'mention') {
            const c = t.comments.find(c => c.id === n.sourceId);
            return !!c && !c.deleted && c.recipients.includes(u.id);
        }
        return true;
    }
    if (n.resourceType === 'event') {
        const e = s.calendar.find(e => e.id === n.resourceId), p = s.projects.find(p => p.id === e?.projectId);
        return !!p && canProject(s, u, p);
    }
    return s.help.some(h => h.id === n.resourceId && h.requesterId === u.id);
}
