export function inContext(item: {
    projectId?: string;
    workspaceId?: string;
}, projects: readonly {
    id: string;
    workspaceId: string;
}[], projectId?: string, workspaceId?: string) {
    if (projectId)
        return item.projectId === projectId;
    if (workspaceId)
        return item.workspaceId === workspaceId || projects.some(p => p.id === item.projectId && p.workspaceId === workspaceId);
    return true;
}
export const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function shiftDay(key: string, amount: number) {
    const date = new Date(key + 'T12:00:00');
    date.setDate(date.getDate() + amount);
    return dateKey(date);
}
export function calendarDates(selected: string, mode: 'day' | 'week' | 'month') {
    const date = new Date(selected + 'T12:00:00');
    if (mode === 'day')
        return [selected];
    if (mode === 'month')
        date.setDate(1);
    const start = shiftDay(dateKey(date), -(date.getDay() + 6) % 7);
    return Array.from({ length: mode === 'week' ? 7 : 42 }, (_, i) => shiftDay(start, i));
}
export function eventMinutes(event: {
    start: string;
    end: string;
}, day: string, timezone: string): [
    number,
    number
] | null {
    const parts = (at: string) => {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at)).map(p => [p.type, p.value]));
        return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
    };
    const start = parts(event.start), end = parts(event.end);
    if (start.day > day || end.day < day || end.day === day && end.minutes === 0)
        return null;
    return [start.day < day ? 0 : start.minutes, end.day > day ? 1440 : end.minutes];
}
