import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedState } from '../apps/api/src/seed';
import { summarize } from '../apps/api/src/summary';
test('primeiras conclusões não duplicam; sequência usa dias e respeita escopo', () => {
    const s = seedState('Admin', 'admin@test.local', 'hash', true);
    const u = s.users[2];
    const admin = s.users[0];
    s.tasks = s.tasks.slice(0, 3);
    for (const [i, t] of s.tasks.entries()) {
        t.status = i === 0 ? 'in_progress' : 'done';
        t.firstCompletion = { at: i === 0 ? '2026-10-19T15:00:00Z' : '2026-10-20T15:00:00Z', assigneeIds: [u.id] };
    }
    const a = summarize(s, admin, u, new Date('2026-10-21T18:00:00Z'));
    assert.equal(a.total, 3);
    assert.equal(a.days['2026-10-20'], 2);
    assert.equal(a.streak, 2);
    assert.equal(a.best, 2);
    assert.equal(summarize(s, admin, u, new Date('2026-10-22T18:00:00Z')).streak, 0);
    assert.equal(summarize(s, { ...u, projectIds: [] }, u).total, 0);
});
