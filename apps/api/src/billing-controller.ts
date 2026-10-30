import {Controller,Get,Post,Req,Body,Param,Query} from '@nestjs/common';
import type {Request} from 'express';
import type {BillingDomain} from './billing-domain';
import {centralAuthorization} from './central-session';
import {PUBLIC_PLANS} from '../../../packages/contracts/billing';
import {ensure} from './errors';
import {z} from 'zod';
export function createBillingController(options:{billing?:BillingDomain;guard:(req:Request)=>void;webhookLimit:(req:Request)=>void}){
 const domain=()=>{ensure(options.billing,'A cobrança ainda não está configurada.',503);return options.billing;};
 const auth=(req:Request)=>{const authorization=centralAuthorization(req.headers);ensure(authorization,'Entre na conta online.',401);return authorization;};
 @Controller('api/central/billing')
 class BillingApi {
  @Get('status') status(){return options.billing?.catalog()||{plans:PUBLIC_PLANS,checkoutEnabled:false,termsVersion:null,enterprise:'private-offer',stage:'preparation'};}
  @Get('account') account(@Req() req:Request){const authorization=auth(req);return domain().account(authorization);}
  @Get('receipts') receipts(@Req() req:Request){const authorization=auth(req);return domain().receipts(authorization);}
  @Get('requests') requests(@Req() req:Request){const authorization=auth(req);return domain().requests(authorization);}
  @Post('requests') request(@Req() req:Request,@Body() body:unknown){options.guard(req);const authorization=auth(req);return domain().request(authorization,body);}
  @Post('requests/:id/respond') respond(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){options.guard(req);const authorization=auth(req);return domain().respondRequest(authorization,id,body);}
  @Post('checkout') checkout(@Req() req:Request,@Body() body:unknown){options.guard(req);const authorization=auth(req);return domain().checkout(authorization,body);}
  @Post('offers') offer(@Req() req:Request,@Body() body:unknown){options.guard(req);const authorization=auth(req);return domain().createOffer(authorization,body);}
  @Post('checkouts/:id/cancel') cancel(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){options.guard(req);const authorization=auth(req);z.object({confirm:z.literal(true)}).strict().parse(body);return domain().cancel(authorization,id);}
  @Post('checkouts/:id/reconcile') reconcile(@Req() req:Request,@Param('id') id:string){options.guard(req);const authorization=auth(req);return domain().reconcileOwn(authorization,id);}
  @Post('offers/:id/revoke') revoke(@Req() req:Request,@Param('id') id:string){options.guard(req);const authorization=auth(req);return domain().revokeOffer(authorization,id);}
  @Post('webhook') webhook(@Req() req:Request,@Query() query:unknown,@Body() body:unknown){options.webhookLimit(req);return domain().webhook(req.headers,query,body);}
 }
 return BillingApi;
}
