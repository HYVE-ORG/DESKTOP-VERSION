/** A lost response retains its key; a confirmed write never becomes a failed write because GET failed. */
export function mutationRunner(send: (type: string, payload: unknown, key: string) => Promise<any>, refresh: () => Promise<unknown>) {
    const pending = new Map<string, string>();
    return async (type: string, payload: unknown, explicit?: string) => {
        const fingerprint = JSON.stringify([type, payload]);
        const key = explicit || pending.get(fingerprint) || crypto.randomUUID();
        pending.set(fingerprint, key);
        const result = await send(type, payload, key);
        pending.delete(fingerprint);
        await refresh().catch(() => { });
        return result;
    };
}
