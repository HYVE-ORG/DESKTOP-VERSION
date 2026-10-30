import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PlanCards} from '../apps/web/src/PlanCards';
test('oferta renderiza somente dois cartões, preços79/149 e proposta empresarial separada',()=>{
 const html=renderToStaticMarkup(createElement(PlanCards));
 assert.equal((html.match(/data-plan=/g)||[]).length,2);assert.match(html,/79,00/);assert.match(html,/149,00/);assert.match(html,/100 MB/);assert.match(html,/250 MB/);assert.match(html,/proposta/i);assert.match(html,/preparação/i);assert.doesNotMatch(html,/ilimitad/i);
});
