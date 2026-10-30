import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFile } from '../apps/api/src/files';
import { codeLanguage,codeTokens } from '../apps/web/src/code-preview';
test('source uploads are UTF-8 text and preview tokens preserve hostile markup literally',()=>{
 assert.equal(detectFile('View.TSX',Buffer.from('export const View = () => <h1>Olá</h1>;')),'text/plain; charset=utf-8');
 assert.throws(()=>detectFile('bad.ts',Buffer.from([0xff])));
 assert.throws(()=>detectFile('bad.py',Buffer.from([0])));
 assert.equal(codeLanguage('view.tsx'),'TypeScript React');
 const source='<script>alert("oi")</script>\nconst x = 123;';
 assert.equal(codeTokens(source).map(t=>t.text).join(''),source);
 assert.ok(codeTokens(source).some(t=>t.kind==='keyword'));
});
