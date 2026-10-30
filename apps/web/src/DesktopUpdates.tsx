import {useState} from 'react';
import { DownloadIcon as Download, SpinnerGapIcon as LoaderCircle } from '@phosphor-icons/react';

export function DesktopUpdates(){
 const bridge=(window as Window & {formaDesktop?:{checkUpdate?:()=>Promise<boolean>}}).formaDesktop;
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <section className="panel settings-panel"><h2>Atualizações do aplicativo</h2><p>{bridge?.checkUpdate?'Verifique novas versões e atualize o Forma neste computador.':'As atualizações do aplicativo instalado ficam disponíveis no Forma para Windows.'}</p>
 <button className="button" disabled={busy||!bridge?.checkUpdate} onClick={async()=>{
  if(!bridge?.checkUpdate||busy)return;setBusy(true);setMessage('');
  try{if(!await bridge.checkUpdate())setMessage('Não foi possível verificar nesta janela. Abra o Forma novamente.');}
  catch{setMessage('Não foi possível iniciar a verificação. Tente novamente.');}
  finally{setBusy(false);}
 }}>{busy?<LoaderCircle size={16} className="spin"/>:<Download size={16}/>} {busy?'Verificando…':'Verificar e atualizar'}</button>
 {message&&<p role="status">{message}</p>}</section>;
}
