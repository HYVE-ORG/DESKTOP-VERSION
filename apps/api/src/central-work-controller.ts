import {Controller,Get,Post,Req,Res,Param,Query,Body} from '@nestjs/common';
import type {Request,Response} from 'express';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {CentralDomain} from './central-domain';
import {centralAuthorization} from './central-session';
import {parseWorkAction,uploadProof,workOperationId} from './central-work';
import {detectFile} from './files';
import {DomainError,ensure} from './errors';
import type {OnlineFile} from '../../../packages/contracts/central-work';
import {exportStudio} from './studio-export';
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const publicFile=(file:OnlineFile)=>{const {object_key,...view}=file;return view;};
export function createCentralWorkController(options:{domain:()=>CentralDomain;guard:(req:Request)=>void;uploadVerifier?:string}){
 let activeExports=0;
 const purge=async(domain:CentralDomain,auth:string|undefined,key:string)=>{
  await domain.storageDelete(auth,key);
  try{await domain.storageDownload(auth,key);}
  catch(e){if(e instanceof DomainError&&e.status===404){await domain.confirmFilePurge(auth,key.split('/')[1]);return;}throw new DomainError('Arquivo retirado. A limpeza dos bytes ainda precisa ser confirmada; tente novamente.',503);}
  throw new DomainError('Arquivo retirado. A limpeza dos bytes ainda precisa ser confirmada; tente novamente.',503);
 };
 @Controller('api/central')
 class CentralWorkApi {
  @Post('studios/:id/export')
  async export(@Req() req:Request,@Res({passthrough:true}) res:Response,@Param('id') id:string,@Body() body:unknown){
   options.guard(req);z.uuid().parse(id);z.object({}).strict().parse(body);
   ensure(activeExports<2,'Há outras exportações em andamento. Tente novamente em instantes.',429);
   const abort=new AbortController(),closed=()=>{if(!res.writableEnded)abort.abort();};
   res.on('close',closed);if(req.aborted||res.destroyed)abort.abort();activeExports++;
   try{
    const bytes=await exportStudio(options.domain(),centralAuthorization(req.headers),id,{signal:abort.signal});
    res.setHeader('Content-Type','application/x-ndjson; charset=utf-8');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Disposition',`attachment; filename="forma-studio-${id}.ndjson"`);
    res.status(200).end(bytes);
   }finally{activeExports--;res.off('close',closed);}
  }
  @Get('studios/:id/work')
  snapshot(@Req() req:Request,@Param('id') id:string){z.uuid().parse(id);return options.domain().workSnapshot(centralAuthorization(req.headers),id);}
  @Get('projects/:id/content')
  project(@Req() req:Request,@Param('id') id:string,@Query('after') after?:string){z.uuid().parse(id);if(after)z.uuid().parse(after);return options.domain().projectContent(centralAuthorization(req.headers),id,after);}
  @Get('conversations/:id/messages')
  messages(@Req() req:Request,@Param('id') id:string,@Query('before') before?:string){z.uuid().parse(id);if(before)z.uuid().parse(before);return options.domain().conversationMessages(centralAuthorization(req.headers),id,before);}
  @Get('documents/:id')
  document(@Req() req:Request,@Param('id') id:string,@Query('version') version?:string){z.uuid().parse(id);const v=version===undefined?undefined:z.coerce.number().int().positive().parse(version);return options.domain().documentRead(centralAuthorization(req.headers),id,v);}
  @Post('studios/:id/actions')
  action(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
   options.guard(req);z.uuid().parse(id);const action=parseWorkAction(body);
   return options.domain().workAction(centralAuthorization(req.headers),id,action.type,action.payload,action.requestId);
  }
  @Post('studios/:id/files')
  async upload(@Req() req:Request,@Res({passthrough:true}) res:Response,@Param('id') studioId:string,@Query() query:unknown){
   options.guard(req);z.uuid().parse(studioId);
   ensure(options.uploadVerifier&&/^[a-f0-9]{64}$/.test(options.uploadVerifier),'O envio de arquivos online ainda não está configurado.',503);
   const input=z.object({name:z.string().min(1).max(180),projectId:z.uuid().optional(),conversationId:z.uuid().optional(),requestId:z.uuid()}).strict().refine(p=>!!p.projectId!==!!p.conversationId).parse(query);
   ensure(Buffer.isBuffer(req.body),'Envie o conteúdo do arquivo.',400);
   const bytes=req.body as Buffer,mime=detectFile(input.name,bytes),sha256=hash(bytes),auth=centralAuthorization(req.headers),domain=options.domain();
   const reserved=await domain.workAction(auth,studioId,'file.reserve',{name:input.name,projectId:input.projectId||null,conversationId:input.conversationId||null,mime,size:bytes.length,sha256},input.requestId) as OnlineFile;
   const current=await domain.fileRead(auth,reserved.id) as OnlineFile;
   ensure(current.sha256===sha256&&current.size===bytes.length&&current.mime===mime,'O envio mudou. Inicie um novo envio.',409);
   if(current.status==='ready')return publicFile(current);
   ensure(current.status==='pending'&&Date.parse(current.expires_at)>Date.now(),'Esse envio expirou ou foi retirado. Inicie um novo envio.',409);
   const abort=new AbortController();const closed=()=>{if(!res.writableEnded)abort.abort();};res.on('close',closed);
   if(res.destroyed||req.aborted)abort.abort();
   try{
    try{await domain.storageUpload(auth,current.object_key,bytes,mime,abort.signal);}
    catch(error){
     if(!(error instanceof DomainError)||error.status!==409)throw error;
     const existing=await domain.storageDownload(auth,current.object_key);
     ensure(hash(existing)===sha256&&existing.length===bytes.length,'Arquivo recebido com conteúdo divergente. Retire o envio e tente novamente.',409);
    }
    ensure(!abort.signal.aborted,'Envio interrompido antes da publicação.',409);
    const proof=uploadProof(options.uploadVerifier,current);
    const ready=await domain.workAction(auth,studioId,'file.finish',{id:current.id,proof},workOperationId(input.requestId,'finish')) as OnlineFile;
    return publicFile(ready);
   }finally{res.off('close',closed);}
  }
  @Post('studios/:studioId/uploads/:requestId/cancel')
  async cancel(@Req() req:Request,@Param('studioId') studioId:string,@Param('requestId') requestId:string){
   options.guard(req);z.uuid().parse(studioId);z.uuid().parse(requestId);const domain=options.domain(),auth=centralAuthorization(req.headers);
   const result=await domain.cancelUpload(auth,studioId,requestId,workOperationId(requestId,'cancel')) as {object_key?:string};
   if(result.object_key)await purge(domain,auth,result.object_key);
   return {ok:true,canceled:true,cleanupChecked:true};
  }
  @Get('files/:id')
  async download(@Req() req:Request,@Res() res:Response,@Param('id') id:string){
   z.uuid().parse(id);const domain=options.domain(),auth=centralAuthorization(req.headers),file=await domain.fileRead(auth,id) as OnlineFile;
   ensure(file.status==='ready','Arquivo não disponível.',404);
   const bytes=await domain.storageDownload(auth,file.object_key);
   ensure(bytes.length===file.size&&hash(bytes)===file.sha256,'O arquivo não passou pela verificação de integridade.',503);
   const encoded=encodeURIComponent(file.name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
   res.setHeader('Content-Type',file.mime);res.setHeader('Content-Disposition',`${/^(image|audio|video)\//.test(file.mime)?'inline':'attachment'}; filename*=UTF-8''${encoded}`);
   res.setHeader('Cache-Control','no-store');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Accept-Ranges','bytes');
   if(req.headers.range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);let start=0,end=bytes.length-1;
    if(match){if(!match[1])start=Math.max(0,bytes.length-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}}
    if(!match||(!match[1]&&!match[2])||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=bytes.length){res.setHeader('Content-Range',`bytes */${bytes.length}`);res.status(416).end();return;}
    const part=bytes.subarray(start,end+1);res.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`);res.setHeader('Content-Length',part.length);res.status(206).end(part);return;
   }
   res.setHeader('Content-Length',bytes.length);res.end(bytes);
  }
  @Post('studios/:studioId/files/:id/delete')
  async remove(@Req() req:Request,@Param('studioId') studioId:string,@Param('id') id:string,@Body() body:unknown){
   options.guard(req);z.uuid().parse(studioId);z.uuid().parse(id);const {requestId}=z.object({requestId:z.uuid()}).strict().parse(body);
   const domain=options.domain(),auth=centralAuthorization(req.headers);
   const file=await domain.workAction(auth,studioId,'file.delete',{id},requestId) as {object_key:string};
   await purge(domain,auth,file.object_key);return {ok:true,purged:true};
  }
 }
 return CentralWorkApi;
}
