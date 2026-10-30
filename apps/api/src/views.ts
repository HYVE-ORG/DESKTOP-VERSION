import type { State, User, Snapshot, Person } from '../../../packages/contracts';
import { active, canProject, canConversation, canFile } from './policy';
import { summarize } from './summary';
import { noteVisible } from './notifications';
import { commandCatalog } from './actions';
import { crmSnapshot } from './crm';
export function snapshot(s: State, u: User): Snapshot {
    const projects = s.projects.filter(p => canProject(s, u, p));
    const pids = new Set(projects.map(p => p.id));
    const wids = new Set(s.workspaces.filter(w => w.orgId === u.orgId && (u.role === 'admin' || u.workspaceIds.includes(w.id))).map(w => w.id));
    const publicUser = (p: User): Person => { const { passwordHash, email, ...person } = p; return { ...person, projectIds: p.projectIds.filter(id => pids.has(id)), workspaceIds: p.workspaceIds.filter(id => wids.has(id)), ...(u.role === 'admin' || p.id === u.id ? { email } : {}) }; };
    const conversations = s.conversations.filter(c => canConversation(s, u, c));
    const cids = new Set(conversations.map(c => c.id));
    const notifications = s.notifications.filter(n => noteVisible(s, u, n));
    return { crm: crmSnapshot(s,u), me: publicUser(u), org: s.orgs.find(o => o.id === u.orgId)!, people: s.users.filter(p => p.orgId === u.orgId && p.status !== 'removed').map(publicUser),
        projects, workspaces: s.workspaces.filter(w => w.orgId === u.orgId && (u.role === 'admin' || u.workspaceIds.includes(w.id))),
        tasks: s.tasks.filter(t => pids.has(t.projectId)), conversations, messages: s.messages.filter(m => cids.has(m.conversationId)),
        notifications, inboxCutoff: Math.max(0, ...notifications.map(n => n.sequence)),
        files: s.files.filter(f => canFile(s, u, f)), folders: s.folders.filter(f => pids.has(f.projectId)), calendar: s.calendar.filter(e => pids.has(e.projectId)),
        documents: s.documents.filter(d => pids.has(d.projectId)), help: s.help.filter(h => h.orgId === u.orgId && h.requesterId === u.id),
        audit: u.role === 'admin' ? s.audit.filter(a => a.orgId === u.orgId).slice(-100) : [],
        summaries: Object.fromEntries(s.users.filter(p => active(p, u.orgId)).map(p => [p.id, summarize(s, u, p)])), commands: commandCatalog(u), mode: 'local', mediaConfigured: false };
}
