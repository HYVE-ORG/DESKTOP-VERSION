import { z } from 'zod';
import {workspaceSchemas,executeWorkspace,workspaceMembershipIds} from './spaces';
import { createHash } from 'node:crypto';
import type { State, User, Task, Conversation, Role, Comment } from '../../../packages/contracts';
import { active, canProject, canManage, canMove, canConversation, canSend, canModerate } from './policy';
import { ensure, DomainError } from './errors';
import { id, now } from './seed';
import { resolveMentions } from './mentions';
import { note, noteVisible } from './notifications';
import { crmSchemas, executeCrm, authorizeCrmRetry, type CrmAction } from './crm';
const text = (max = 200) => z.string().trim().min(1).max(max);
const optionalText = (max = 1000) => z.string().trim().max(max);
const ids = z.array(z.string().max(100)).max(50);
const role = z.enum(['admin', 'coordinator', 'user']);
const status = z.enum(['todo', 'in_progress', 'in_review', 'done']);
const version = z.number().int().positive();
const byId = { id: text(100) };
const fields = { title: text(), description: optionalText(10000), priority: z.enum(['low', 'medium', 'high', 'urgent']), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), labels: z.array(text(32)).max(6), assigneeIds: ids };
const schemas = {
    ...crmSchemas,
    'task.create': z.object({ projectId: text(100), ...fields, initialStatus: status.optional() }).strict(),
    'task.update': z.object({ ...byId, ...fields, version }).strict(),
    'task.move': z.object({ ...byId, status, version, confirmPending: z.boolean().optional() }).strict(),
    'task.archive': z.object({ ...byId, version }).strict(),
    'task.attach': z.object({ taskId: text(100), fileId: text(100) }).strict(),
    'checklist.add': z.object({ taskId: text(100), text: text(200), version }).strict(),
    'checklist.toggle': z.object({ taskId: text(100), itemId: text(100), done: z.boolean(), version }).strict(),
    'comment.add': z.object({ taskId: text(100), body: text(4000) }).strict(),
    'comment.edit': z.object({ taskId: text(100), ...byId, body: text(4000) }).strict(),
    'comment.delete': z.object({ taskId: text(100), ...byId }).strict(),
    'message.send': z.object({ conversationId: text(100), body: optionalText(10000), attachmentIds: ids }).strict(),
    'message.edit': z.object({ ...byId, body: text(10000), version }).strict(),
    'message.delete': z.object({ ...byId, version }).strict(),
    'conversation.create': z.object({ name: text(100), projectId: z.string().optional(), memberIds: ids.optional() }).strict(),
    'conversation.update': z.object({ ...byId, name: text(100), archived: z.boolean() }).strict(),
    'profile.update': z.object({ name: text(80), handle: z.string().regex(/^[a-zA-Z0-9_]{3,30}$/), title: optionalText(100), bio: optionalText(600), location: optionalText(120), timezone: text(100), avatarId: z.string().optional(), coverId: z.string().optional() }).strict(),
    'member.update': z.object({ ...byId, role, status: z.enum(['active', 'suspended', 'removed']), name: text(80).optional(), projectIds: ids.optional() }).strict(),
    'org.update': z.object({ name: text(80), description: optionalText(500),version,iconId:z.string().optional(),bannerColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).strict(),
    ...workspaceSchemas,
    'project.create': z.object({ workspaceId: text(100), name: text(100), description: optionalText(500) }).strict(),
    'project.update': z.object({ ...byId, name: text(100), description: optionalText(500), archived: z.boolean(), version }).strict(),
    'member.access': z.object({ ...byId, projectIds: ids }).strict(),
    'folder.create': z.object({ projectId: text(100), name: text(80) }).strict(),
    'folder.update': z.object({ ...byId, name: text(80), archived: z.boolean() }).strict(),
    'file.folder': z.object({ ...byId, folderId: z.string().optional() }).strict(),
    'doc.save': z.object({ id: z.string().optional(), projectId: text(100), title: text(200), body: optionalText(30000), version: z.number().int().nonnegative() }).strict(),
    'event.save': z.object({ id: z.string().optional(), projectId: text(100), title: text(200), start: z.string().datetime(), end: z.string().datetime(), attendeeIds: ids, meeting: z.boolean(), version: z.number().int().nonnegative().optional() }).strict(),
    'meeting.instant': z.object({projectId:text(100),title:text(200),attendeeIds:ids}).strict(),
    'event.delete': z.object({ ...byId, version }).strict(),
    'event.respond': z.object({ ...byId, response: z.enum(['accepted', 'declined']) }).strict(),
    'help.create': z.object({ title: text(200), body: text(5000) }).strict(),
    'help.resolve': z.object(byId).strict(),
    'inbox.read': z.object({ ...byId, read: z.boolean() }).strict(),
    'inbox.all': z.object({ cutoff: z.number().int().nonnegative() }).strict(),
    'command.execute': z.object({ conversationId: text(100), text: text(2000) }).strict(),
};
export const commandCatalog = (u: User) => [
    { id: 'meet', label: '/meet', description: 'Ver reuniões · /meet criar para agendar com permissão', roles: ['admin', 'coordinator', 'user'] },
    { id: 'ajuda', label: '/ajuda', description: 'Ver comandos disponíveis', roles: ['admin', 'coordinator', 'user'] },
    { id: 'perfil', label: '/perfil', description: 'Abrir seu perfil', roles: ['admin', 'coordinator', 'user'] },
    { id: 'minhas-tarefas', label: '/minhas-tarefas', description: 'Ver suas próximas entregas', roles: ['admin', 'coordinator', 'user'] },
    { id: 'andamento', label: '/andamento ID', description: 'Iniciar uma tarefa atribuída', roles: ['admin', 'coordinator', 'user'] },
    { id: 'concluir', label: '/concluir ID', description: 'Concluir uma tarefa atribuída', roles: ['admin', 'coordinator', 'user'] },
    { id: 'help', label: '/help assunto', description: 'Pedir ajuda em uma solicitação privada', roles: ['admin', 'coordinator', 'user'] },
    { id: 'apagar-mensagem', label: '/apagar-mensagem ID', description: 'Confirmar exclusão de mensagem própria ou moderar no escopo', roles: ['admin', 'coordinator', 'user'] },
    ...['tarefa', 'atribuir', 'chat', 'pasta', 'reuniao'].map(id => ({ id, label: `/${id}`, description: ({ tarefa: 'Criar uma nova tarefa', atribuir: 'Delegar: /atribuir ID @pessoa', chat: 'Criar um canal ou conversa', pasta: 'Organizar os materiais', reuniao: 'Agendar uma reunião' } as Record<string, string>)[id], roles: ['admin', 'coordinator'] })),
    ...['cargo', 'usuario', 'servidor'].map(id => ({ id, label: `/${id}`, description: id === 'cargo' ? 'Alterar: /cargo @pessoa user|coordinator|admin' : 'Abrir administração do servidor', roles: ['admin'] })),
].filter(c => c.roles.includes(u.role)).map(({ roles, ...c }) => c);
const audit = (s: State, u: User, action: string, targetId: string) => s.audit.push({ id: id(), orgId: u.orgId, actorId: u.id, action, targetId, at: now() });
function project(s: State, u: User, projectId: string, manage = false) {
    const p = s.projects.find(p => p.id === projectId);
    ensure(p && canProject(s, u, p), 'Recurso não encontrado.', 404);
    if (manage)
        ensure(canManage(s, u, p.id));
    return p;
}
function task(s: State, u: User, taskId: string) { const t = s.tasks.find(t => t.id === taskId); ensure(t, 'Tarefa não encontrada.', 404); project(s, u, t.projectId); return t; }
function conversation(s: State, u: User, conversationId: string) { const c = s.conversations.find(c => c.id === conversationId); ensure(c && canConversation(s, u, c), 'Conversa não encontrada.', 404); return c; }
const conflict = (a: number, b: number) => ensure(a === b, 'Outra pessoa atualizou este item. Recarregue antes de salvar.', 409);
function assignees(s: State, u: User, projectId: string, userIds: string[]) {
    ensure(new Set(userIds).size === userIds.length, 'Responsáveis duplicados.', 400);
    ensure(userIds.every(id => s.users.some(p => p.id === id && active(p, u.orgId) && p.projectIds.includes(projectId))), 'Responsável sem acesso ativo ao projeto.', 400);
}
function taskEvent(t: Task, u: User, text: string) { t.version++; t.updatedAt = now(); t.events.push({ id: id(), actorId: u.id, text, at: t.updatedAt }); }
function mentionNotes(s: State, u: User, recipients: string[], ever: string[], title: string, type: 'task' | 'conversation', resourceId: string, sourceId: string) {
    for (const to of recipients)
        if (!ever.includes(to)) {
            note(s, u, to, 'mention', title, type, resourceId, sourceId);
            ever.push(to);
        }
}
export function execute(s: State, userId: string, input: unknown): unknown {
    const envelope = z.object({ type: z.enum(Object.keys(schemas) as [
            keyof typeof schemas,
            ...(keyof typeof schemas)[]
        ]), payload: z.unknown(), requestId: z.string().uuid() }).strict().parse(input);
    const u = s.users.find(u => u.id === userId && u.status === 'active');
    ensure(u, 'Sessão inválida.', 401);
    const hash = createHash('sha256').update(JSON.stringify([envelope.type, envelope.payload])).digest('hex');
    const cached = s.requests.find(r => r.userId === u.id && r.key === envelope.requestId && r.at > Date.now() - 86400000);
    // Validate the current operation before returning a cached response; a prior role is not authority.
    const run = () => dispatch(s, u, envelope.type, envelope.payload);
    if (cached) {
        ensure(cached.hash === hash, 'A chave já foi usada para outra alteração.', 409);
        // Run authorization/validation against a clone, without replaying effects or rejecting the old expectedVersion.
        authorizeRetry(s, u, envelope.type, envelope.payload);
        return cached.result;
    }
    const result = run();
    s.requests = s.requests.filter(r => r.at > Date.now() - 86400000).slice(-999);
    s.requests.push({ userId: u.id, key: envelope.requestId, hash, result, at: Date.now() });
    return result;
}
function authorizeRetry(s: State, u: User, type: string, payload: unknown) {
    if(type in crmSchemas) {authorizeCrmRetry(s,u,type as CrmAction,payload);return;}
    const p = payload as Record<string, any>;
    if (type === 'task.move' || type === 'task.archive' || type === 'task.attach' || type.startsWith('checklist.') || type.startsWith('comment.')) {
        const t = task(s, u, p.taskId || p.id);
        const pr = project(s, u, t.projectId);
        ensure(!pr.archived && (!t.archived || type === 'task.archive'));
        if (type === 'task.archive' || type === 'checklist.add')
            project(s, u, t.projectId, true);
        if (type === 'task.move' || type === 'checklist.toggle')
            ensure(canMove(s, u, t));
        if (type === 'comment.edit' || type === 'comment.delete') {
            const c = t.comments.find(c => c.id === p.id);
            ensure(c && (c.authorId === u.id || type === 'comment.delete' && canManage(s, u, t.projectId)));
        }
        return;
    }
    if (type === 'message.edit' || type === 'message.delete') {
        const m = s.messages.find(m => m.id === p.id);
        ensure(m);
        const c = conversation(s, u, m.conversationId);
        ensure(type === 'message.edit' ? m.authorId === u.id && canSend(s, u, c) : (m.authorId === u.id && canSend(s, u, c)) || canModerate(s, u, c));
        return;
    }
    const draft = structuredClone(s), actor = draft.users.find(a => a.id === u.id)!;
    const data = { ...p };
    if (type === 'task.update')
        data.version = draft.tasks.find(t => t.id === p.id)?.version;
    if (type === 'doc.save' && p.id)
        data.version = draft.documents.find(d => d.id === p.id)?.version;
    if (type === 'event.save' && p.id)
        data.version = draft.calendar.find(e => e.id === p.id)?.version;
    if (type === 'event.delete') {
        const event = s.calendar.find(e => e.id === p.id);
        if (!event) {
            ensure(u.role !== 'user');
            return;
        }
        data.version = event.version;
    }
    if(type==='workspace.update'){data.version=draft.workspaces.find(w=>w.id===p.id&&w.orgId===u.orgId)?.version||1;if(data.expectedMemberIds)data.expectedMemberIds=draft.users.filter(x=>x.orgId===u.orgId&&x.status!=='removed'&&x.workspaceIds.includes(p.id)).map(x=>x.id);}
    if (type === 'project.update') {
        const pr = project(s, u, p.id);
        ensure(u.role !== 'user');
        data.version = pr.version;
        draft.projects.find(d => d.id === pr.id)!.archived = false;
    }
    if (type === 'command.execute') {
        const c = conversation(s, u, p.conversationId);
        ensure(canSend(s, u, c));
        const cmd = String(p.text).trim().replace(/^\//, '').split(/\s+/)[0];
        ensure(commandCatalog(u).some(c => c.id === cmd));
        if (cmd === 'concluir' || cmd === 'andamento') {
            const tid = String(p.text).trim().split(/\s+/)[1];
            ensure(canMove(s, u, task(s, u, tid)));
            return;
        }
    }
    // Normal validation against an isolated clone; only the stored response is returned.
    dispatch(draft, actor, type as keyof typeof schemas, data);
}
function dispatch(s: State, u: User, type: keyof typeof schemas, raw: unknown): unknown {
    if(type in crmSchemas)return executeCrm(s,u,type as CrmAction,raw);
    // Each branch parses an exact schema so privileged/unknown fields cannot be mass-assigned.
    const data = schemas[type].parse(raw) as any;
    switch (type) {
        case 'task.create': {
            project(s, u, data.projectId, true);
            assignees(s, u, data.projectId, data.assigneeIds);
            ensure(!data.initialStatus || data.initialStatus === 'todo' || data.assigneeIds.length, 'Atribua um responsável antes de iniciar.', 400);
            const t: Task = { ...data, id: id(), orgId: u.orgId, status: 'todo', version: 1, archived: false, checklist: [], comments: [], events: [], createdAt: now(), updatedAt: now() };
            s.tasks.push(t);
            for (const to of t.assigneeIds)
                note(s, u, to, 'assignment', t.title, 'task', t.id);
            if (data.initialStatus && data.initialStatus !== 'todo')
                dispatch(s, u, 'task.move', { id: t.id, status: data.initialStatus, version: t.version });
            return { id: t.id };
        }
        case 'task.update': {
            const t = task(s, u, data.id);
            project(s, u, t.projectId, true);
            ensure(!t.archived);
            conflict(t.version, data.version);
            assignees(s, u, t.projectId, data.assigneeIds);
            const old = new Set(t.assigneeIds);
            const { id: _, version: __, ...patch } = data;
            Object.assign(t, patch);
            taskEvent(t, u, 'atualizou os detalhes');
            for (const to of t.assigneeIds)
                if (!old.has(to))
                    note(s, u, to, 'assignment', t.title, 'task', t.id);
            return { id: t.id };
        }
        case 'task.move': {
            const t = task(s, u, data.id);
            ensure(canMove(s, u, t) && !t.archived);
            conflict(t.version, data.version);
            ensure(u.role !== 'user' || (t.status !== 'done' && ['in_progress', 'in_review', 'done'].includes(data.status)), 'Peça à coordenação para reabrir a tarefa.');
            ensure(data.status === 'todo' || t.assigneeIds.length, 'Atribua ao menos um responsável antes de iniciar.', 400);
            ensure(data.status !== 'done' || !t.checklist.some(c => !c.done) || data.confirmPending === true, 'Confirme os itens pendentes antes de concluir.', 409);
            const before = t.status;
            t.status = data.status;
            if (before !== data.status) {
                taskEvent(t, u, `moveu de ${before} para ${data.status}`);
                if (data.status === 'done' && !t.firstCompletion)
                    t.firstCompletion = { at: now(), assigneeIds: [...t.assigneeIds] };
            }
            return { id: t.id };
        }
        case 'task.archive': {
            const t = task(s, u, data.id);
            project(s, u, t.projectId, true);
            conflict(t.version, data.version);
            t.archived = true;
            taskEvent(t, u, 'arquivou a tarefa');
            return { id: t.id };
        }
        case 'task.attach': {
            const t = task(s, u, data.taskId);
            ensure(!t.archived && !s.projects.find(p => p.id === t.projectId)?.archived);
            ensure(s.files.some(f => f.id === data.fileId && f.orgId === u.orgId && f.scope === 'project' && f.scopeId === t.projectId), 'Anexo de outro projeto não permitido.');
            t.attachmentIds = [...new Set([...(t.attachmentIds || []), data.fileId])];
            return { id: t.id };
        }
        case 'checklist.add': {
            const t = task(s, u, data.taskId);
            project(s, u, t.projectId, true);
            ensure(!t.archived);
            conflict(t.version, data.version);
            t.checklist.push({ id: id(), text: data.text, done: false });
            taskEvent(t, u, 'adicionou item de checklist');
            return { id: t.id };
        }
        case 'checklist.toggle': {
            const t = task(s, u, data.taskId);
            ensure(canMove(s, u, t) && !t.archived);
            conflict(t.version, data.version);
            const item = t.checklist.find(i => i.id === data.itemId);
            ensure(item, 'Item não encontrado.', 404);
            item.done = data.done;
            taskEvent(t, u, 'atualizou o checklist');
            return { id: t.id };
        }
        case 'comment.add':
        case 'comment.edit':
        case 'comment.delete': {
            const t = task(s, u, data.taskId);
            ensure(!t.archived && !s.projects.find(p => p.id === t.projectId)?.archived);
            const c: Conversation = { id: t.id, orgId: t.orgId, projectId: t.projectId, kind: 'project', name: t.title, memberIds: [], archived: false };
            if (type === 'comment.delete') {
                const comment = t.comments.find(c => c.id === data.id);
                ensure(comment && (comment.authorId === u.id || canManage(s, u, t.projectId)));
                comment.deleted = true;
                comment.body = '';
                comment.recipients = [];
                return { id: comment.id };
            }
            const recipients = resolveMentions(s, u, data.body, c);
            const comment: Comment | undefined = type === 'comment.add' ? { id: id(), authorId: u.id, body: data.body, at: now(), recipients, everRecipients: [] as string[] } : t.comments.find(c => c.id === data.id);
            ensure(comment && comment.authorId === u.id && !comment.deleted);
            if (type === 'comment.add')
                t.comments.push(comment);
            else {
                comment.body = data.body;
                comment.recipients = recipients;
                comment.editedAt = now();
            }
            mentionNotes(s, u, recipients, comment.everRecipients, t.title, 'task', t.id, comment.id);
            return { id: comment.id };
        }
        case 'message.send': {
            const c = conversation(s, u, data.conversationId);
            ensure(canSend(s, u, c));
            ensure(data.body || data.attachmentIds.length, 'Escreva uma mensagem ou anexe um arquivo.', 400);
            ensure(data.attachmentIds.every((f: string) => s.files.some(file => file.id === f && file.orgId === u.orgId && ((file.scope === 'conversation' && file.scopeId === c.id) || (file.scope === 'project' && file.scopeId === c.projectId)))), 'Anexo não permitido nesta conversa.');
            const recipients = resolveMentions(s, u, data.body, c);
            const m = { id: id(), orgId: u.orgId, conversationId: c.id, authorId: u.id, body: data.body, attachmentIds: data.attachmentIds, recipients, everRecipients: [] as string[], createdAt: now(), version: 1 };
            s.messages.push(m);
            mentionNotes(s, u, recipients, m.everRecipients, `Menção em ${c.name}`, 'conversation', c.id, m.id);
            return { id: m.id };
        }
        case 'message.edit':
        case 'message.delete': {
            const m = s.messages.find(m => m.id === data.id);
            ensure(m && !m.deletedAt, 'Mensagem não encontrada.', 404);
            const c = conversation(s, u, m.conversationId);
            conflict(m.version, data.version);
            if (type === 'message.edit') {
                ensure(m.authorId === u.id && canSend(s, u, c));
                const recipients = resolveMentions(s, u, data.body, c);
                m.body = data.body;
                m.recipients = recipients;
                m.editedAt = now();
                mentionNotes(s, u, recipients, m.everRecipients, `Menção em ${c.name}`, 'conversation', c.id, m.id);
            }
            else {
                ensure((m.authorId === u.id && canSend(s, u, c)) || canModerate(s, u, c));
                m.deletedAt = now();
                m.deletedBy = u.id;
                m.body = '';
                m.attachmentIds = [];
                m.recipients = [];
                audit(s, u, 'message.delete', m.id);
            }
            m.version++;
            return { id: m.id };
        }
        case 'conversation.create': {
            ensure(u.role !== 'user');
            if (data.projectId)
                project(s, u, data.projectId, true);
            else
                ensure(data.memberIds?.length && data.memberIds.every((to: string) => s.users.some(p => p.id === to && active(p, u.orgId) && (u.role === 'admin' || p.projectIds.some(pid => canManage(s, u, pid))))), 'Participante fora do escopo.');
            const c: Conversation = { id: id(), orgId: u.orgId, name: data.name, kind: data.projectId ? 'project' : 'direct', projectId: data.projectId, memberIds: data.projectId ? [] : [...new Set([u.id, ...data.memberIds])], archived: false };
            s.conversations.push(c);
            return { id: c.id };
        }
        case 'conversation.update': {
            const c = conversation(s, u, data.id);
            ensure(canModerate(s, u, c));
            c.name = data.name;
            c.archived = data.archived;
            audit(s, u, 'conversation.update', c.id);
            return { id: c.id };
        }
        case 'profile.update': {
            const handle = data.handle.toLowerCase();
            ensure(!['todos', 'usuarios', 'coordenadores', 'admins', 'help', 'ajuda', 'perfil'].includes(handle), 'Esse @ é reservado.', 400);
            ensure(!s.users.some(p => (p.accountId||p.id)!==(u.accountId||u.id) && p.handle.toLowerCase() === handle) && !s.accounts?.some(a=>a.id!==(u.accountId||u.id) && a.handle.toLowerCase()===handle), 'Este @ já está em uso.', 409);
            try {
                new Intl.DateTimeFormat('en', { timeZone: data.timezone });
            }
            catch {
                throw new DomainError('Timezone inválido.');
            }
            for (const f of [data.avatarId, data.coverId].filter(Boolean))
                ensure(s.files.some(file => file.id === f && file.scope === 'profile' && file.scopeId === u.id && file.orgId === u.orgId && file.mime.startsWith('image/')), 'Imagem de perfil inválida.');
            Object.assign(u, data, { handle });
            return { id: u.id };
        }
        case 'member.update': {
            ensure(u.role === 'admin');
            const p = s.users.find(p => p.id === data.id && p.orgId === u.orgId);
            ensure(p, 'Pessoa não encontrada.', 404);
            if (p.role === 'admin' && p.status === 'active' && (data.role !== 'admin' || data.status !== 'active'))
                ensure(s.users.some(o => o.orgId === u.orgId && o.id !== p.id && o.role === 'admin' && o.status === 'active'), 'O servidor precisa manter ao menos um Admin ativo.', 409);
            if (data.projectIds)
                ensure(data.projectIds.every((pid: string) => s.projects.some(pr => pr.id === pid && pr.orgId === u.orgId)), 'Projeto inválido.', 400);
            p.role = data.role;
            p.status = data.status;
            if (data.name)
                p.name = data.name;
            if (data.projectIds) {
                p.projectIds = [...new Set(data.projectIds as string[])];
                p.workspaceIds = workspaceMembershipIds(s,p);
            }
            if (p.status !== 'active')
                s.sessions = s.sessions.filter(session => !(session.userId === (p.accountId||p.id) && (!session.activeOrgId||session.activeOrgId===p.orgId)));
            audit(s, u, 'member.update', p.id);
            return { id: p.id };
        }
        case 'member.access': {
            const p = s.users.find(p => p.id === data.id && active(p, u.orgId));
            ensure(p);
            ensure(u.role === 'admin' || (u.role === 'coordinator' && p.role === 'user' && p.id !== u.id));
            ensure(data.projectIds.every((pid: string) => s.projects.some(pr => pr.id === pid && pr.orgId === u.orgId && (u.role === 'admin' || canManage(s, u, pid)))));
            if (u.role === 'admin')
                p.projectIds = [...new Set(data.projectIds as string[])];
            else
                p.projectIds = [...new Set([...p.projectIds.filter(pid => !canManage(s, u, pid)), ...data.projectIds as string[]])];
            p.workspaceIds = workspaceMembershipIds(s,p);
            audit(s, u, 'member.access', p.id);
            return { id: p.id };
        }
        case 'org.update': {
            ensure(u.role === 'admin');
            const org = s.orgs.find(o => o.id === u.orgId)!;
            conflict(org.version||1,data.version);
            if(data.iconId)ensure(s.files.some(f=>f.id===data.iconId && f.orgId===u.orgId && f.scope==='studio' && f.scopeId===u.orgId && f.mime.startsWith('image/')),'Ícone inválido.',400);
            org.name = data.name;
            org.description = data.description;
            org.iconId=data.iconId||undefined;
            org.bannerColor=data.bannerColor||org.bannerColor;
            org.version=(org.version||1)+1;
            audit(s, u, 'org.update', org.id);
            return { id: org.id };
        }
        case 'workspace.create':
        case 'workspace.update':
            return executeWorkspace(s,u,type,data);
        case 'project.create': {
            const w = s.workspaces.find(w => w.id === data.workspaceId && w.orgId === u.orgId);
            ensure(w && u.role !== 'user' && (u.role === 'admin' || u.workspaceIds.includes(w.id)));
            const p = { id: id(), orgId: u.orgId, workspaceId: w.id, name: data.name, description: data.description, color: '#a3b1d4', version: 1, archived: false };
            s.projects.push(p);
            u.projectIds.push(p.id);
            if (!u.workspaceIds.includes(w.id))
                u.workspaceIds.push(w.id);
            s.conversations.push({ id: id(), orgId: u.orgId, name: p.name, projectId: p.id, kind: 'project', memberIds: [], archived: false });
            return { id: p.id };
        }
        case 'project.update': {
            const p = project(s, u, data.id, true);
            conflict(p.version, data.version);
            p.name = data.name;
            p.description = data.description;
            p.archived = data.archived;
            p.version++;
            audit(s, u, 'project.update', p.id);
            return { id: p.id };
        }
        case 'folder.create': {
            project(s, u, data.projectId, true);
            const f = { id: id(), orgId: u.orgId, projectId: data.projectId, name: data.name, archived: false };
            s.folders.push(f);
            return { id: f.id };
        }
        case 'folder.update': {
            const f = s.folders.find(f => f.id === data.id);
            ensure(f);
            project(s, u, f.projectId, true);
            f.name = data.name;
            f.archived = data.archived;
            return { id: f.id };
        }
        case 'file.folder': {
            const f = s.files.find(f => f.id === data.id && f.orgId === u.orgId);
            ensure(f && f.scope === 'project');
            project(s, u, f.scopeId, true);
            if (data.folderId)
                ensure(s.folders.some(folder => folder.id === data.folderId && folder.projectId === f.scopeId && !folder.archived));
            f.folderId = data.folderId;
            return { id: f.id };
        }
        case 'doc.save': {
            const p = project(s, u, data.projectId);
            ensure(!p.archived);
            if (data.id) {
                const d = s.documents.find(d => d.id === data.id && d.projectId === p.id);
                ensure(d, 'Documento não encontrado.', 404);
                conflict(d.version, data.version);
                d.revisions.push({ body: d.body, by: u.id, at: d.updatedAt, version: d.version });
                d.body = data.body;
                d.title = data.title;
                d.version++;
                d.updatedAt = now();
                return { id: d.id };
            }
            const d = { id: id(), orgId: u.orgId, projectId: p.id, title: data.title, body: data.body, version: 1, updatedAt: now(), revisions: [] };
            s.documents.push(d);
            return { id: d.id };
        }
        case 'meeting.instant': {
            project(s,u,data.projectId,true);
            assignees(s,u,data.projectId,data.attendeeIds.filter((person:string)=>person!==u.id));
            const start=now(),attendeeIds=[...new Set([u.id,...data.attendeeIds])];
            ensure(attendeeIds.length<=50,'Limite de50 convidados.',400);
            const event={id:id(),orgId:u.orgId,projectId:data.projectId,title:data.title,start,end:new Date(Date.parse(start)+7200000).toISOString(),attendeeIds,responses:{[u.id]:'accepted' as const},meeting:true,instant:true,createdBy:u.id,version:1};
            s.calendar.push(event);
            for(const to of attendeeIds)note(s,u,to,'meeting',`Reunião agora: ${event.title}`,'event',event.id,event.id);
            return {id:event.id};
        }
        case 'event.save': {
            project(s, u, data.projectId, true);
            assignees(s, u, data.projectId, data.attendeeIds);
            ensure(Date.parse(data.end) > Date.parse(data.start), 'O fim deve ser posterior ao início.', 400);
            const old = data.id ? s.calendar.find(e => e.id === data.id && e.orgId === u.orgId) : undefined;
            if (data.id) {
                ensure(old && !old.instant && old.projectId === data.projectId);
                conflict(old.version, data.version);
            }
            const e = { ...data, id: old?.id || id(), orgId: u.orgId, responses: {} as Record<string, 'accepted' | 'declined'>, createdBy: old?.createdBy || u.id, version: (old?.version || 0) + 1 };
            if (old)
                Object.assign(old, e);
            else
                s.calendar.push(e);
            for (const to of e.attendeeIds)
                note(s, u, to, 'meeting', e.title, 'event', e.id, `${e.id}:${e.version}`);
            return { id: e.id };
        }
        case 'event.delete': {
            const e = s.calendar.find(e => e.id === data.id);
            ensure(e);
            project(s, u, e.projectId, true);
            conflict(e.version, data.version);
            s.calendar = s.calendar.filter(x => x.id !== e.id);
            return { id: e.id };
        }
        case 'event.respond': {
            const e = s.calendar.find(e => e.id === data.id);
            ensure(e && e.attendeeIds.includes(u.id));
            project(s, u, e.projectId);
            e.responses[u.id] = data.response;
            return { id: e.id };
        }
        case 'help.create': {
            const h = { id: id(), orgId: u.orgId, requesterId: u.id, title: data.title, body: data.body, status: 'open' as const, createdAt: now() };
            s.help.push(h);
            return { id: h.id };
        }
        case 'help.resolve': {
            const h = s.help.find(h => h.id === data.id && h.requesterId === u.id);
            ensure(h, 'Solicitação não encontrada.', 404);
            h.status = 'resolved';
            return { id: h.id };
        }
        case 'inbox.read': {
            const n = s.notifications.find(n => n.id === data.id);
            ensure(n && noteVisible(s, u, n));
            n.readAt = data.read ? now() : undefined;
            return { id: n.id };
        }
        case 'inbox.all': {
            const notes = s.notifications.filter(n => noteVisible(s, u, n));
            ensure(data.cutoff <= Math.max(0, ...notes.map(n => n.sequence)), 'Cursor inválido.', 400);
            for (const n of notes)
                if (n.sequence <= data.cutoff)
                    n.readAt = now();
            return { ok: true };
        }
        case 'command.execute': return command(s, u, data);
    }
}
function command(s: State, u: User, data: {
    conversationId: string;
    text: string;
}): unknown {
    const c = conversation(s, u, data.conversationId);
    ensure(canSend(s, u, c));
    const [cmd, ...args] = data.text.trim().replace(/^\//, '').split(/\s+/);
    ensure(commandCatalog(u).some(o => o.id === cmd), 'Comando indisponível para o seu cargo ou inexistente.', 403);
    if (cmd === 'ajuda')
        return { message: commandCatalog(u).map(c => `${c.label} — ${c.description}`).join('\n') };
    if (cmd === 'perfil')
        return { navigate: `profile/${u.id}` };
    if (cmd === 'minhas-tarefas')
        return { navigate: 'my-tasks' };
    if(cmd==='meet') {
        if(!args.length)return {navigate:'meetings'};
        ensure(args.length===1 && args[0]==='criar','Use /meet ou /meet criar.',400);
        const projectId=c.projectId || s.projects.find(p=>p.workspaceId===c.workspaceId && canManage(s,u,p.id))?.id;
        ensure(projectId && canManage(s,u,projectId),'Seu cargo não pode agendar reuniões neste contexto.');
        return {open:'reuniao',projectId};
    }
    if (cmd === 'usuario' || cmd === 'servidor')
        return { navigate: 'settings' };
    if (cmd === 'help')
        return dispatch(s, u, 'help.create', { title: args.join(' ') || 'Preciso de ajuda', body: args.join(' ') || 'Solicitação aberta pelo comando /help.' });
    if (cmd === 'andamento' || cmd === 'concluir') {
        const t = task(s, u, args[0] || '');
        ensure(canMove(s, u, t));
        if (cmd === 'concluir' && t.checklist.some(c => !c.done) && args[1] !== '--confirmar')
            return { confirmText: `/concluir ${t.id} --confirmar`, message: 'Há itens pendentes no checklist. Concluir mesmo assim?' };
        return dispatch(s, u, 'task.move', { id: t.id, status: cmd === 'concluir' ? 'done' : 'in_progress', version: t.version, confirmPending: args[1] === '--confirmar' });
    }
    if (cmd === 'cargo') {
        const p = s.users.find(p => p.orgId === u.orgId && p.handle === args[0]?.replace('@', ''));
        ensure(p && ['user', 'coordinator', 'admin'].includes(args[1]), 'Use /cargo @pessoa user|coordinator|admin', 400);
        if (args[2] !== '--confirmar')
            return { confirmText: `/cargo @${p.handle} ${args[1]} --confirmar`, message: `Confirmar a alteração do acesso de ${p.name} para ${args[1]}?` };
        return dispatch(s, u, 'member.update', { id: p.id, role: args[1] as Role, status: p.status });
    }
    if (cmd === 'apagar-mensagem') {
        const m = s.messages.find(m => m.id === args[0] && m.conversationId === c.id && !m.deletedAt);
        ensure(m, 'Mensagem não encontrada nesta conversa.', 404);
        ensure(m.authorId === u.id || canModerate(s, u, c));
        if (args[1] !== '--confirmar')
            return { confirmText: `/apagar-mensagem ${m.id} --confirmar`, message: 'Apagar esta mensagem? O marcador de exclusão será preservado.' };
        return dispatch(s, u, 'message.delete', { id: m.id, version: m.version });
    }
    if (cmd === 'atribuir') {
        const t = task(s, u, args[0] || '');
        const p = s.users.find(p => p.orgId === u.orgId && p.handle === args[1]?.replace('@', ''));
        ensure(p, 'Use /atribuir ID @pessoa', 400);
        return dispatch(s, u, 'task.update', { id: t.id, title: t.title, description: t.description, priority: t.priority, dueDate: t.dueDate, labels: t.labels, assigneeIds: [p.id], version: t.version });
    }
    ensure(c.projectId && canManage(s, u, c.projectId));
    return { open: cmd, projectId: c.projectId };
}
