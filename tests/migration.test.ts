import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedState } from '../apps/api/src/seed';
import { migrateV1, serializeState, hydrateState } from '../apps/api/src/migrate';
import { Store } from '../apps/api/src/store';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';import { tmpdir } from 'node:os';
test('legacy identities and scopes survive canonical account migration', () => {
  const legacy = seedState('Equipe', 'ADMIN@forma.local', 'hash', true);
  const next = migrateV1(legacy);
  assert.equal(next.schemaVersion, 2);
  assert.equal(next.accounts!.length, legacy.users.length);
  assert.equal(next.users[0].id, legacy.users[0].id);
  assert.equal(next.accounts![0].email, 'admin@forma.local');
  const disk = serializeState(next);
  assert.equal('users' in disk, false);
  assert.equal('passwordHash' in disk.memberships[0], false);
  assert.deepEqual(hydrateState(disk).users[0].projectIds, legacy.users[0].projectIds);
  assert.equal(hydrateState(disk).users[0].passwordHash, 'hash');
});
test('ambiguous legacy emails are rejected without modifying the input', () => {
  const legacy = seedState('Equipe', 'admin@forma.local', 'hash', true);
  legacy.users[1].email = ' ADMIN@FORMA.LOCAL ';
  const before = JSON.stringify(legacy);
  assert.throws(() => migrateV1(legacy), /duplicado/i);
  assert.equal(JSON.stringify(legacy), before);
});
test('interrupted migration resumes using the identical original backup',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forma-migration-'));
 try{const original=JSON.stringify(seedState('Admin','admin@local.test','hash',true));
 await writeFile(join(dir,'state.json'),original);await writeFile(join(dir,'state.v1.pre-migration.json'),original);
 await new Store(dir).transact(s=>{s.orgs[0].description='Migrado';});
 assert.equal(JSON.parse(await readFile(join(dir,'state.json'),'utf8')).schemaVersion,2);
 assert.equal(await readFile(join(dir,'state.v1.pre-migration.json'),'utf8'),original);
 await new Store(dir).transact(s=>{s.orgs[0].name='Após migração';});
 assert.equal(await readFile(join(dir,'state.v1.pre-migration.json'),'utf8'),original);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('duplicate legacy handles are rejected before membership projection',()=>{
 const s=seedState('Admin','admin@local.test','hash',true);s.users[1].handle=s.users[0].handle.toUpperCase();assert.throws(()=>migrateV1(s),/@ duplicado/);
});
