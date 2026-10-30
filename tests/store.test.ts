import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../apps/api/src/store';
test('transações concorrentes sobrevivem a reinício e falha não publica rascunho', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'forma-store-'));
    try {
        const store = new Store(dir);
        await Promise.all(Array.from({ length: 8 }, (_, i) => store.transact(s => { s.orgs.push({ id: String(i), name: 'Teste', description: '' }); })));
        assert.equal((await new Store(dir).read()).orgs.length, 8);
        const before = await readFile(join(dir, 'state.json'), 'utf8');
        await assert.rejects(store.transact(s => { s.orgs.length = 0; throw new Error('cancelar'); }));
        assert.equal(await readFile(join(dir, 'state.json'), 'utf8'), before);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('arquivo inválido não é substituído por dados vazios', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'forma-corrupt-'));
    try {
        await writeFile(join(dir, 'state.json'), '{"schemaVersion":1}');
        await assert.rejects(new Store(dir).read(), /inválido/);
        assert.equal(await readFile(join(dir, 'state.json'), 'utf8'), '{"schemaVersion":1}');
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
