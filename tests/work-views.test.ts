import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inContext, calendarDates, eventMinutes } from '../apps/web/src/work-views';
test('workspace and project contexts never include unrelated or direct conversations', () => {
    const projects = [{ id: 'p1', workspaceId: 'w1' }, { id: 'p2', workspaceId: 'w2' }];
    assert.equal(inContext({ projectId: 'p1' }, projects, undefined, 'w1'), true);
    assert.equal(inContext({ workspaceId: 'w1' }, projects, undefined, 'w1'), true);
    assert.equal(inContext({ projectId: 'p2' }, projects, undefined, 'w1'), false);
    assert.equal(inContext({}, projects, undefined, 'w1'), false);
    assert.equal(inContext({ projectId: 'p2' }, projects, 'p1'), false);
});
test('calendar week starts Monday and month includes adjacent days', () => {
    assert.deepEqual(calendarDates('2026-10-22', 'week'), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    const month = calendarDates('2026-02-28', 'month');
    assert.equal(month.length, 42);
    assert.equal(month[0], '2026-01-26');
    assert.deepEqual(calendarDates('2026-10-22', 'day'), ['2026-10-22']);
});
test('events cross midnight and respect profile timezone', () => {
    const event = { start: '2026-10-23T02:30:00Z', end: '2026-10-23T04:00:00Z' };
    assert.deepEqual(eventMinutes(event, '2026-10-22', 'America/Sao_Paulo'), [1410, 1440]);
    assert.deepEqual(eventMinutes(event, '2026-10-23', 'America/Sao_Paulo'), [0, 60]);
    assert.equal(eventMinutes(event, '2026-10-24', 'America/Sao_Paulo'), null);
});
