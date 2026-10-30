import {useState} from 'react';
import {PlusIcon, CheckIcon, BuildingsIcon, SpinnerGapIcon} from '@phosphor-icons/react';
import type {AccountView} from '../../../packages/contracts';
import {Modal} from './Modal';

export function StudioSwitcher({studios,activeId,onSelect,onCreate,onClose}:{studios:AccountView['studios'];activeId:string;onSelect:(id:string)=>Promise<void>;onCreate:()=>void;onClose:()=>void}){
 const [pending,setPending]=useState<string|null>(null),[error,setError]=useState('');
 const select=async(id:string)=>{
  if(pending)return;
  if(id===activeId){onClose();return;}
  setPending(id);setError('');
  try{await onSelect(id);onClose();}catch(e){setError(e instanceof Error?e.message:'Não foi possível trocar de Studio. Tente novamente.');}finally{setPending(null);}
 };
 return <Modal title="Trocar de Studio" subtitle="Escolha o espaço de trabalho que deseja abrir." onClose={()=>{if(!pending)onClose();}} className="studio-switcher"><div className="modal-body">
  <div className="studio-switcher-list" aria-label="Seus Studios" aria-busy={!!pending}>{studios.map(studio=><button type="button" key={studio.id} className={`studio-switcher-item${studio.id===activeId?' selected':''}`} disabled={!!pending} aria-current={studio.id===activeId?'true':undefined} onClick={()=>void select(studio.id)}><span className="studio-switcher-icon"><BuildingsIcon size={24}/></span><span><strong>{studio.name}</strong><small>{studio.role==='admin'?'Administrador':studio.role==='coordinator'?'Coordenador':'Membro'}{studio.id===activeId?' · Studio atual':''}</small></span>{pending===studio.id?<SpinnerGapIcon size={20} className="spin"/>:studio.id===activeId?<CheckIcon size={20}/>:null}</button>)}</div>
  {!studios.length&&<p>Nenhum Studio disponível. Confira seus convites na área pessoal.</p>}
  {error&&<p className="form-error" role="alert">{error}</p>}
 </div><footer className="modal-footer"><button type="button" className="button primary" disabled={!!pending} onClick={onCreate}><PlusIcon size={18}/>Criar Studio</button></footer></Modal>;
}
