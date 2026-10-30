import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mutationRunner } from '../apps/web/src/mutations';
test('resposta perdida repete chave; refresh falho não transforma commit em erro', async () => {
    const keys: string[] = [];
    const run = mutationRunner(async (_type, _payload, key) => {
        keys.push(key);
        if (keys.length === 1)
            throw new Error('Conexão perdida');
        return { id: 'criado' };
    }, async () => { throw new Error('GET indisponível'); });
    await assert.rejects(run('task.create', { title: 'Entrega' }));
    assert.deepEqual(await run('task.create', { title: 'Entrega' }), { id: 'criado' });
    assert.equal(keys[0], keys[1]);
    await run('task.create', { title: 'Entrega' });
    assert.notEqual(keys[1], keys[2]);
});
