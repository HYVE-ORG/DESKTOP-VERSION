import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canProject, canManage, canMove, canConversation, canFile } from '../apps/api/src/policy';
import type { State, User, Project, Task, Conversation, FileItem } from '../packages/contracts';
const p = { id: 'p', orgId: 'o', workspaceId: 'w' } as Project;
const s = { projects: [p] } as State;
const user = { id: 'u', orgId: 'o', status: 'active', role: 'user', workspaceIds: ['w'], projectIds: ['p'] } as User;
test('imagem de perfil ainda não publicada ou removida permanece privada', () => {
    const owner = { ...user, id: 'owner', avatarId: 'published' };
    const state = { ...s, users: [owner, user] } as State;
    const draft = { id: 'draft', orgId: 'o', scope: 'profile', scopeId: 'owner' } as FileItem;
    assert.equal(canFile(state, user, draft), false);
    assert.equal(canFile(state, owner, draft), true);
    assert.equal(canFile(state, user, { ...draft, id: 'published' }), true);
    owner.avatarId = '';
    assert.equal(canFile(state, user, { ...draft, id: 'published' }), false);
});
test('associação ativa autoriza projeto e atribuição, sem permitir gestão', () => {
    assert.equal(canProject(s, user, p), true);
    assert.equal(canManage(s, user, 'p'), false);
    assert.equal(canMove(s, user, { projectId: 'p', assigneeIds: ['u'] } as Task), true);
    assert.equal(canMove(s, user, { projectId: 'p', assigneeIds: ['other'] } as Task), false);
});
test('Admin enxerga próprio servidor mas nunca outro tenant ou suspensão', () => {
    const admin = { ...user, role: 'admin', projectIds: [], workspaceIds: [] } as User;
    assert.equal(canProject(s, admin, p), true);
    assert.equal(canProject(s, admin, { ...p, orgId: 'foreign' }), false);
    assert.equal(canProject(s, { ...admin, status: 'suspended' }, p), false);
});
test('Coordenador não amplia escopo e direto exige participação ou Admin', () => {
    const c = { ...user, role: 'coordinator' } as User;
    assert.equal(canManage(s, c, 'p'), true);
    assert.equal(canManage(s, { ...c, projectIds: [] }, 'p'), false);
    const direct = { id: 'd', orgId: 'o', kind: 'direct', memberIds: ['other'] } as Conversation;
    assert.equal(canConversation(s, c, direct), false);
    assert.equal(canConversation(s, { ...c, role: 'admin' }, direct), true);
});
