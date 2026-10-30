import type {SpaceIcon,SpaceCover} from './spaces';
export type Role = 'admin' | 'coordinator' | 'user';
export type Status = 'todo' | 'in_progress' | 'in_review' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export interface User {
    id: string;
    accountId?: string;
    orgId: string;
    name: string;
    email: string;
    passwordHash: string;
    role: Role;
    status: 'active' | 'suspended' | 'removed';
    handle: string;
    title: string;
    bio: string;
    location: string;
    timezone: string;
    workspaceIds: string[];
    projectIds: string[];
    avatarId?: string;
    coverId?: string;
}
export type Person = Omit<User, 'passwordHash' | 'email'> & {
    presence?: 'online' | 'offline';
    email?: string;
};
export interface Workspace {
    description?: string;
    icon?: SpaceIcon;
    cover?: SpaceCover;
    timezone?: string;
    memberIds?: string[];
    createdAt?: string;
    createdBy?: string;
    version?: number;
    id: string;
    orgId: string;
    name: string;
    color: string;
}
export interface Project {
    id: string;
    orgId: string;
    workspaceId: string;
    name: string;
    description: string;
    color: string;
    archived: boolean;
    version: number;
}
export interface Comment {
    id: string;
    authorId: string;
    body: string;
    at: string;
    editedAt?: string;
    recipients: string[];
    everRecipients: string[];
    deleted?: boolean;
}
export interface Task {
    id: string;
    orgId: string;
    projectId: string;
    title: string;
    description: string;
    status: Status;
    priority: Priority;
    dueDate: string;
    labels: string[];
    assigneeIds: string[];
    checklist: {
        id: string;
        text: string;
        done: boolean;
    }[];
    version: number;
    createdAt: string;
    updatedAt: string;
    archived: boolean;
    comments: Comment[];
    events: {
        id: string;
        actorId: string;
        text: string;
        at: string;
    }[];
    attachmentIds?: string[];
    firstCompletion?: {
        at: string;
        assigneeIds: string[];
    };
}
export interface Conversation {
    id: string;
    orgId: string;
    name: string;
    kind: 'project' | 'workspace' | 'direct';
    projectId?: string;
    workspaceId?: string;
    memberIds: string[];
    archived: boolean;
}
export interface Message {
    id: string;
    orgId: string;
    conversationId: string;
    authorId: string;
    body: string;
    attachmentIds: string[];
    recipients: string[];
    everRecipients: string[];
    createdAt: string;
    editedAt?: string;
    deletedAt?: string;
    deletedBy?: string;
    version: number;
}
export interface Note {
    id: string;
    orgId: string;
    recipientId: string;
    actorId: string;
    type: 'mention' | 'assignment' | 'meeting' | 'system';
    title: string;
    resourceType: 'task' | 'conversation' | 'event' | 'help';
    resourceId: string;
    sourceId?: string;
    createdAt: string;
    sequence: number;
    readAt?: string;
}
export interface FileItem {
    id: string;
    orgId: string;
    uploaderId: string;
    name: string;
    mime: string;
    size: number;
    sha256: string;
    scope: 'project' | 'conversation' | 'profile' | 'studio';
    scopeId: string;
    folderId?: string;
    createdAt: string;
}
export interface Folder {
    id: string;
    orgId: string;
    projectId: string;
    name: string;
    archived: boolean;
}
export interface CalendarItem {
    instant?: boolean;
    id: string;
    orgId: string;
    projectId: string;
    title: string;
    start: string;
    end: string;
    attendeeIds: string[];
    responses: Record<string, 'accepted' | 'declined'>;
    meeting: boolean;
    createdBy: string;
    version: number;
}
export interface Doc {
    id: string;
    orgId: string;
    projectId: string;
    title: string;
    body: string;
    version: number;
    updatedAt: string;
    revisions: {
        body: string;
        by: string;
        at: string;
        version: number;
    }[];
}
export interface Help {
    id: string;
    orgId: string;
    requesterId: string;
    title: string;
    body: string;
    status: 'open' | 'resolved';
    createdAt: string;
}
export interface Audit {
    id: string;
    orgId: string;
    actorId: string;
    action: string;
    targetId: string;
    at: string;
}
export interface Contact {
    id: string; orgId: string; workspaceId: string; name: string; email: string;
    phone: string; company: string; notes: string; kind: 'lead' | 'client' | 'vendor';
    version: number; createdAt: string; updatedAt: string;
}
export type SalesStage = 'new' | 'qualified' | 'proposal' | 'won' | 'lost';
export interface Opportunity {
    id: string; orgId: string; workspaceId: string; contactId: string;
    title: string; description: string; stage: SalesStage; valueCents: number;
    currency: 'BRL'; version: number; createdAt: string; updatedAt: string;
    history: { stage: SalesStage; by: string; at: string }[]; projectId?: string;
}
export interface ProposalRevision {
    title: string; body: string; totalCents: number; version: number; by: string; at: string;
}
export interface Proposal extends ProposalRevision {
    id: string; orgId: string; opportunityId: string; currency: 'BRL';
    status: 'draft' | 'accepted'; revisions: ProposalRevision[];
    projectId?: string; acceptedBy?: string; acceptedAt?: string; acceptanceNote?: string;
}
export interface CrmData { contacts: Contact[]; opportunities: Opportunity[]; proposals: Proposal[] }
export interface State {
    crm?: CrmData;
    schemaVersion: 1 | 2;
    accounts?: Account[];
    orgs: {
        id: string;
        name: string;
        description: string;
        iconId?: string;
        bannerColor?: string;
        version?: number;
    }[];
    users: User[];
    workspaces: Workspace[];
    projects: Project[];
    tasks: Task[];
    conversations: Conversation[];
    messages: Message[];
    notifications: Note[];
    files: FileItem[];
    folders: Folder[];
    calendar: CalendarItem[];
    documents: Doc[];
    help: Help[];
    audit: Audit[];
    sessions: {
        hash: string;
        userId: string;
        expiresAt: number;
        reauthAt?: number;
        activeOrgId?: string;
    }[];
    invitations: {
        id: string;
        orgId: string;
        email: string;
        name: string;
        role: Role;
        projectIds: string[];
        hash: string;
        expiresAt: number;
        used: boolean;
        inviterId?: string;
        status?: 'pending' | 'accepted' | 'declined' | 'revoked';
        acceptedUserId?: string;
    }[];
    requests: {
        userId: string;
        key: string;
        hash: string;
        result: unknown;
        at: number;
    }[];
}
export type Account = Omit<User, 'orgId' | 'role' | 'workspaceIds' | 'projectIds' | 'accountId'>;
export type Membership = Pick<User, 'id' | 'orgId' | 'role' | 'status' | 'workspaceIds' | 'projectIds'> & { accountId: string };
export interface AccountView {
    me: Omit<Account, 'passwordHash'>;
    studios: { id: string; name: string; role: Role }[];
    invitations: { id: string; studio: string; role: Role; expiresAt: number; status: string }[];
}
export interface Snapshot {
    crm?: CrmData;
    me: Person;
    org: State['orgs'][number];
    people: Person[];
    workspaces: Workspace[];
    projects: Project[];
    tasks: Task[];
    conversations: Conversation[];
    messages: Message[];
    notifications: Note[];
    inboxCutoff: number;
    files: FileItem[];
    folders: Folder[];
    calendar: CalendarItem[];
    documents: Doc[];
    help: Help[];
    audit: Audit[];
    summaries: Record<string, Summary>;
    commands: {
        id: string;
        label: string;
        description: string;
    }[];
    mode: 'local';
    mediaConfigured: false;
}
export interface Summary {
    total: number;
    days: Record<string, number>;
    streak: number;
    best: number;
    timezone: string;
}
export const roleNames: Record<Role, string> = { admin: 'Admin', coordinator: 'Coordenador', user: 'Usuário' };
export const statusNames: Record<Status, string> = { todo: 'A fazer', in_progress: 'Em andamento', in_review: 'Em revisão', done: 'Concluída' };
export const priorityNames: Record<Priority, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' };
