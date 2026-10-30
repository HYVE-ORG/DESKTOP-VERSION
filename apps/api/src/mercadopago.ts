import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {QuoteSnapshot} from '../../../packages/contracts/billing';
import {validateQuoteSnapshot} from './billing-rules';
import {DomainError,ensure} from './errors';
type RemoteFetch=(url:string,options:RequestInit)=>Promise<Response>;
type Config={accessToken:string;collectorId:string;mode:'test'|'production'};
export class MercadoPagoError extends DomainError {constructor(message:string,status=503,public readonly ambiguous=false){super(message,status);}}
const providerId=(id:string)=>{ensure(/^[a-zA-Z0-9_-]{1,100}$/.test(id),'Identificador de cobrança inválido.',400);return id;};
export function validateCheckoutUrl(value:string){
 const url=new URL(value);ensure(url.protocol==='https:'&&url.hostname==='www.mercadopago.com.br'&&(!url.port||url.port==='443')&&!url.username&&!url.password&&url.pathname==='/subscriptions/checkout'&&!url.hash,'O serviço retornou um checkout não autorizado.',502);return url;
}
export function verifyMercadoPagoWebhook(headers:Record<string,unknown>,dataId:string,secret:string,now=Date.now()){
 ensure(secret.length>=16,'Webhook de cobrança não configurado.',503);
 const signature=headers['x-signature'],request=headers['x-request-id'];
 ensure(typeof signature==='string'&&signature.length<=500&&typeof request==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(request),'Notificação inválida.',401);
 ensure(/^[a-zA-Z0-9_-]{1,100}$/.test(dataId),'Notificação inválida.',401);
 const entries=signature.split(',').map(s=>s.trim().split('='));
 ensure(entries.length===2&&entries.every(e=>e.length===2)&&new Set(entries.map(e=>e[0])).size===2,'Notificação inválida.',401);
 const fields=Object.fromEntries(entries),ts=fields.ts,hash=fields.v1;
 ensure(/^\d{10,13}$/.test(ts||'')&&/^[a-f0-9]{64}$/.test(hash||''),'Notificação inválida.',401);
 const stamp=Number(ts)*(ts.length===13?1:1000);ensure(Number.isFinite(now)&&Math.abs(now-stamp)<=300000,'Notificação expirada.',401);
 const id=dataId.toLowerCase(),expected=createHmac('sha256',secret).update(`id:${id};request-id:${request};ts:${ts};`).digest();
 ensure(timingSafeEqual(expected,Buffer.from(hash,'hex')),'Notificação inválida.',401);return id;
}
export class MercadoPago {
 constructor(private readonly config:Config,private readonly remote:RemoteFetch=fetch){
  ensure(config.accessToken.length>0&&!/[\r\n]/.test(config.accessToken)&&/^\d{1,20}$/.test(config.collectorId)&&['test','production'].includes(config.mode),'Configuração de cobrança inválida.',503);
 }
 private async request(path:string,method='GET',body?:unknown){
  let response:Response;
  try{response=await this.remote('https://api.mercadopago.com'+path,{method,headers:{Authorization:'Bearer '+this.config.accessToken,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});}
  catch{throw new MercadoPagoError(method==='POST'?'Não foi possível confirmar a criação. Aguarde a conciliação antes de tentar outra assinatura.':'O serviço de cobrança está indisponível.',503,method==='POST');}
  if(!response.ok){await response.body?.cancel();throw new MercadoPagoError(response.status===404?'Cobrança não encontrada.':'O serviço de cobrança não concluiu a solicitação.',response.status===404?404:503,method==='POST'&&(response.status>=500||[408,429].includes(response.status)));}
  try{
   ensure(response.body,'Resposta de cobrança inválida.',502);const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
   try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;ensure(size<=1024*1024,'Resposta de cobrança inválida.',502);chunks.push(part.value);}}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));ensure(result&&typeof result==='object'&&!Array.isArray(result),'Resposta de cobrança inválida.',502);return result;
  }catch{throw new MercadoPagoError('O serviço retornou uma resposta de cobrança inválida.',502,method==='POST');}
 }
 private subscription(value:any,id?:string){
  ensure(typeof value.id==='string'&&(!id||value.id===id)&&String(value.collector_id)===this.config.collectorId,'A assinatura não pertence à conta configurada.',502);
  providerId(value.id);return value;
 }
 async createSubscription(input:{reference:string;email:string;quote:QuoteSnapshot;backUrl:string}){
  z.uuid().parse(input.reference);z.email().max(200).parse(input.email);const {planId,version,priceCents,currency,intervalMonths,limits}=input.quote;
  const quote=validateQuoteSnapshot({planId,version,priceCents,currency,intervalMonths,limits});
  const back=new URL(input.backUrl);ensure(back.protocol==='https:'&&!back.username&&!back.password,'O retorno da cobrança exige HTTPS.',503);
  const result=await this.request('/preapproval','POST',{reason:`Forma ${quote.planId==='essential'?'Essencial':quote.planId==='pro'?'Pro':'Empresarial'} — mensal`,external_reference:input.reference,payer_email:input.email,auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:quote.priceCents/100,currency_id:'BRL'},back_url:back.href,status:'pending'});
  try{this.subscription(result);validateCheckoutUrl(result.init_point);return result;}catch{throw new MercadoPagoError('A criação exige conciliação antes de uma nova tentativa.',502,true);}
 }
 async getSubscription(id:string){return this.subscription(await this.request('/preapproval/'+providerId(id)),id);}
 async searchSubscription(reference:string){z.uuid().parse(reference);return this.request('/preapproval/search?external_reference='+encodeURIComponent(reference)+'&limit=20');}
 getInvoice(id:string){return this.request('/authorized_payments/'+providerId(id));}
 searchInvoices(subscriptionId:string,offset=0){ensure(Number.isInteger(offset)&&offset>=0&&offset<=10000,'Página inválida.',400);return this.request('/authorized_payments/search?preapproval_id='+providerId(subscriptionId)+'&limit=50&offset='+offset);}
 async getPayment(id:string){const payment=await this.request('/v1/payments/'+providerId(id));ensure(String(payment.collector_id)===this.config.collectorId&&typeof payment.live_mode==='boolean'&&payment.live_mode===(this.config.mode==='production'),'O pagamento não pertence ao ambiente configurado.',502);return payment;}
 async cancelSubscription(id:string){const subscription=await this.getSubscription(id);if(['cancelled','canceled'].includes(subscription.status))return subscription;return this.subscription(await this.request('/preapproval/'+providerId(id),'PUT',{status:'cancelled'}),id);}
}
