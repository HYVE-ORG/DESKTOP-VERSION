import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PUBLIC_PLANS} from '../packages/contracts/billing';
import {parseEnterpriseOffer,subscriptionAccess,validateQuoteSnapshot,quoteFingerprint} from '../apps/api/src/billing-rules';
const limits={members:30,workspaces:10,projects:50,storageBytes:250000000,participantMinutes:1000,roomParticipants:8};
test('catálogo público tem somente dois planos e Essencial custa79 reais',()=>{
 assert.deepEqual(PUBLIC_PLANS.map(p=>[p.id,p.priceCents]),[['essential',7900],['pro',14900]]);
 assert.deepEqual(PUBLIC_PLANS[0].limits,{members:10,workspaces:3,projects:10,storageBytes:100000000,participantMinutes:300,roomParticipants:8});
 assert.deepEqual(PUBLIC_PLANS[1].limits,limits);assert.ok(Object.isFrozen(PUBLIC_PLANS[0].limits));
});
test('proposta empresarial é privada, precisa de valores inteiros positivos e destinatário',()=>{
 const offer={recipientId:crypto.randomUUID(),name:'Empresa QA',priceCents:29900,limits,expiresAt:'2026-11-25T12:00:00.000Z',notes:'Proposta inicial'};
 assert.equal(parseEnterpriseOffer(offer).priceCents,29900);
 for(const patch of [{priceCents:0},{priceCents:1.5},{priceCents:'29900'},{recipientId:'other'},{limits:{...limits,members:0}},{limits:{...limits,roomParticipants:9}},{operator:true}])assert.throws(()=>parseEnterpriseOffer({...offer,...patch}));
});
test('snapshot versionado mantém centavos, moeda e fingerprint de contrato',()=>{
 const quote={planId:'essential',version:1,priceCents:7900,currency:'BRL',intervalMonths:1,limits:PUBLIC_PLANS[0].limits};
 assert.equal(validateQuoteSnapshot(quote).priceCents,7900);
 assert.equal(quoteFingerprint(quote),quoteFingerprint({...quote,limits:{...quote.limits}}));
 assert.notEqual(quoteFingerprint(quote),quoteFingerprint({...quote,priceCents:8000}));
 assert.throws(()=>validateQuoteSnapshot({...quote,currency:'USD'}));
});
test('cancelar preserva período pago; tolerância7dias não vira novo pagamento',()=>{
 const end='2026-10-25T12:00:00.000Z';
 assert.equal(subscriptionAccess(end,true,new Date('2026-10-25T11:59:59Z')),'active');
 assert.equal(subscriptionAccess(end,true,new Date(end)),'read_only');
 assert.equal(subscriptionAccess(end,false,new Date('2026-10-30T12:00:00Z')),'grace');
 assert.equal(subscriptionAccess(end,false,new Date('2026-11-01T12:00:00Z')),'read_only');
 assert.equal(subscriptionAccess(null,false,new Date(end)),'pending');
 assert.throws(()=>subscriptionAccess('invalid',false,new Date(end)));
});
