import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifiedReceipt} from '../apps/api/src/billing-reconciler';
const checkout={id:crypto.randomUUID(),provider_id:'subscription-qa',quote:{priceCents:7900,currency:'BRL',intervalMonths:1}};
const subscription={id:'subscription-qa',external_reference:checkout.id,payer_id:22,status:'authorized',auto_recurring:{currency_id:'BRL',transaction_amount:79,frequency:1,frequency_type:'months'}};
const invoice={id:33,preapproval_id:'subscription-qa',payment:{id:44},currency_id:'BRL',transaction_amount:'79.00',debit_date:'2026-01-31T12:00:00.000Z'};
const payment={id:44,payer:{id:22},status:'approved',transaction_amount:79,transaction_amount_refunded:0,currency_id:'BRL',date_last_updated:'2026-01-31T12:00:01.000Z'};
test('recibo confere vínculo/valor e ciclo mensal preserva fim de mês',()=>{
 const receipt=verifiedReceipt(checkout,subscription,invoice,payment);assert.equal(receipt.amountCents,7900);assert.equal(receipt.periodEnd,'2026-02-28T12:00:00.000Z');assert.equal(receipt.status,'approved');
 assert.equal(verifiedReceipt(checkout,subscription,invoice,{...payment,status:'refunded',transaction_amount_refunded:79}).status,'refunded');
 const partial=verifiedReceipt(checkout,subscription,invoice,{...payment,transaction_amount_refunded:0.01});assert.equal(partial.status,'approved');assert.equal(partial.refundedCents,1);
 for(const patch of [{transaction_amount:1},{currency_id:'USD'},{payer:{id:99}},{id:45},{date_last_updated:'invalid'}])assert.throws(()=>verifiedReceipt(checkout,subscription,invoice,{...payment,...patch}));
 assert.throws(()=>verifiedReceipt(checkout,{...subscription,external_reference:crypto.randomUUID()},invoice,payment));
 assert.throws(()=>verifiedReceipt(checkout,subscription,{...invoice,preapproval_id:'other'},payment));
 assert.throws(()=>verifiedReceipt(checkout,{...subscription,status:'pending'},invoice,payment));
});
