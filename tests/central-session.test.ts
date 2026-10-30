import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CentralDomain} from '../apps/api/src/central-domain';
import {centralAuthorization,centralRefresh,centralCookies} from '../apps/api/src/central-session';

test('sessão central usa cookies HttpOnly separados do login local',()=>{
 const cookies=centralCookies({accessToken:'access-fixture',refreshToken:'refresh-fixture',expiresIn:3600},true);
 assert.equal(cookies.length,2);
 assert.ok(cookies.every(c=>c.includes('HttpOnly')&&c.includes('SameSite=Strict')&&c.includes('Secure')&&c.includes('Path=/api/central')));
 assert.equal(centralAuthorization({cookie:'forma_session=local; forma_central_access=access-fixture'}),'Bearer access-fixture');
 assert.equal(centralAuthorization({cookie:'forma_session=local'}),undefined);
 assert.equal(centralRefresh('forma_central_refresh=refresh-fixture'),'refresh-fixture');
 assert.ok(centralCookies(null,false).every(c=>c.includes('Max-Age=0')));
});
test('login e renovação centrais validam sessão retornada e não aceitam resposta inválida',async()=>{
 const calls:string[]=[];
 const domain=new CentralDomain({url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'},async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');return Response.json({access_token:'access-fixture',refresh_token:'refresh-fixture',expires_in:3600});});
 assert.deepEqual(await domain.signIn('person@forma.invalid','password-fixture'),{accessToken:'access-fixture',refreshToken:'refresh-fixture',expiresIn:3600});
 await domain.refresh('refresh-fixture');
 assert.ok(calls[0].endsWith('/auth/v1/token?grant_type=password'));
 assert.ok(calls[1].endsWith('/auth/v1/token?grant_type=refresh_token'));
 const invalid=new CentralDomain({url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'},async()=>Response.json({access_token:'bad;cookie',refresh_token:'ok',expires_in:3600}));
 await assert.rejects(invalid.signIn('person@forma.invalid','password-fixture'),{status:503});
 const missing=new CentralDomain({url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'},async()=>Response.json({expires_in:3600}));
 await assert.rejects(missing.signIn('person@forma.invalid','password-fixture'),{status:503});
});
