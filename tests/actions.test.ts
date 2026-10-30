import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedState } from '../apps/api/src/seed';
import { execute } from '../apps/api/src/actions';
import { snapshot } from '../apps/api/src/views';
const fixture = () => seedState('Admin', 'admin@test.local', 'hash', true);
const action = (s: ReturnType<typeof fixture>, userId: string, type: string, payload: unknown, requestId = crypto.randomUUID()) => execute(s, userId, { type, payload, requestId });
test('alteração administrativa aplica cargo e acesso em uma operação validada', () => {
    const s = fixture(), admin = s.users[0], target = s.users[2];
    assert.throws(() => action(s, admin.id, 'member.update', { id: target.id, role: 'coordinator', status: 'active', projectIds: ['inexistente'] }));
    assert.equal(target.role, 'user');
    action(s, admin.id, 'member.update', { id: target.id, role: 'coordinator', status: 'suspended', projectIds: [] });
    assert.equal(target.role, 'coordinator');
    assert.equal(target.status, 'suspended');
    assert.deepEqual(target.projectIds, []);
});
test('conclusão exige confirmação de pendências e tarefa arquivada bloqueia checklist', () => {
    const s = fixture(), u = s.users[2], t = s.tasks.find(t => t.assigneeIds.includes(u.id) && t.status === 'todo')!;
    assert.throws(() => action(s, u.id, 'task.move', { id: t.id, status: 'done', version: t.version }));
    const response = action(s, u.id, 'command.execute', { conversationId: s.conversations[0].id, text: `/concluir ${t.id}` }) as any;
    assert.ok(response.confirmText);
    assert.notEqual(t.status, 'done');
    action(s, u.id, 'command.execute', { conversationId: s.conversations[0].id, text: response.confirmText });
    assert.equal(t.status, 'done');
    t.archived = true;
    assert.throws(() => action(s, s.users[0].id, 'checklist.add', { taskId: t.id, text: 'Novo', version: t.version }));
});
test('retry de documento de Usuário funciona e comando revalida acesso atual', () => {
    const s = fixture(), u = s.users[2], key = crypto.randomUUID(), payload = { projectId: s.projects[0].id, title: 'Nota nova', body: 'Texto', version: 0 };
    const first = action(s, u.id, 'doc.save', payload, key);
    assert.deepEqual(action(s, u.id, 'doc.save', payload, key), first);
    const commandKey = crypto.randomUUID(), cmd = { conversationId: s.conversations[0].id, text: '/help Teste privado' };
    action(s, u.id, 'command.execute', cmd, commandKey);
    u.workspaceIds = [];
    u.projectIds = [];
    assert.throws(() => action(s, u.id, 'command.execute', cmd, commandKey));
});
test('criação na coluna destino é uma única operação e retry não duplica', () => {
    const s = fixture(), a = s.users[0], u = s.users[2], key = crypto.randomUUID();
    const payload = { projectId: s.projects[0].id, title: 'Entrega atômica', description: '', priority: 'medium', dueDate: '2026-11-01', labels: [], assigneeIds: [u.id], initialStatus: 'done' };
    const count = s.tasks.length;
    const result = action(s, a.id, 'task.create', payload, key) as any;
    assert.deepEqual(action(s, a.id, 'task.create', payload, key), result);
    assert.equal(s.tasks.length, count + 1);
    assert.equal(s.tasks.at(-1)!.status, 'done');
    assert.ok(s.tasks.at(-1)!.firstCompletion);
});
test('perfil de outro membro não revela IDs de projetos inacessíveis', () => {
    const s = fixture(), viewer = s.users[2], admin = s.users[0];
    const view = snapshot(s, viewer), publicAdmin = view.people.find(p => p.id === admin.id)!;
    assert.ok(publicAdmin.projectIds.every(id => view.projects.some(p => p.id === id)));
    assert.ok(publicAdmin.workspaceIds.every(id => view.workspaces.some(w => w.id === id)));
    assert.equal(publicAdmin.email, undefined);
});
test('documento obsoleto preserva a revisão atual e Usuário não cria reuniões', () => {
    const s = fixture(), user = s.users[2], d = s.documents[0], projectId = s.projects[0].id;
    action(s, user.id, 'doc.save', { id: d.id, projectId, title: d.title, body: 'Revisão atual', version: d.version });
    assert.throws(() => action(s, user.id, 'doc.save', { id: d.id, projectId, title: d.title, body: 'Texto antigo', version: 1 }));
    assert.equal(d.body, 'Revisão atual');
    assert.throws(() => action(s, user.id, 'event.save', { projectId, title: 'Reunião', start: new Date().toISOString(), end: new Date(Date.now() + 3600000).toISOString(), attendeeIds: [user.id], meeting: true }));
});
test('último Admin é protegido e cargo atual é autoridade', () => {
    const s = fixture();
    assert.throws(() => action(s, s.users[0].id, 'member.update', { id: s.users[0].id, role: 'user', status: 'active' }));
    assert.doesNotThrow(() => action(s, s.users[0].id, 'member.update', { id: s.users[2].id, role: 'coordinator', status: 'active' }));
    assert.equal(s.users[2].role, 'coordinator');
    assert.throws(() => action(s, s.users[2].id, 'member.update', { id: s.users[2].id, role: 'admin', status: 'active' }));
});
test('conclusão tem crédito único e retry não muda versão', () => {
    const s = fixture(), u = s.users[2], t = s.tasks.find(t => t.assigneeIds.includes(u.id) && t.status !== 'done')!;
    const key = crypto.randomUUID();
    const payload = { id: t.id, status: 'done', version: t.version, confirmPending: true };
    action(s, u.id, 'task.move', payload, key);
    action(s, u.id, 'task.move', payload, key);
    assert.equal(t.version, 2);
    const at = t.firstCompletion!.at;
    action(s, s.users[0].id, 'task.move', { id: t.id, status: 'in_progress', version: t.version });
    action(s, u.id, 'task.move', { id: t.id, status: 'done', version: t.version, confirmPending: true });
    assert.equal(t.firstCompletion!.at, at);
});
test('menção coletiva respeita cargo, idempotência e remoção', () => {
    const s = fixture(), coord = s.users[1], user = s.users[2], c = s.conversations[0];
    assert.throws(() => action(s, user.id, 'message.send', { conversationId: c.id, body: '@todos oi', attachmentIds: [] }));
    action(s, coord.id, 'message.send', { conversationId: c.id, body: '@todos Olá @lucas', attachmentIds: [] });
    assert.equal(s.notifications.filter(n => n.recipientId === s.users[0].id).length, 0);
    assert.equal(s.notifications.filter(n => n.recipientId === user.id).length, 1);
    const m = s.messages.at(-1)!;
    action(s, coord.id, 'message.edit', { id: m.id, body: 'Sem menção', version: 1 });
    assert.deepEqual(m.recipients, []);
    action(s, coord.id, 'message.edit', { id: m.id, body: '@lucas novamente', version: 2 });
    assert.equal(s.notifications.filter(n => n.recipientId === user.id).length, 1);
});
test('Inbox pessoal e read-all não afetam item posterior', () => {
    const s = fixture(), a = s.users[0], u = s.users[2];
    action(s, a.id, 'message.send', { conversationId: s.conversations[0].id, body: '@lucas Primeiro', attachmentIds: [] });
    const cutoff = s.notifications.at(-1)!.sequence;
    action(s, a.id, 'message.send', { conversationId: s.conversations[0].id, body: '@lucas Segundo', attachmentIds: [] });
    assert.throws(() => action(s, a.id, 'inbox.read', { id: s.notifications[0].id, read: true }));
    action(s, u.id, 'inbox.all', { cutoff });
    assert.ok(s.notifications[0].readAt);
    assert.equal(s.notifications[1].readAt, undefined);
});
test('anexos de tarefa exigem o mesmo projeto e não duplicam vínculo', () => {
    const s = fixture(), u = s.users[2], t = s.tasks.find(t => t.assigneeIds.includes(u.id))!;
    s.files.push({ id: 'f', orgId: u.orgId, uploaderId: u.id, name: 'nota.txt', mime: 'text/plain', size: 2, sha256: 'x', scope: 'project', scopeId: t.projectId, createdAt: new Date().toISOString() });
    action(s, u.id, 'task.attach', { taskId: t.id, fileId: 'f' });
    action(s, u.id, 'task.attach', { taskId: t.id, fileId: 'f' });
    assert.deepEqual(t.attachmentIds, ['f']);
    s.files[0].scopeId = 'outro-projeto';
    assert.throws(() => action(s, u.id, 'task.attach', { taskId: t.id, fileId: 'f' }));
});
