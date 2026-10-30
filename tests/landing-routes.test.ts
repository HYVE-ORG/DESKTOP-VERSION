import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicLandingSection} from '../apps/web/src/landing/routes';
test('desktop nunca renderiza landing, mesmo com hash de marketing ou raiz vazia',()=>{
 for(const hash of ['', '#landing', '#landing/desktop', '#login', '#home'])assert.equal(publicLandingSection(hash,true),null);
 assert.equal(publicLandingSection('#landing',false),'inicio');
});
test('marketing routes are public while login and private deep links keep the application flow',()=>{
 assert.equal(publicLandingSection(''),'inicio');
 assert.equal(publicLandingSection('#landing'),'inicio');
 assert.equal(publicLandingSection('#landing/desktop'),'desktop');
 assert.equal(publicLandingSection('#landing/perguntas'),'perguntas');
 for(const route of ['#login','#register','#home','#inbox','#project/abc','#invite?token=abc'])assert.equal(publicLandingSection(route),null);
 assert.equal(publicLandingSection('#landing/unknown'),'inicio');
});
