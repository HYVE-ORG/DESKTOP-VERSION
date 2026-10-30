import { EnvelopeIcon as Mail, ShieldIcon as Shield } from '@phosphor-icons/react';
import { InboxPage } from './Pages';
import {useWorkspace} from './context';

export function HiveInboxPage({invitationCount,onOpenPersonal}:{invitationCount:number;onOpenPersonal:()=>void}){
 const {data,run}=useWorkspace();
 return <div className="hive-inbox"><div className="hive-inbox-title"><h1>Sua Inbox</h1><p>Menções, próximas entregas e boas conversas, em um só lugar.</p></div><div className="hive-inbox-grid"><section className="hive-inbox-notifications"><button className="hive-read-all button" disabled={!data.notifications.some(note=>!note.readAt)} onClick={()=>run('inbox.all',{cutoff:data.inboxCutoff}).catch(()=>{})}>Marcar todas como lidas</button><InboxPage/></section><aside className="hive-inbox-invitations panel"><div className="panel-heading"><h2>Convites para Studios</h2></div>{invitationCount?<div className="hive-invite-state"><Mail/><strong>{invitationCount} {invitationCount===1?'convite esperando por você':'convites esperando por você'}</strong><p>Aceite ou recuse no seu espaço pessoal.</p><button className="button primary" onClick={onOpenPersonal}>Ver convites</button></div>:<div className="hive-invite-state"><Mail/><strong>Você não tem convites para outros Studios</strong><p>Quando uma administração convidar você, o acesso aparecerá aqui.</p></div>}</aside></div><div className="privacy-footnote"><Shield size={14}/>Sua Inbox é pessoal. Recursos inacessíveis não aparecem no histórico nem no contador.</div></div>;
}
