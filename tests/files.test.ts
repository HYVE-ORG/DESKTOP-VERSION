import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFile } from '../apps/api/src/files';
test('tipo vem dos bytes; extensão ativa, conteúdo divergente e texto binário falham', () => {
    assert.equal(detectFile('nota.txt', Buffer.from('Uma nota de projeto.')), 'text/plain; charset=utf-8');
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(40)]);
    assert.equal(detectFile('imagem.png', png), 'image/png');
    for (const [name, bytes] of [['foto.png', Buffer.from('<svg onload=alert(1)>')], ['arquivo.exe', png], ['teste.svg', Buffer.from('<svg/>')], ['texto.txt', Buffer.from([0, 0, 255])], ['../foto.png', png]] as const)
        assert.throws(() => detectFile(name, bytes));
});
