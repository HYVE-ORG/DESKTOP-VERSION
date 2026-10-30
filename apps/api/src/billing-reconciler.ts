import {ensure} from './errors';
import type {MercadoPago} from './mercadopago';
type Command=(operation:string,data:unknown)=>Promise<any>;
function cents(value:unknown){const s=String(value);ensure(/^\d{1,9}(\.\d{1,2})?$/.test(s),'Valor de cobrança incompatível.',502);const [whole,fraction='']=s.split('.');const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));ensure(Number.isSafeInteger(n),'Valor de cobrança inválido.',502);return n;}
function instant(value:unknown){ensure(typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value)),'Data de cobrança inválida.',502);return new Date(value);}
export function verifiedReceipt(checkout:any,subscription:any,invoice:any,payment:any){
 ensure(subscription.id===checkout.provider_id&&subscription.external_reference===checkout.id&&invoice.preapproval_id===subscription.id,'Vínculo de assinatura divergente.',502);
 ensure(String(invoice.payment?.id)===String(payment.id)&&subscription.payer_id!=null&&String(payment.payer?.id)===String(subscription.payer_id),'Pagador ou pagamento divergente.',502);
 const q=checkout.quote;
 ensure(q.currency==='BRL'&&q.intervalMonths===1&&invoice.currency_id==='BRL'&&payment.currency_id==='BRL'&&subscription.auto_recurring?.currency_id==='BRL'&&subscription.auto_recurring.frequency===1&&subscription.auto_recurring.frequency_type==='months','Recorrência ou moeda divergente.',502);
 ensure([invoice.transaction_amount,payment.transaction_amount,subscription.auto_recurring.transaction_amount].every(n=>cents(n)===q.priceCents),'Valor diferente do contrato.',502);
 ensure(['authorized','cancelled'].includes(subscription.status)||payment.status!=='approved','Autorização ainda não confirmada.',409);
 const start=instant(invoice.debit_date),end=new Date(start);const day=end.getUTCDate();end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+1);const last=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate();end.setUTCDate(Math.min(day,last));
 const states:Record<string,string>={approved:'approved',pending:'pending',in_process:'pending',authorized:'pending',rejected:'rejected',cancelled:'cancelled',refunded:'refunded',charged_back:'charged_back'};
 let status=states[payment.status];ensure(status,'Estado de pagamento desconhecido.',502);
 const refundedCents=cents(payment.transaction_amount_refunded||0);ensure(refundedCents<=q.priceCents,'Estorno excede o valor da competência.',502);
 if(status==='approved'&&refundedCents===q.priceCents)status='refunded';
 return {checkoutId:checkout.id,subscriptionId:subscription.id,paymentId:String(payment.id),invoiceId:String(invoice.id),status,amountCents:q.priceCents,refundedCents,currency:'BRL',periodStart:start.toISOString(),periodEnd:end.toISOString(),providerUpdatedAt:instant(payment.date_last_updated).toISOString()};
}
export class BillingReconciler {
 private running=false;
 constructor(private readonly gateway:MercadoPago,private readonly command:Command){}
 async reconcile(id:string){
  let checkout=await this.command('lookup',{id});
  if(!checkout.provider_id){
   const found=await this.gateway.searchSubscription(checkout.id);const matches=(found.results||[]).filter((s:any)=>s.external_reference===checkout.id);
   ensure(matches.length===1,'Criação ainda ambígua; conferir na conta recebedora.',409);
   const remote=await this.gateway.getSubscription(matches[0].id);
   checkout=await this.command('attach',{id:checkout.id,providerId:remote.id,checkoutUrl:remote.init_point});
  }
  const subscription=await this.gateway.getSubscription(checkout.provider_id);
  ensure(subscription.external_reference===checkout.id,'Assinatura não corresponde à contratação.',502);
  await this.command('subscription.sync',{id:checkout.id,providerId:subscription.id,status:subscription.status});
  for(let offset=0;offset<=10000;offset+=50){
   const list=await this.gateway.searchInvoices(subscription.id,offset);ensure(Array.isArray(list.results),'Lista de faturas inválida.',502);
   for(const row of list.results){const invoice=await this.gateway.getInvoice(String(row.id));if(!invoice.payment?.id)continue;const payment=await this.gateway.getPayment(String(invoice.payment.id));await this.command('payment.sync',verifiedReceipt(checkout,subscription,invoice,payment));}
   if(list.results.length<50)return;
  }
  throw Error('Conciliação excedeu o limite operacional de faturas.');
 }
 async tick(){
  if(this.running)return;this.running=true;
  try{
   const jobs=await this.command('jobs.claim',{});
   for(const job of jobs){let success=false;try{
    // Não confiar em URLs, valores ou estado do webhook. Lista própria de contratos
    // e consultas autenticadas cobrem também notificações com tópico adulterado.
    const list=await this.command('reconcile.list',{});for(const checkout of list)await this.reconcile(checkout.id);success=true;
   }catch{/* Inbox mantém o evento para nova tentativa; não registrar segredo. */}
   await this.command('jobs.finish',{id:job.id,leaseId:job.lease_id,success});}
   const list=await this.command('reconcile.list',{});for(const checkout of list)await this.reconcile(checkout.id).catch(()=>{});
  }finally{this.running=false;}
 }
}
