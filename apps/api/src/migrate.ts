import type { Account, Membership, State, User } from '../../../packages/contracts';

// Users are transaction-local authorization projections. Only accounts and memberships go to disk.
const identityKeys = ['name', 'email', 'passwordHash', 'handle', 'title', 'bio', 'location', 'timezone', 'avatarId', 'coverId'] as const;
export function migrateV1(input: State): State {
    const s = structuredClone(input);
    const emails = new Set<string>();
    const handles = new Set<string>();
    s.accounts = s.users.map(u => {
        const email = u.email.trim().toLowerCase();
        if (emails.has(email)) throw new Error('E-mail duplicado na base antiga; migração interrompida.');
        emails.add(email);
        if(handles.has(u.handle.toLowerCase()))throw new Error('@ duplicado na base antiga; migração interrompida.');
        handles.add(u.handle.toLowerCase());
        const { orgId, role, workspaceIds, projectIds, accountId, ...account } = u;
        return { ...account, email, status: 'active' };
    });
    s.schemaVersion = 2;
    s.users.forEach(u => { u.accountId = u.id; u.email = u.email.trim().toLowerCase(); });
    s.sessions.forEach(session => { session.activeOrgId = s.users.find(u => u.id === session.userId)?.orgId; });
    return s;
}
export function serializeState(state: State) {
    const s = state.schemaVersion === 1 ? migrateV1(state) : state;
    const accounts = structuredClone(s.accounts || []);
    for (const u of s.users) {
        let account = accounts.find(a => a.id === (u.accountId || u.id));
        if (!account) {
            const { orgId, role, workspaceIds, projectIds, accountId, ...identity } = u;
            account = { ...identity, id: u.accountId || u.id, status: 'active' };
            accounts.push(account);
        }
    }
    const memberships: Membership[] = s.users.map(u => ({ id: u.id, accountId: u.accountId || u.id, orgId: u.orgId, role: u.role, status: u.status, workspaceIds: u.workspaceIds, projectIds: u.projectIds }));
    const { users, ...rest } = s;
    return { ...rest, accounts, memberships, schemaVersion: 2 as const };
}
export function hydrateState(raw: any): State {
    if (raw.schemaVersion === 1) return migrateV1(raw);
    if (raw.schemaVersion !== 2 || !Array.isArray(raw.accounts) || !Array.isArray(raw.memberships)) throw new Error('Arquivo de dados inválido.');
    const emails = new Set<string>();
    const handles=new Set<string>();
    for (const a of raw.accounts as Account[]) {
        if (!a.id || !a.email || emails.has(a.email.trim().toLowerCase())) throw new Error('Conta inválida ou e-mail duplicado.');
        emails.add(a.email.trim().toLowerCase());
        if(!a.handle||handles.has(a.handle.toLowerCase()))throw new Error('@ duplicado ou inválido.');
        handles.add(a.handle.toLowerCase());
    }
    const users: User[] = raw.memberships.map((m: Membership) => {
        const a = raw.accounts.find((a: Account) => a.id === m.accountId);
        if (!a || !raw.orgs.some((o: {id:string}) => o.id === m.orgId) || !Array.isArray(m.projectIds) || !Array.isArray(m.workspaceIds) || !['admin','coordinator','user'].includes(m.role)) throw new Error('Participação inválida.');
        return { ...a, ...m, status: a.status === 'active' ? m.status : 'suspended' };
    });
    return { ...raw, users };
}
