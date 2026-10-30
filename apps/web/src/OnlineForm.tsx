import {useState,type ReactNode,type FormEvent} from 'react';
import { SpinnerGapIcon as LoaderCircle } from '@phosphor-icons/react';
import {Modal} from './Modal';
export function OnlineForm({title,children,onSubmit,onClose,label='Salvar',wide=false}:{title:string;children:ReactNode;onSubmit:(form:FormData)=>Promise<void>;onClose:()=>void;label?:string;wide?:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(busy)return;const form=new FormData(e.currentTarget);setBusy(true);setError('');try{await onSubmit(form);onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <Modal title={title} onClose={()=>{if(!busy)onClose();}} wide={wide}><form onSubmit={submit}><div className="modal-body form-fields">{children}{error&&<p className="form-error" role="alert">{error}</p>}</div><footer className="modal-footer"><button className="button" type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy}>{busy&&<LoaderCircle className="spin" size={16}/>} {label}</button></footer></form></Modal>;
}
