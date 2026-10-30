import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedState} from '../apps/api/src/seed';
import {migrateV1} from '../apps/api/src/migrate';
import {provisionStudio} from '../apps/api/src/provision';
test('operador cria Studio para conta ativa, com projeto/chat e sem conta ou senha automática',()=>{
 const s=migrateV1(seedState('Admin','admin@teste.local','hash',false));
 const accounts=s.accounts!.length;
 const before=s.orgs.length;
 assert.throws(()=>provisionStudio(s,'inexistente@teste.local','Equipe nova'));
 assert.equal(s.orgs.length,before);
 const result=provisionStudio(s,'ADMIN@TESTE.LOCAL','Equipe nova');
 assert.equal(s.accounts!.length,accounts);
 assert.equal(s.orgs.length,before+1);
 const member=s.users.find(u=>u.orgId===result.orgId)!;
 assert.equal(member.role,'admin');assert.equal(member.accountId,s.accounts![0].id);
 assert.ok(s.conversations.some(c=>c.projectId===result.projectId&&c.orgId===result.orgId));
 assert.equal(s.audit.at(-1)?.action,'studio.create.operator');
});
