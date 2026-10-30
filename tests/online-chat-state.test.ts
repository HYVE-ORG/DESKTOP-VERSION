import {test} from 'node:test';
import assert from 'node:assert/strict';
import {remainingDraftFiles} from '../apps/web/src/online-chat-state';
test('confirmação remove apenas anexos publicados e preserva upload concluído durante o envio',()=>{
 const sent={id:'enviado'},arrived={id:'upload-que-chegou-depois'},current=[sent,arrived];
 assert.deepEqual(remainingDraftFiles(current,['enviado']),[arrived]);
 assert.deepEqual(remainingDraftFiles([arrived],[]),[arrived]);
 assert.deepEqual(current,[sent,arrived]);
});
