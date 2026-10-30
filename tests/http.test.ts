import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../apps/api/src/app';
import { seedState } from '../apps/api/src/seed';
import { passwordHash } from '../apps/api/src/auth';
test('sessão real, origem, roles, uploads privados e revogação por HTTP', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'forma-http-'));
    let server: any;
    try {
        server = await createApp(dir, 0);
        const base = `http://127.0.0.1:${server.port}/api`;
        const request = async (path: string, method = 'GET', body?: unknown, cookie = '', origin = 'http://localhost:5173') => fetch(base + path, { method, headers: { origin, 'Content-Type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
        assert.equal((await request('/status')).status, 200);
        assert.equal((await request('/state')).status, 401);
        assert.equal((await request('/setup','POST',{})).status,403);
        const hash=await passwordHash('Senha-local-teste-2026');
        await server.store.transact((s:any)=>Object.assign(s,seedState('Admin Teste','admin@test.local',hash,true)));
        const setup = await request('/login', 'POST', { email: 'admin@test.local', password: 'Senha-local-teste-2026' });
        assert.equal(setup.status, 201);
        const adminCookie = setup.headers.get('set-cookie')!.split(';')[0];
        const login = await request('/login', 'POST', { email: 'lucas@forma.local', password: 'Senha-local-teste-2026' });
        assert.equal(login.status, 201);
        const cookie = login.headers.get('set-cookie')!.split(';')[0];
        const state = await (await request('/state', 'GET', undefined, cookie)).json() as any;
        assert.equal(state.me.role, 'user');
        assert.ok(!JSON.stringify(state).includes('passwordHash'));
        assert.ok(!state.projects.some((p: any) => p.name.includes('Onboarding')));
        const mutate = (type: string, payload: unknown, auth = cookie) => request('/actions', 'POST', { type, payload, requestId: crypto.randomUUID() }, auth);
        assert.equal((await mutate('member.update', { id: state.me.id, role: 'admin', status: 'active' })).status, 403);
        assert.equal((await request('/actions', 'POST', { type: 'help.create', payload: { title: 'Teste', body: 'Teste' }, requestId: crypto.randomUUID() }, cookie, 'https://evil.test')).status, 403);
        const invitation = { email: 'nova@test.local', name: 'Pessoa nova', role: 'user', projectIds: [state.projects[0].id] };
        const firstInvite = await (await request('/invitations', 'POST', invitation, adminCookie)).json() as any;
        const secondInvite = await (await request('/invitations', 'POST', invitation, adminCookie)).json() as any;
        assert.equal((await request(`/invitations/${firstInvite.token}`)).status, 404);
        assert.equal((await request(`/invitations/${secondInvite.token}`)).status, 200);
        const stored = await server.store.read();
        assert.equal(stored.invitations.filter((i: any) => !i.used).length, 1);
        const upload = await fetch(base + `/files?scope=project&scopeId=${state.projects[0].id}&name=nota.txt`, { method: 'POST', headers: { origin: 'http://localhost:5173', cookie, 'Content-Type': 'application/octet-stream' }, body: 'Uma nota de projeto.' });
        assert.equal(upload.status, 201);
        const file = await upload.json() as any;
        assert.equal((await request(`/files/${file.id}`)).status, 401);
        assert.equal(await (await request(`/files/${file.id}`, 'GET', undefined, cookie)).text(), 'Uma nota de projeto.');
        await server.store.transact((s: any) => {
            for (const session of s.sessions)
                session.reauthAt = 0;
        });
        assert.equal((await mutate('command.execute', { conversationId: state.conversations[0].id, text: '/cargo @lucas coordinator' }, adminCookie)).status, 428);
        assert.equal((await mutate('member.update', { id: state.me.id, role: 'user', status: 'suspended' }, adminCookie)).status, 428);
        assert.equal((await request('/reauth', 'POST', { password: 'Senha-local-teste-2026' }, adminCookie)).status, 201);
        assert.equal((await mutate('member.update', { id: state.me.id, role: 'user', status: 'suspended' }, adminCookie)).status, 201);
        assert.equal((await request('/state', 'GET', undefined, cookie)).status, 401);
        assert.equal((await request(`/files/${file.id}`, 'GET', undefined, cookie)).status, 401);
        assert.equal((await request('/setup', 'POST', { name: 'Outro', email: 'other@test.local', password: 'Senha-local-teste-2026', examples: false })).status, 403);
    }
    finally {
        if (server)
            await server.close();
        await rm(dir, { recursive: true, force: true });
    }
});
