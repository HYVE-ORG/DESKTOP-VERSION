import {useEffect,useRef,useState} from 'react';
import { DownloadIcon as Download, SpinnerGapIcon as LoaderCircle } from '@phosphor-icons/react';
import {centralFileResponse} from './central-api';
import {Modal} from './Modal';
export function StudioExport({studioId}:{studioId:string}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[studioId]);
 const close=()=>{request.current?.abort();request.current=null;setBusy(false);setOpen(false);setError('');};
 const download=async()=>{
  if(busy)return;const controller=new AbortController();request.current=controller;setBusy(true);setError('');
  try{
   const response=await centralFileResponse(`/studios/${studioId}/export`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal});
   if(!response.headers.get('content-type')?.startsWith('application/x-ndjson'))throw Error('A exportação não foi concluída. Tente novamente.');
   const blob=await response.blob();if(controller.signal.aborted)return;
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`forma-studio-${studioId}.ndjson`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setOpen(false);
  }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}
  finally{if(request.current===controller){request.current=null;setBusy(false);}}
 };
 return <><button className="button" onClick={()=>{setError('');setOpen(true);}}><Download size={16}/>Exportar dados</button>{open&&<Modal title="Exportar dados do Studio" onClose={close}><div className="modal-body form-fields"><p>Baixe tarefas, conversas, documentos com histórico, áreas, projetos, acessos e um índice de arquivos deste Studio.</p><p>Os anexos não estão incluídos. Continue baixando cada arquivo pela área Arquivos. Contas, senhas, Inbox e dados financeiros não fazem parte deste pacote.</p><p>Formato NDJSON, até20MiB. A coleta é paginada e pode refletir alterações feitas enquanto você exporta. Não substitui backup ou restauração do banco.</p><small>O arquivo contém dados da equipe. Guarde em um local adequado. Apenas o Admin atual pode exportar.</small>{busy&&<p role="status"><LoaderCircle className="spin" size={16}/>Preparando arquivo…</p>}{error&&<p role="alert" className="form-error">{error}</p>}</div><footer className="modal-footer"><button className="button" onClick={close}>{busy?'Interromper':'Cancelar'}</button><button className="button primary" disabled={busy} onClick={()=>void download()}><Download size={16}/>Baixar dados</button></footer></Modal>}</>;
}
