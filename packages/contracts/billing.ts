export interface PlanLimits {members:number;workspaces:number;projects:number;storageBytes:number;participantMinutes:number;roomParticipants:number;}
export interface QuoteSnapshot {planId:'essential'|'pro'|'enterprise';version:number;priceCents:number;currency:'BRL';intervalMonths:1;limits:PlanLimits;}
export interface PublicPlan extends QuoteSnapshot {id:'essential'|'pro';name:string;}
// Valores em centavos; nunca aceitar preço do navegador para criar uma assinatura.
export const PUBLIC_PLANS:readonly PublicPlan[]=Object.freeze([
 Object.freeze({id:'essential',planId:'essential',name:'Forma Essencial',version:1,priceCents:7900,currency:'BRL',intervalMonths:1,limits:Object.freeze({members:10,workspaces:3,projects:10,storageBytes:100000000,participantMinutes:300,roomParticipants:8})}),
 Object.freeze({id:'pro',planId:'pro',name:'Forma Pro',version:1,priceCents:14900,currency:'BRL',intervalMonths:1,limits:Object.freeze({members:30,workspaces:10,projects:50,storageBytes:250000000,participantMinutes:1000,roomParticipants:8})})
]);
export type SubscriptionAccess='pending'|'active'|'grace'|'read_only';
