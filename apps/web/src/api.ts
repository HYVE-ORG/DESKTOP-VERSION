import type { Snapshot } from '../../../packages/contracts';
export class ApiError extends Error {
    constructor(message: string, public status: number) { super(message); }
}
export async function request<T = any>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`/api${path}`, { method, credentials: 'include', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    }
    catch {
        throw new ApiError('Sem conexão com o servidor. Seu conteúdo continua aqui; tente novamente.', 0);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok)
        throw new ApiError(json.message || 'Não foi possível concluir.', res.status);
    return json;
}
export const loadState = () => request<Snapshot>('/state');
export async function upload(file: File, scope: string, scopeId: string, folderId?: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ name: file.name, scope, scopeId, ...(folderId ? { folderId } : {}) });
    const res = await fetch(`/api/files?${query}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body: file, signal });
    const json = await res.json();
    if (!res.ok)
        throw new Error(json.message || 'O upload falhou.');
    return json as {
        id: string;
        name: string;
        mime: string;
    };
}
