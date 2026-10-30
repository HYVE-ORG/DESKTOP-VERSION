import {z} from 'zod';
import {ensure} from './errors';
export const EXPORT_SECTIONS=['studio','members','workspaces','workspace_access','projects','project_access','tasks','task_assignees','conversations','messages','documents','document_revisions','files','message_attachments'] as const;
type Section=typeof EXPORT_SECTIONS[number];
const pageSchema=z.object({rows:z.array(z.object({key:z.string().min(1).max(100),record:z.record(z.string(),z.unknown())})).max(50),nextCursor:z.string().min(1).max(100).nullable()});
type Reader={exportPage:(auth:string|undefined,studioId:string,section:Section,after?:string)=>Promise<unknown>};
export async function exportStudio(domain:Reader,auth:string|undefined,studioId:string,options:{signal?:AbortSignal;maxBytes?:number}={}){
 const startedAt=new Date().toISOString(),deadline=Date.now()+120000,chunks:Buffer[]=[],counts:Record<string,number>={};let bytes=0,pages=0;
 const check=()=>{ensure(!options.signal?.aborted,'Exportação interrompida.',409);ensure(Date.now()<deadline,'A exportação demorou além do limite. Tente novamente.',503);};
 const append=(value:unknown)=>{const chunk=Buffer.from(JSON.stringify(value)+'\n');bytes+=chunk.length;ensure(bytes<=(options.maxBytes||20*1024*1024),'A exportação ultrapassou o limite de20MiB. Solicite uma exportação assistida ao suporte.',413);chunks.push(chunk);};
 check();append({type:'manifest',format:'forma-studio-ndjson',version:1,studioId,startedAt,attachmentsIncluded:false,consistency:'Leitura paginada; alterações simultâneas podem aparecer entre páginas. Não é backup transacional.',sections:EXPORT_SECTIONS});
 for(const section of EXPORT_SECTIONS){
  let after:string|undefined;counts[section]=0;
  do{
   check();ensure(++pages<=2000,'A exportação atingiu o limite de páginas. Solicite ajuda ao suporte.',413);
   const page=pageSchema.parse(await domain.exportPage(auth,studioId,section,after));check();
   let previous=after||'';
   for(const row of page.rows){ensure(row.key>previous,'Paginação inválida na exportação.',503);previous=row.key;append({type:'record',section,key:row.key,record:row.record});counts[section]++;}
   if(page.nextCursor){ensure(page.rows.length>0&&page.nextCursor===previous&&page.nextCursor>(after||''),'Paginação inválida na exportação.',503);}
   after=page.nextCursor||undefined;
  }while(after);
 }
 // Revalidar sessão e cargo após a última página, antes de liberar os bytes.
 check();await domain.exportPage(auth,studioId,'studio');check();
 append({type:'complete',studioId,finishedAt:new Date().toISOString(),counts});return Buffer.concat(chunks);
}
