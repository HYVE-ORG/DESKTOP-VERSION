import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownMedia } from '../apps/web/src/media';
test('permissão de mídia resolvida após fechamento encerra todos os tracks', async () => {
    let stopped = 0;
    const stream = { getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] } as unknown as MediaStream;
    assert.equal(await ownMedia(Promise.resolve(stream), () => false), null);
    assert.equal(stopped, 2);
    assert.equal(await ownMedia(Promise.resolve(stream), () => true), stream);
    assert.equal(stopped, 2);
});
