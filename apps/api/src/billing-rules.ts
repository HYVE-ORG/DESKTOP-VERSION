import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {QuoteSnapshot,SubscriptionAccess} from '../../../packages/contracts/billing';
const positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const planLimitsSchema=z.object({members:positive.max(10000),workspaces:positive.max(10000),projects:positive.max(100000),storageBytes:positive,participantMinutes:positive,roomParticipants:positive.max(8)}).strict();
export const quoteSchema=z.object({planId:z.enum(['essential','pro','enterprise']),version:positive,priceCents:positive.max(100000000),currency:z.literal('BRL'),intervalMonths:z.literal(1),limits:planLimitsSchema}).strict();
const enterpriseSchema=z.object({recipientId:z.uuid(),name:z.string().trim().min(2).max(100),priceCents:positive.max(100000000),limits:planLimitsSchema,expiresAt:z.iso.datetime(),notes:z.string().max(4000)}).strict();
export const parseEnterpriseOffer=(value:unknown)=>enterpriseSchema.parse(value);
export const validateQuoteSnapshot=(value:unknown):QuoteSnapshot=>quoteSchema.parse(value);
export function quoteFingerprint(value:unknown){
 const q=validateQuoteSnapshot(value),l=q.limits;
 return createHash('sha256').update(JSON.stringify([q.planId,q.version,q.priceCents,q.currency,q.intervalMonths,l.members,l.workspaces,l.projects,l.storageBytes,l.participantMinutes,l.roomParticipants])).digest('hex');
}
export function subscriptionAccess(coverageEnd:string|null,cancelled:boolean,now=new Date()):SubscriptionAccess{
 if(!Number.isFinite(now.getTime()))throw Error('Data de consulta inválida');
 if(!coverageEnd)return 'pending';const end=Date.parse(coverageEnd);
 if(!Number.isFinite(end))throw Error('Cobertura inválida');
 return now.getTime()<end?'active':!cancelled&&now.getTime()<end+7*86400000?'grace':'read_only';
}
