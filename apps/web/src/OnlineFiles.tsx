import {useEffect,useRef,useState} from 'react';
import { PaperclipIcon as Paperclip, DownloadIcon as Download, TrashIcon as Trash2, SpinnerGapIcon as LoaderCircle, ArrowClockwiseIcon as RotateCw, XIcon as X, FileTextIcon as FileText } from '@phosphor-icons/react';
import type {OnlineFileView as OnlineFile} from '../../../packages/contracts/central-work';
import {centralFileResponse,centralRequest} from './central-api';
import {useOnline} from './online-context';
import {CodePreview} from './CodePreview';
import {codeLanguage} from './code-preview';
const loadOnlineFile=(id:string,signal:AbortSignal)=>centralFileResponse(`/files/${id}`,{signal});
export async function downloadOnlineFile(file:Pick<OnlineFile,'id'|'name'>){
 const response=await centralFileResponse(`/files/${file.id}`),url=URL.createObjectURL(await response.blob());
 const link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export function OnlineAttachment({file}:{file:OnlineFile}){
 const [open,setOpen]=useState(false),[url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{if(!open||!file.mime.match(/^(image|video|audio)\//))return;const controller=new AbortController();let objectUrl='';setError('');setUrl('');
  void loadOnlineFile(file.id,controller.signal).then(r=>r.blob()).then(blob=>{if(controller.signal.aborted)return;objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}).catch(e=>{if(!controller.signal.aborted)setError((e as Error).message);});
  return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[file.id,file.mime,open]);
 if(codeLanguage(file.name))return <CodePreview file={file} loadFile={loadOnlineFile} downloadUrl={`/api/central/files/${file.id}`} onDownload={()=>downloadOnlineFile(file)}/>;
 return <section className="online-attachment"><header><FileText size={17}/><strong>{file.name}</strong><small>{(file.size/1024).toFixed(1)} KB</small><button className="icon-button" aria-label={`Baixar ${file.name}`} onClick={()=>void downloadOnlineFile(file).catch(e=>setError((e as Error).message))}><Download size={16}/></button></header>{file.mime.match(/^(image|video|audio)\//)&&<button className="text-link" onClick={()=>setOpen(!open)}>{open?'Fechar prévia':'Visualizar mídia'}</button>}{error&&<p role="alert">{error}</p>}{open&&!error&&(!url?<p role="status">Carregando mídia…</p>:file.mime.startsWith('image/')?<img src={url} alt={file.name}/>:file.mime.startsWith('audio/')?<audio src={url} controls preload="metadata"/>:<video src={url} controls preload="metadata" playsInline/>)}</section>;
}
type UploadEntry={file:File;requestId:string;state:'waiting'|'uploading'|'failed'|'done'|'canceling'|'cancel-failed';error?:string;result?:OnlineFile};
export function OnlineUploader({projectId,conversationId,onUploaded,disabled=false}:{projectId?:string;conversationId?:string;onUploaded:(file:OnlineFile)=>Promise<void>|void;disabled?:boolean}){
 const {data,project,workspace,uploadsConfigured,notify}=useOnline();const [entries,setEntries]=useState<UploadEntry[]>([]),[busy,setBusy]=useState(false);const active=useRef<{id:string;controller:AbortController}|null>(null),canceled=useRef(new Set<string>());
 const writable=uploadsConfigured&&!disabled&&!project?.archived&&!workspace?.archived;
 const update=(id:string,patch:Partial<UploadEntry>)=>setEntries(all=>all.map(e=>e.requestId===id?{...e,...patch}:e));
 useEffect(()=>()=>{active.current?.controller.abort();},[]);
 const send=async(entry:UploadEntry)=>{
  if(active.current)return;canceled.current.delete(entry.requestId);setBusy(true);const controller=new AbortController();active.current={id:entry.requestId,controller};update(entry.requestId,{state:'uploading',error:undefined});
  try{
   const query=new URLSearchParams({name:entry.file.name,requestId:entry.requestId,...(projectId?{projectId}:{conversationId:conversationId!})});
   const response=await centralFileResponse(`/studios/${data.studio.id}/files?${query}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:entry.file,signal:controller.signal});
   const result=await response.json() as OnlineFile;update(entry.requestId,{state:'done',result});
   await Promise.resolve(onUploaded(result)).catch(e=>notify((e as Error).message));
  }catch(e){if(!canceled.current.has(entry.requestId))update(entry.requestId,{state:'failed',error:controller.signal.aborted?'Envio interrompido. Você pode tentar novamente.':(e as Error).message});}
  finally{active.current=null;setBusy(false);}
 };
 const cancel=async(entry:UploadEntry)=>{
  if(entry.state==='waiting'||entry.state==='done'){setEntries(all=>all.filter(e=>e.requestId!==entry.requestId));return;}
  canceled.current.add(entry.requestId);update(entry.requestId,{state:'canceling',error:undefined});if(active.current?.id===entry.requestId)active.current.controller.abort();
  try{await centralRequest(`/studios/${data.studio.id}/uploads/${entry.requestId}/cancel`,{});setEntries(all=>all.filter(e=>e.requestId!==entry.requestId));}
  catch(e){update(entry.requestId,{state:'cancel-failed',error:(e as Error).message});}
 };
 return <div className="online-uploader"><label className={`button ${!writable?'disabled':''}`}><Paperclip size={16}/>Adicionar arquivos<input type="file" multiple disabled={!writable||busy} onChange={e=>{
  const files=Array.from(e.target.files||[]);e.target.value='';if(files.length+entries.length>10){notify('Adicione até10 arquivos por envio.');return;}
  if(files.some(f=>f.size===0||f.size>15*1024*1024)){notify('Cada arquivo deve ter entre1 byte e15MB.');return;}
  setEntries(all=>[...all,...files.map(file=>({file,requestId:crypto.randomUUID(),state:'waiting' as const}))]);
 }}/></label>{!uploadsConfigured&&<small>O envio online ainda não está disponível neste servidor.</small>}
 {entries.map(entry=><div className="online-upload-entry" key={entry.requestId}><span><strong>{entry.file.name}</strong><small>{entry.state==='done'?'Enviado':entry.state==='uploading'?'Enviando…':entry.state==='canceling'?'Cancelando…':entry.state==='failed'||entry.state==='cancel-failed'?entry.error:'Pronto para enviar'}</small></span>{entry.state==='canceling'?<LoaderCircle size={15} className="spin"/>:entry.state==='cancel-failed'?<button className="button small" onClick={()=>void cancel(entry)}>Concluir cancelamento</button>:entry.state!=='uploading'&&entry.state!=='done'?<button className="button small" disabled={busy||!writable} onClick={()=>void send(entry)}>{entry.state==='failed'?<RotateCw size={15}/>:<Paperclip size={15}/>} {entry.state==='failed'?'Tentar novamente':'Enviar'}</button>:null}{entry.state!=='canceling'&&<button className="icon-button" aria-label={entry.state==='done'?`Fechar envio de ${entry.file.name}`:`Cancelar envio de ${entry.file.name}`} disabled={busy&&entry.state!=='uploading'} onClick={()=>void cancel(entry)}><X size={15}/></button>}</div>)}
 </div>;
}
export function OnlineFiles({files,onChange}:{files:OnlineFile[];onChange:()=>Promise<void>}){
 const {data,project,run,busy,notify}=useOnline();
 const [pending,setPending]=useState<{id:string;requestId:string}|null>(null);
 const remove=async(file:OnlineFile)=>{
  const operation=pending?.id===file.id?pending:{id:file.id,requestId:crypto.randomUUID()};setPending(operation);
   try{await centralRequest(`/studios/${data.studio.id}/files/${file.id}/delete`,{requestId:operation.requestId});setPending(null);await onChange().catch(e=>notify((e as Error).message));}
  catch(e){notify((e as Error).message);await onChange().catch(()=>{});}
 };
 return <section className="panel online-files"><h2>Arquivos do projeto</h2><OnlineUploader projectId={project!.id} onUploaded={async()=>{await onChange();}}/>{!files.length&&<div className="empty"><h3>Os materiais da equipe ficam aqui.</h3><p>Envie código, imagens, áudio ou vídeo para este projeto.</p></div>}{files.map(file=><article className="online-file-row" key={file.id}><OnlineAttachment file={file}/>{(data.studio.role!=='user'||file.uploader_id===data.actor_id)&&<button className="icon-button danger" disabled={busy} aria-label={`Excluir ${file.name}`} onClick={()=>void remove(file)}><Trash2 size={16}/></button>}</article>)}{pending&&!files.some(f=>f.id===pending.id)&&<div className="form-error"><p>A limpeza de um arquivo ainda precisa ser confirmada.</p><button className="button" onClick={()=>void remove({id:pending.id} as OnlineFile)}>Tentar concluir exclusão</button></div>}</section>;
}
