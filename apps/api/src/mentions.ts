import type { State, User, Conversation } from '../../../packages/contracts';
import { active, canManage, canSend } from './policy';
import { ensure } from './errors';
export function audience(s: State, c: Conversation): User[] {
    return s.users.filter(u => active(u, c.orgId) && canSend(s, u, c));
}
export function resolveMentions(s: State, sender: User, body: string, c: Conversation): string[] {
    const recipients = new Set<string>();
    const people = audience(s, c);
    const coord = sender.role === 'coordinator' && c.kind !== 'direct' && (c.kind === 'project' ? canManage(s, sender, c.projectId!) : sender.workspaceIds.includes(c.workspaceId!));
    for (const match of body.matchAll(/(?:^|\s)@([a-zA-Z0-9_]+)/g)) {
        const h = match[1].toLowerCase();
        if (['todos', 'usuarios', 'coordenadores', 'admins'].includes(h)) {
            ensure(sender.role === 'admin' || (coord && h !== 'admins'), 'Essa menção coletiva não está disponível para o seu cargo.');
            for (const p of people) {
                if (sender.role !== 'admin' && p.role === 'admin')
                    continue;
                if (h === 'todos' || (h === 'usuarios' && p.role === 'user') || (h === 'coordenadores' && p.role === 'coordinator') || (h === 'admins' && p.role === 'admin'))
                    recipients.add(p.id);
            }
        }
        else {
            const p = people.find(p => p.handle.toLowerCase() === h);
            if (p)
                recipients.add(p.id);
        }
    }
    return [...recipients];
}
