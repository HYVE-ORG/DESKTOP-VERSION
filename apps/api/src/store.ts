import type { State } from '../../../packages/contracts';
import type { StateStore } from './state-store';
import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hydrateState, serializeState } from './migrate';
export const emptyState = (): State => ({ schemaVersion: 1, orgs: [], users: [], workspaces: [], projects: [], tasks: [], conversations: [], messages: [], notifications: [], files: [], folders: [], calendar: [], documents: [], help: [], audit: [], sessions: [], invitations: [], requests: [] });
export class Store implements StateStore {
    // ponytail: one writer process and one queue; move to PostgreSQL before horizontal scale.
    private queue: Promise<unknown> = Promise.resolve();
    constructor(public readonly directory: string) { }
    private async load(): Promise<State> {
        try {
            const s = JSON.parse(await readFile(join(this.directory, 'state.json'), 'utf8'));
            if(s.crm!==undefined && (!s.crm || ['contacts','opportunities','proposals'].some(k=>!Array.isArray(s.crm[k]))))
                throw new Error('Arquivo CRM inválido. Preserve a base e restaure um backup validado.');
            const lists = Object.keys(emptyState()).filter(k => k !== 'schemaVersion');
            if (![1, 2].includes(s.schemaVersion) || lists.filter(k => k !== 'users').some(k => !Array.isArray(s[k])) ||
                s.schemaVersion === 1 && (!Array.isArray(s.users) || s.users.some((u: UserShape) => !u.id || !u.orgId || !Array.isArray(u.projectIds) || !['admin', 'coordinator', 'user'].includes(u.role))))
                throw new Error('Arquivo de dados inválido. Restaure o backup; não será apagado.');
            return hydrateState(s);
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                return emptyState();
            if (error instanceof SyntaxError)
                throw new Error('Arquivo de dados inválido. Restaure o backup; não será apagado.');
            throw error;
        }
    }
    async read(): Promise<State> { await this.queue.catch(() => { }); return this.load(); }
    async transact<T>(change: (draft: State) => T | Promise<T>): Promise<T> {
        const job = this.queue.then(async () => {
            const draft = await this.load();
            const before = new Map(draft.users.map(u => [u.id, JSON.stringify(u)]));
            const result = await change(draft);
            // Propagate identity edits from the changed projection to the other memberships.
            const keys = ['name','email','passwordHash','handle','title','bio','location','timezone','avatarId','coverId'] as const;
            for (const u of draft.users.filter(u => before.has(u.id) && before.get(u.id) !== JSON.stringify(u))) {
                const original=JSON.parse(before.get(u.id)!);
                const account=draft.accounts?.find(a=>a.id===(u.accountId||u.id));
                for (const key of keys) if(original[key]!==u[key]) {
                    if(account)(account as any)[key]=u[key];
                    for (const other of draft.users.filter(p => p.id !== u.id && (p.accountId || p.id) === (u.accountId || u.id))) (other as any)[key]=u[key];
                }
            }
            await mkdir(this.directory, { recursive: true });
            const path = join(this.directory, 'state.json');
            const tmp = join(this.directory, `.state-${randomUUID()}.tmp`);
            await writeFile(tmp, JSON.stringify(serializeState(draft)), { mode: 0o600 });
            try {
                const original = JSON.parse(await readFile(path, 'utf8'));
                if (original.schemaVersion === 1) {
                    const backup=join(this.directory,'state.v1.pre-migration.json');
                    try{await copyFile(path,backup,1);}catch(error){
                        if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
                        if(await readFile(path,'utf8')!==await readFile(backup,'utf8'))throw new Error('Backup pré-migração diverge da origem. Preserve ambos e revise antes de migrar.');
                    }
                }
                await copyFile(path, join(this.directory, 'state.backup.json'));
            }
            catch (e) {
                if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
                    throw e;
            }
            await rename(tmp, path);
            return result;
        });
        this.queue = job.catch(() => { });
        return job;
    }
}
interface UserShape {
    id: string;
    orgId: string;
    projectIds: string[];
    role: string;
}
