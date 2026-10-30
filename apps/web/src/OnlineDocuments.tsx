import {useEffect,useState} from 'react';
import { PlusIcon as Plus, FileTextIcon as FileText, ClockCounterClockwiseIcon as History, SpinnerGapIcon as LoaderCircle } from '@phosphor-icons/react';
import type {OnlineDocument} from '../../../packages/contracts/central-work';
import {centralQuery} from './central-api';
import {useOnline} from './online-context';
import {OnlineForm} from './OnlineForm';
type DocumentResult={document:OnlineDocument;revisions:{version:number;saved_at:string;saved_by:string}[]};
export function OnlineDocuments({documents,perform}:{documents:Omit<OnlineDocument,'body'>[];perform:(type:string,payload:unknown)=>Promise<any>}){
 const {project,workspace,notify}=useOnline();const [editing,setEditing]=useState<DocumentResult|null|undefined>(undefined),[loading,setLoading]=useState(false),[historic,setHistoric]=useState<OnlineDocument|null>(null);
 const writable=!project?.archived&&!workspace?.archived;
 const open=async(id:string)=>{setLoading(true);try{setEditing(await centralQuery<DocumentResult>(`/documents/${id}`));setHistoric(null);}catch(e){notify((e as Error).message);}finally{setLoading(false);}};
 return <section className="panel online-documents"><header className="online-section-header"><div><h2>Documentos do projeto</h2><p>Informações compartilhadas com o contexto da equipe.</p></div>{writable&&<button className="button primary" onClick={()=>{setEditing(null);setHistoric(null);}}><Plus size={16}/>Novo documento</button>}</header>{loading&&<p role="status"><LoaderCircle className="spin" size={16}/>Carregando documento…</p>}{!documents.length&&<div className="empty"><FileText/><h3>O conhecimento começa com uma página.</h3><p>Crie um briefing, uma decisão ou um guia para este projeto.</p></div>}{documents.map(d=><button className="online-document-row" key={d.id} onClick={()=>void open(d.id)} disabled={loading}><FileText size={20}/><span><strong>{d.title}</strong><small>Versão {d.version} · {new Date(d.updated_at).toLocaleString('pt-BR')}</small></span></button>)}
 {editing!==undefined&&<OnlineForm key={editing?.document.id||'new'} title={editing?.document.title||'Novo documento'} wide label={writable?'Salvar documento':'Fechar'} onClose={()=>setEditing(undefined)} onSubmit={async f=>{
  if(!writable)return;
  await perform('document.save',{...(editing?{id:editing.document.id,version:editing.document.version}:{}),projectId:project!.id,title:f.get('title'),body:f.get('body')});
 }}><label>Título<input name="title" minLength={2} maxLength={160} required readOnly={!writable} defaultValue={editing?.document.title}/></label><label>Conteúdo<textarea className="online-doc-editor" name="body" rows={16} maxLength={100000} readOnly={!writable} defaultValue={editing?.document.body||''}/></label>{editing&&<small>Versão aberta: {editing.document.version}. Um conflito mantém seu texto nesta janela.</small>}{!!editing?.revisions.length&&<section className="online-revisions"><h3><History size={16}/>Histórico de versões</h3><div>{editing.revisions.map(r=><button key={r.version} type="button" className="button small" onClick={()=>void centralQuery<DocumentResult>(`/documents/${editing.document.id}?version=${r.version}`).then(result=>setHistoric(result.document)).catch(e=>notify((e as Error).message))}>Versão {r.version}</button>)}</div>{historic&&<article><h4>{historic.title} · versão {historic.version}</h4><pre>{historic.body}</pre><button className="text-link" type="button" onClick={()=>setHistoric(null)}>Fechar versão anterior</button></article>}</section>}</OnlineForm>}
 </section>;
}
