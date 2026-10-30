import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedState } from '../apps/api/src/seed';
import { migrateV1 } from '../apps/api/src/migrate';
import { inviteAccount, respondInvitation, accountView } from '../apps/api/src/invitations';
test('personal invitations require recipient and current manager access and accept only once', () => {
 const s = migrateV1(seedState('Admin', 'admin@forma.local', 'hash', true));
 const admin = s.users[0];
 const a = { ...s.accounts![0], id:'new', email:'new@forma.local', handle:'new' };
 s.accounts!.push(a);
 const inv = inviteAccount(s, admin, {email:a.email, name:'Nova', role:'user', projectIds:[s.projects[0].id]});
 assert.equal(accountView(s,a).invitations.length,1);
 assert.throws(()=>respondInvitation(s,s.accounts![0],inv.id,'accept'));
 respondInvitation(s,a,inv.id,'accept'); respondInvitation(s,a,inv.id,'accept');
 assert.equal(s.users.filter(u=>u.accountId===a.id).length,1);
 assert.equal(accountView(s,a).studios.length,1);
});
test('manager suspension and expiration revoke pending grants', () => {
 const s = migrateV1(seedState('Admin','admin@forma.local','hash',true));
 const admin = s.users[0], a = {...s.accounts![0],id:'new',email:'new@forma.local',handle:'new'};
 s.accounts!.push(a);
 const inv=inviteAccount(s,admin,{email:a.email,name:'Nova',role:'user',projectIds:[s.projects[0].id]});
 admin.status='suspended';
 assert.throws(()=>respondInvitation(s,a,inv.id,'accept'));
 admin.status='active'; inv.expiresAt=Date.now()-1;
 assert.throws(()=>respondInvitation(s,a,inv.id,'accept'));
 assert.equal(s.users.some(u=>u.accountId===a.id),false);
});
