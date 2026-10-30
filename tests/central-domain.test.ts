import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CentralDomain} from '../apps/api/src/central-domain';

test('domínio central usa somente RPC fixa, bearer do usuário e publishable',async()=>{
 const calls:{url:string;options:RequestInit}[]=[];
 const domain=new CentralDomain({url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'},async(url,options)=>{calls.push({url,options});return Response.json({profile:null,studios:[],invitations:[]});});
 await domain.account('Bearer fixture-token');
 assert.equal(calls[0].url,'https://forma-test.supabase.co/rest/v1/rpc/forma_account');
 assert.equal(calls[0].options.method,'POST');
 assert.equal((calls[0].options.headers as Record<string,string>).Authorization,'Bearer fixture-token');
 assert.equal(calls[0].options.redirect,'error');
 await assert.rejects(domain.account(undefined),{status:401});
 assert.equal(calls.length,1);
});

test('falha central não vira sessão local e erros do provedor não vazam',async()=>{
 const config={url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'};
 for(const [status,expected] of [[401,401],[403,403],[409,409],[500,503]]){
  const domain=new CentralDomain(config,async()=>Response.json({message:'SQL interno sensível',code:'XX000'},{status}));
  await assert.rejects(domain.account('Bearer fixture-token'),(e:any)=>e.status===expected&&!e.message.includes('SQL interno'));
 }
 assert.throws(()=>new CentralDomain({...config,url:'http://localhost'}));
});

test('respostas grandes e redirecionamentos não viram dados ou erros internos',async()=>{
 const config={url:'https://forma-test.supabase.co',publishableKey:'sb_publishable_fixture'};
 const large=new CentralDomain(config,async()=>new Response('x'.repeat(1024*1024+1),{status:500}));
 await assert.rejects(large.account('Bearer fixture-token'),{status:503});
 const redirect=new CentralDomain(config,async()=>new Response(null,{status:302,headers:{Location:'https://evil.invalid'}}));
 await assert.rejects(redirect.account('Bearer fixture-token'),{status:503});
});
