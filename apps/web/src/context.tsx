import { createContext, useContext, type ReactNode } from 'react';
import type { Snapshot, Person, Task, Project } from '../../../packages/contracts';
export type Dialog = {
    kind: string;
    id?: string;
    projectId?: string;
    status?: string;
} | null;
export interface WorkspaceContext {
    data: Snapshot;
    run: (type: string, payload: unknown, requestId?: string) => Promise<any>;
    refresh: () => Promise<void>;
    navigate: (route: string) => void;
    route: string;
    dialog: Dialog;
    setDialog: (dialog: Dialog) => void;
    toast: (message: string) => void;
}
export const Context = createContext<WorkspaceContext | null>(null);
export function useWorkspace() {
    const c = useContext(Context);
    if (!c)
        throw new Error('Workspace ausente');
    return c;
}
export const initials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const avatarColors = ['#e9d8c8', '#d8e7e1', '#dadff0', '#f1dbd6', '#e8dfee', '#dbe8ed'];
export function Avatar({ person, size = 32, className = '' }: {
    person?: Person;
    size?: number;
    className?: string;
}) {
    const color = avatarColors[(person?.name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length];
    return person?.avatarId ? <img className={`avatar ${className}`} style={{ width: size, height: size }} src={`/api/files/${person.avatarId}`} alt={person.name}/> : <span title={person?.name} className={`avatar ${className}`} style={{ width: size, height: size, background: color, fontSize: size * .32 }}>{initials(person?.name || '?')}</span>;
}
export function PresenceAvatar({person,size=32}:{person:Person;size?:number}){
    const {data}=useWorkspace();
    const state=person.id===data.me.id?'online':person.presence;
    return <span className="presence-avatar" style={{width:size,height:size}}><Avatar person={person} size={size}/><span className={`presence-dot presence-${state||'unknown'}`} role="img" aria-label={state==='online'?'Online':state==='offline'?'Offline':'Estado indisponível'} title={state==='online'?'Online':state==='offline'?'Offline':'Estado indisponível'}/></span>;
}
export function PersonStatus({person}:{person:Person}){
    const {data}=useWorkspace();
    return <small className="person-presence-label">{person.id===data.me.id?'Você':person.presence==='online'?'Online':person.presence==='offline'?'Offline':'Estado indisponível'}</small>;
}
export function AvatarGroup({ ids, max = 4, size = 27 }: {
    ids: string[];
    max?: number;
    size?: number;
}) {
    const { data } = useWorkspace();
    return <span className="avatar-group">{ids.slice(0, max).map(id => <Avatar key={id} size={size} person={data.people.find(p => p.id === id)}/>)}{ids.length > max && <span className="avatar more" style={{ width: size, height: size }}>+{ids.length - max}</span>}</span>;
}
export const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Date(date.length === 10 ? date + 'T12:00:00' : date).toLocaleDateString('pt-BR', options).replace('.', '');
export const isManager = (data: Snapshot, p?: Project) => data.me.role === 'admin' || data.me.role === 'coordinator' && !!p && data.me.projectIds.includes(p.id) && data.me.workspaceIds.includes(p.workspaceId);
export const mayMove = (data: Snapshot, t: Task) => (isManager(data, data.projects.find(p => p.id === t.projectId)) || t.assigneeIds.includes(data.me.id)) && !t.archived && !data.projects.find(p => p.id === t.projectId)?.archived;
export function Empty({ icon, title, children, action }: {
    icon?: ReactNode;
    title: string;
    children?: ReactNode;
    action?: ReactNode;
}) { return <div className="empty">{icon && <span className="empty-icon">{icon}</span>}<h3>{title}</h3><p>{children}</p>{action}</div>; }
