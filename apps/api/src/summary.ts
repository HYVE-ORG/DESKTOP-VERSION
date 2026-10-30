import type { State, User, Summary } from '../../../packages/contracts';
import { canProject, active } from './policy';
import {dayIn} from '../../../packages/shared/date';
export {dayIn} from '../../../packages/shared/date';
export function summarize(s: State, viewer: User, target: User, clock = new Date()): Summary {
    const days: Record<string, number> = {};
    if (!active(viewer, target.orgId) || !active(target, viewer.orgId))
        return { total: 0, days, streak: 0, best: 0, timezone: target.timezone };
    const projects = new Set(s.projects.filter(p => canProject(s, viewer, p) && canProject(s, target, p)).map(p => p.id));
    for (const t of s.tasks) {
        if (projects.has(t.projectId) && t.firstCompletion?.assigneeIds.includes(target.id)) {
            const day = dayIn(t.firstCompletion.at, target.timezone);
            days[day] = (days[day] || 0) + 1;
        }
    }
    const dates = Object.keys(days).sort();
    let best = 0, run = 0, previous = -Infinity;
    for (const date of dates) {
        const n = Date.parse(date) / 86400000;
        run = n === previous + 1 ? run + 1 : 1;
        best = Math.max(best, run);
        previous = n;
    }
    let n = Date.parse(dayIn(clock, target.timezone)) / 86400000;
    const key = (d: number) => new Date(d * 86400000).toISOString().slice(0, 10);
    if (!days[key(n)])
        n--;
    let streak = 0;
    while (days[key(n)]) {
        streak++;
        n--;
    }
    return { total: Object.values(days).reduce((a, b) => a + b, 0), days, streak, best, timezone: target.timezone };
}
