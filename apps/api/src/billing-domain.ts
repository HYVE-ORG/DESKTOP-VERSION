import {createHmac,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {PUBLIC_PLANS} from '../../../packages/contracts/billing';
import {parseEnterpriseOffer,quoteSchema} from './billing-rules';
import type {CentralDomain} from './central-domain';
import {MercadoPago,MercadoPagoError,validateCheckoutUrl,verifyMercadoPagoWebhook} from './mercadopago';
import {ensure} from './errors';
import {BillingReconciler} from './billing-reconciler';
const checkoutSchema=z.object({requestId:z.uuid(),planId:z.enum(['essential','pro']).optional(),planVersion:z.number().int().positive().optional(),offerId:z.uuid().optional(),company:z.string().trim().min(2).max(80),termsVersion:z.string().min(1).max(80)}).strict().refine(v=>(!!v.planId!==!!v.offerId)&&(!v.planId||!!v.planVersion));
const checkoutRecord=z.object({id:z.uuid(),quote:quoteSchema,payer_email:z.email(),status:z.string(),company:z.string().optional(),checkout_url:z.string().nullable().optional(),studio_id:z.uuid().nullable().optional(),shouldCreate:z.boolean().optional()});
interface Config {secret?:string;gateway?:MercadoPago;checkoutEnabled?:boolean;backUrl?:string;webhookSecret?:string;termsVersion?:string;}
// Só remover após o aceite de entrega descrito no desenho comercial:
// conta recebedora/testes, HTTPS, mídia real, desktop remoto e operação.
const CHECKOUT_RELEASE_READY=false;
export class BillingDomain {
 constructor(private readonly central:CentralDomain,private readonly config:Config){if(config.secret!==undefined)ensure(/^[a-f0-9]{64}$/.test(config.secret),'Configuração de cobrança inválida.',503);}
 status(){return {plans:PUBLIC_PLANS,checkoutEnabled:!!(this.config.checkoutEnabled&&this.config.gateway&&this.config.secret&&this.config.backUrl&&this.config.termsVersion),termsVersion:this.config.termsVersion||null,enterprise:'private-offer',stage:'preparation'};}
 async catalog(){const schema=quoteSchema.extend({id:z.enum(['essential','pro']),name:z.string()});const plans=z.array(schema).length(2).parse(await this.central.billingPlans());ensure(new Set(plans.map(p=>p.id)).size===2&&plans.every(p=>p.planId===p.id),'Catálogo inválido.',503);return {...this.status(),plans};}
 account(auth:string|undefined){return this.central.billingAccount(auth);}
 receipts(auth:string|undefined){return this.central.billingReceipts(auth);}
 requests(auth:string|undefined){return this.central.billingRequests(auth);}
 request(auth:string|undefined,body:unknown){const input=z.object({requestId:z.uuid(),kind:z.enum(['enterprise','refund','plan_change','help']),checkoutId:z.uuid().optional(),message:z.string().trim().min(2).max(4000)}).strict().parse(body);return this.central.billingRequestCreate(auth,input);}
 respondRequest(auth:string|undefined,id:string,body:unknown){z.uuid().parse(id);const input=z.object({response:z.string().trim().min(2).max(4000)}).strict().parse(body);return this.central.billingRequestRespond(auth,id,input.response);}
 private async owned(auth:string|undefined,id:string){
  z.uuid().parse(id);const account=await this.account(auth) as {checkouts?:{id:string}[]};
  ensure(Array.isArray(account.checkouts)&&account.checkouts.some(c=>c.id===id),'Essa contratação não pertence à sua conta.',403);
  return this.command('lookup',{id}) as Promise<any>;
 }
 async cancel(auth:string|undefined,id:string){
  const checkout=await this.owned(auth,id);ensure(this.config.gateway,'O serviço de cobrança ainda não foi configurado.',503);
  ensure(checkout.provider_id,'A criação ainda precisa ser conciliada antes do cancelamento.',409);
  const subscription=await this.config.gateway.getSubscription(checkout.provider_id);ensure(subscription.external_reference===id,'Assinatura divergente.',502);
  const cancelled=await this.config.gateway.cancelSubscription(checkout.provider_id);ensure(cancelled.status==='cancelled','O cancelamento ainda não foi confirmado.',503);
  await this.command('subscription.sync',{id,providerId:cancelled.id,status:cancelled.status});return {cancelled:true,refundIssued:false};
 }
 async reconcileOwn(auth:string|undefined,id:string){await this.owned(auth,id);const reconciler=this.reconciler();ensure(reconciler,'Conciliação ainda não configurada.',503);await reconciler.reconcile(id);return {checked:true};}
 reconciler(){return this.config.gateway&&this.config.secret?new BillingReconciler(this.config.gateway,(op,data)=>this.command(op,data)):undefined;}
 async command(operation:string,data:unknown,auth?:string){
  ensure(this.config.secret,'A administração ainda não configurou a cobrança.',503);
  const payload=JSON.stringify({operation,nonce:randomUUID(),timestamp:Math.floor(Date.now()/1000),data});
  const proof=createHmac('sha256',this.config.secret).update(payload).digest('hex');
  return this.central.billingServer(auth,payload,proof);
 }
 async checkout(auth:string|undefined,body:unknown){
  const input=checkoutSchema.parse(body);ensure(auth,'Entre na conta online.',401);
  ensure(this.status().checkoutEnabled,'As assinaturas ainda estão em preparação. Nenhuma cobrança foi iniciada.',503);
  ensure(input.termsVersion===this.config.termsVersion,'As condições da oferta mudaram. Reabra o resumo antes de contratar.',409);
  const prepared=checkoutRecord.parse(await this.command('prepare',input,auth));const claimed=checkoutRecord.parse(await this.command('claim',{id:prepared.id},auth));
  if(!claimed.shouldCreate)return this.publicCheckout(claimed);
  try{
   const subscription=await this.config.gateway!.createSubscription({reference:claimed.id,email:claimed.payer_email,quote:claimed.quote,backUrl:this.config.backUrl!});
   ensure(subscription.external_reference===claimed.id,'A criação precisa ser conciliada.',502);
   return this.publicCheckout(await this.command('attach',{id:claimed.id,providerId:subscription.id,checkoutUrl:subscription.init_point}));
  }catch(e){
   // Após o claim, qualquer erro pode ocorrer depois de criar a recorrência.
   // Manter bloqueada até conciliação; nunca repetir POST automaticamente.
   await this.command('ambiguous',{id:claimed.id}).catch(()=>{});
   if(e instanceof MercadoPagoError)throw e;throw e;
  }
 }
 private publicCheckout(value:any){return {id:value.id,status:value.status,quote:value.quote,company:value.company,studioId:value.studio_id||null,checkoutUrl:value.checkout_url?validateCheckoutUrl(value.checkout_url).href:null};}
 async createOffer(auth:string|undefined,body:unknown){
  const input=z.object({offer:z.unknown(),supersedes:z.uuid().optional()}).strict().parse(body);const offer=parseEnterpriseOffer(input.offer);
  ensure(Date.parse(offer.expiresAt)>Date.now(),'A validade da proposta precisa ser futura.',400);
  return this.command('offer.create',{...offer,supersedes:input.supersedes||null,quote:{planId:'enterprise',version:1,priceCents:offer.priceCents,currency:'BRL',intervalMonths:1,limits:offer.limits}},auth);
 }
 revokeOffer(auth:string|undefined,id:string){z.uuid().parse(id);return this.command('offer.revoke',{id},auth);}
 async webhook(headers:Record<string,unknown>,query:unknown,body:unknown){
  ensure(this.config.webhookSecret,'Notificações de cobrança ainda não configuradas.',503);
  const q=z.object({'data.id':z.string().min(1).max(100)}).passthrough().parse(query);
  const event=z.object({id:z.union([z.string(),z.number()]).optional(),type:z.enum(['payment','subscription_preapproval','subscription_authorized_payment','topic_chargebacks_wh']),data:z.object({id:z.union([z.string(),z.number()])})}).passthrough().parse(body);
  ensure(String(event.data.id).toLowerCase()===q['data.id'].toLowerCase(),'Identificador da notificação divergente.',401);
  const id=verifyMercadoPagoWebhook(headers,q['data.id'],this.config.webhookSecret);
  // Assinatura valida recurso/request/timestamp; o tópico será conferido pela API.
  const dedup=createHmac('sha256',this.config.webhookSecret).update([headers['x-request-id'],headers['x-signature'],event.type,id].join('|')).digest('hex');
  await this.command('webhook',{dedup,topic:event.type,resourceId:id});return {received:true};
 }
}
export function billingFromEnv(central:CentralDomain|undefined,env:NodeJS.ProcessEnv){
 if(!central)return undefined;
 const configured=!!env.MERCADOPAGO_ACCESS_TOKEN;
 const gateway=configured?new MercadoPago({accessToken:env.MERCADOPAGO_ACCESS_TOKEN!,collectorId:env.MERCADOPAGO_COLLECTOR_ID||'',mode:env.MERCADOPAGO_MODE==='production'?'production':'test'}):undefined;
 return new BillingDomain(central,{secret:env.FORMA_BILLING_SECRET,gateway,webhookSecret:env.MERCADOPAGO_WEBHOOK_SECRET,backUrl:env.FORMA_BILLING_BACK_URL,termsVersion:env.FORMA_BILLING_TERMS_VERSION,checkoutEnabled:CHECKOUT_RELEASE_READY&&env.FORMA_BILLING_SALES_ENABLED==='true'});
}
