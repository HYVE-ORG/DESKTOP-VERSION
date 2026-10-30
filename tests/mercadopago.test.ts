import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {MercadoPago,verifyMercadoPagoWebhook,validateCheckoutUrl} from '../apps/api/src/mercadopago';
import {PUBLIC_PLANS} from '../packages/contracts/billing';
const secret='webhook-fixture-secret',ts='1792933200',request='req-qa-1',resource='abc123';
const signature=createHmac('sha256',secret).update(`id:${resource};request-id:${request};ts:${ts};`).digest('hex');
test('webhook exige HMAC válido, query identificada e timestamp recente',()=>{
 const h={'x-signature':`ts=${ts},v1=${signature}`,'x-request-id':request};const now=Number(ts)*1000;
 assert.equal(verifyMercadoPagoWebhook(h,'ABC123',secret,now),resource);
 for(const [headers,id,key,time] of [[h,'other',secret,now],[h,resource,'bad',now],[h,resource,secret,now+301000],[{'x-signature':`ts=${ts},v1=${'a'.repeat(64)}`,'x-request-id':request},resource,secret,now],[{'x-signature':[h['x-signature']],'x-request-id':request},resource,secret,now]] as const)assert.throws(()=>verifyMercadoPagoWebhook(headers,id,key,time));
 assert.throws(()=>verifyMercadoPagoWebhook({...h,'x-signature':h['x-signature']+',v1='+signature},resource,secret,now));
});
test('checkout só aceita HTTPS do Mercado Pago brasileiro no caminho de assinatura',()=>{
 assert.equal(validateCheckoutUrl('https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=abc').hostname,'www.mercadopago.com.br');
 for(const url of ['https://mercadopago.com.br.evil.invalid/subscriptions/checkout','http://www.mercadopago.com.br/subscriptions/checkout','https://user:pass@www.mercadopago.com.br/subscriptions/checkout','https://www.mercadopago.com.br/other'])assert.throws(()=>validateCheckoutUrl(url));
});
test('assinatura usa contrato do servidor, pending e BRL sem dados de cartão',async()=>{
 const calls:any[]=[];const gateway=new MercadoPago({accessToken:'fixture-token',collectorId:'123',mode:'test'},async(url,options)=>{calls.push({url,options});return Response.json({id:'abc123',collector_id:123,init_point:'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=abc123',status:'pending'});});
 await gateway.createSubscription({reference:crypto.randomUUID(),email:'qa@example.invalid',quote:PUBLIC_PLANS[0],backUrl:'https://forma.example.invalid/#central'});
 const body=JSON.parse(calls[0].options.body);assert.equal(body.auto_recurring.transaction_amount,79);assert.equal(body.status,'pending');assert.equal(body.auto_recurring.currency_id,'BRL');assert.equal(body.card_token_id,undefined);assert.equal(calls[0].url,'https://api.mercadopago.com/preapproval');assert.equal(calls[0].options.redirect,'error');
});
test('timeout de criação é ambíguo e não faz retry automático nem expõe segredo',async()=>{
 let calls=0;const gateway=new MercadoPago({accessToken:'private-secret',collectorId:'123',mode:'test'},async()=>{calls++;throw Error('private-secret');});
 await assert.rejects(gateway.createSubscription({reference:crypto.randomUUID(),email:'qa@example.invalid',quote:PUBLIC_PLANS[0],backUrl:'https://forma.example.invalid/#central'}),(e:any)=>e.status===503&&e.ambiguous===true&&!e.message.includes('private-secret'));assert.equal(calls,1);
});
test('consultas validam identificador e conta recebedora, falhas não vazam corpo',async()=>{
 const gateway=new MercadoPago({accessToken:'fixture-token',collectorId:'123',mode:'test'},async()=>Response.json({id:'abc123',collector_id:999,status:'pending'}));
 await assert.rejects(gateway.getSubscription('abc123'),{status:502});
 await assert.rejects(gateway.getSubscription('../users/me'));
 const denied=new MercadoPago({accessToken:'fixture-token',collectorId:'123',mode:'test'},async()=>Response.json({message:'internal-private-info'},{status:401}));
 await assert.rejects(denied.getSubscription('abc123'),(e:any)=>e.status===503&&!e.message.includes('internal-private-info'));
});
