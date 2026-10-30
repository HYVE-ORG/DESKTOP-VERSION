import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {CentralDomain} from '../apps/api/src/central-domain';
import {BillingDomain,billingFromEnv} from '../apps/api/src/billing-domain';
import {MercadoPago} from '../apps/api/src/mercadopago';
import {PUBLIC_PLANS} from '../packages/contracts/billing';
test('checkout fechado não chama provedor nem cria reserva',async()=>{
 let calls=0;const central=new CentralDomain({url:'https://qa.supabase.co',publishableKey:'sb_publishable_fixture'},async()=>{calls++;return Response.json({});});
 const billing=new BillingDomain(central,{});
 assert.equal(billing.status().checkoutEnabled,false);
 await assert.rejects(billing.checkout('Bearer fixture',{requestId:crypto.randomUUID(),planId:'essential',planVersion:1,company:'QA Company',termsVersion:'beta-1'}),{status:503});assert.equal(calls,0);
});
test('produção não é liberada apenas por variáveis de ambiente nesta preparação',()=>{
 const central=new CentralDomain({url:'https://qa.supabase.co',publishableKey:'sb_publishable_fixture'});
 const billing=billingFromEnv(central,{MERCADOPAGO_ACCESS_TOKEN:'fixture-token',MERCADOPAGO_COLLECTOR_ID:'123',FORMA_BILLING_SECRET:'d'.repeat(64),FORMA_BILLING_SALES_ENABLED:'true',FORMA_BILLING_BACK_URL:'https://forma.invalid/#central',FORMA_BILLING_TERMS_VERSION:'beta-1'});
 assert.equal(billing!.status().checkoutEnabled,false);
});
test('checkout usa reserva atestada e só o vencedor do claim chama Mercado Pago',async()=>{
 const key='d'.repeat(64),requestId=crypto.randomUUID();let creates=0,claims=0;
 const central=new CentralDomain({url:'https://qa.supabase.co',publishableKey:'sb_publishable_fixture'},async(_url,options)=>{
  const args=JSON.parse(options.body as string),envelope=JSON.parse(args.p_payload);assert.equal(args.p_proof,createHmac('sha256',key).update(args.p_payload).digest('hex'));
  const {id,name,...quote}=PUBLIC_PLANS[0];const checkout={id:requestId,quote,payer_email:'qa@billing.invalid',status:'prepared'};
  if(envelope.operation==='prepare')return Response.json(checkout);
  if(envelope.operation==='claim')return Response.json({...checkout,shouldCreate:claims++===0,status:'creating'});
  if(envelope.operation==='attach')return Response.json({...checkout,status:'pending',checkout_url:envelope.data.checkoutUrl});
  throw Error('Operação inesperada');
 });
 const gateway=new MercadoPago({accessToken:'fixture-token',collectorId:'123',mode:'test'},async(_url,options)=>{creates++;const input=JSON.parse(options.body as string);return Response.json({id:'sub123',collector_id:123,external_reference:input.external_reference,status:'pending',init_point:'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=sub123'});});
 const billing=new BillingDomain(central,{secret:key,gateway,checkoutEnabled:true,backUrl:'https://forma.invalid/#central',termsVersion:'beta-1'});
 const payload={requestId,planId:'essential',planVersion:1,company:'QA Company',termsVersion:'beta-1'};
 assert.equal((await billing.checkout('Bearer fixture',payload)).status,'pending');
 assert.equal((await billing.checkout('Bearer fixture',payload)).status,'creating');assert.equal(creates,1);
 await assert.rejects(billing.checkout('Bearer fixture',{...payload,priceCents:1}));
});
test('cancelamento exige contratante, confirma no provedor e não presume reembolso',async()=>{
 const id=crypto.randomUUID();let cancelled=0;
 const central=new CentralDomain({url:'https://qa.supabase.co',publishableKey:'sb_publishable_fixture'},async(url,options)=>{
  if(url.endsWith('/forma_billing_account'))return Response.json({checkouts:[{id}]});
  const e=JSON.parse(JSON.parse(options.body as string).p_payload);
  if(e.operation==='lookup')return Response.json({id,provider_id:'subscription-qa'});
  if(e.operation==='subscription.sync'){assert.equal(e.data.status,'cancelled');return Response.json({ok:true});}
  throw Error('Operação inesperada');
 });
 const gateway=new MercadoPago({accessToken:'fixture-token',collectorId:'123',mode:'test'},async(_url,options)=>{if(options.method==='PUT')cancelled++;return Response.json({id:'subscription-qa',external_reference:id,collector_id:123,status:options.method==='PUT'?'cancelled':'authorized'});});
 const billing=new BillingDomain(central,{secret:'d'.repeat(64),gateway});
 await assert.rejects(billing.cancel('Bearer fixture',crypto.randomUUID()),{status:403});assert.equal(cancelled,0);
 assert.deepEqual(await billing.cancel('Bearer fixture',id),{cancelled:true,refundIssued:false});assert.equal(cancelled,1);
});
