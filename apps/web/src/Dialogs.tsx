import {SpaceCreateDialog} from './Spaces';
import {HiveProfile} from './HiveProfile';
import { useState, useEffect, useRef } from 'react';
import { PlusIcon as Plus, CopyIcon as Copy, CheckIcon as Check, ShieldIcon as Shield, CameraIcon as Camera, VideoCameraIcon as Video, MicrophoneIcon as Mic, MicrophoneSlashIcon as MicOff, VideoCameraSlashIcon as VideoOff, SpinnerGapIcon as LoaderCircle, WarningCircleIcon as AlertCircle, FileTextIcon as FileText, CalendarBlankIcon as CalendarDays, DownloadIcon as Download, FireIcon as Flame, CheckCircleIcon as CheckCircle2, MagnifyingGlassIcon as Search, ArrowRightIcon as ArrowRight, MapPinIcon as MapPin, FolderIcon as Folder, ClockIcon as Clock3 } from '@phosphor-icons/react';
import { useWorkspace, Avatar, AvatarGroup, Empty, isManager, dateLabel } from './context';
import { Modal, ModalForm, PeoplePicker, ProjectSelect } from './Modal';
import { TaskForm, TaskDetail } from './TaskDialogs';
import { request, upload } from './api';
import { ownMedia,meetingShortcut } from './media';
import { Attachment } from './Chat';
import { roleNames } from '../../../packages/contracts';
import { dayIn } from '../../../packages/shared/date';
import { CrmDialog } from './Crm';
export function Dialogs() {
    const { dialog, data, setDialog } = useWorkspace();
    if (!dialog)
        return null;
    const { id, kind, projectId, status } = dialog;
    let content: React.ReactNode;
    switch (kind) {
        case 'crm-contact':
        case 'crm-opportunity':
        case 'crm-proposal':
        case 'crm-accept':
            content = <CrmDialog/>;
            break;
        case 'task-create':
            content = <TaskForm projectId={projectId} initialStatus={status}/>;
            break;
        case 'task-edit':
            content = <TaskForm taskId={id}/>;
            break;
        case 'task-detail':
            content = <TaskDetail id={id!}/>;
            break;
        case 'invite':
            content = <InviteForm projectId={projectId}/>;
            break;
        case 'profile-edit':
            content = <HiveProfile />;
            break;
        case 'profile-images':
            content = <ProfileForm />;
            break;
        case 'event':
            content = <EventForm id={id} projectId={projectId}/>;
            break;
        case 'meeting-now':
            content = <InstantMeetingForm projectId={projectId}/>;
            break;
        case 'meeting-preview':
            content = <MeetingPreview id={id!}/>;
            break;
        case 'doc':
            content = <DocForm id={id} projectId={projectId}/>;
            break;
        case 'help':
            content = <HelpForm />;
            break;
        case 'folder':
            content = <FolderForm id={id} projectId={projectId}/>;
            break;
        case 'chat-create':
        case 'chat-edit':
            content = <ChatForm id={id} projectId={projectId}/>;
            break;
        case 'member':
            content = <MemberForm id={id!}/>;
            break;
        case 'workspace':
            content = <SpaceCreateDialog />;
            break;
        case 'project':
            content = <ProjectForm workspaceId={id}/>;
            break;
        case 'project-info':
            content = <ProjectInfo id={id!}/>;
            break;
        case 'file-preview': {
            const f = data.files.find(f => f.id === id);
            content = <Modal title={f?.name || 'Arquivo'} wide><div className="modal-body file-preview">{f ? <><Attachment id={f.id}/><a className="button" href={`/api/files/${f.id}`} download={f.name}><Download size={16}/>Baixar arquivo</a><p className="muted small-text">Somente pessoas com acesso ao escopo podem baixar.</p></> : <Empty title="Arquivo não disponível"/>}</div></Modal>;
            break;
        }
        case 'contribution-day':
            content = <ContributionDay userId={id!} date={status!}/>;
            break;
        case 'search':
            content = <SearchDialog />;
            break;
        case 'workspace-info':
            content = <Modal title={data.org.name} subtitle="Seu espaço de trabalho"><div className="modal-body"><div className="info-art"><Folder size={34}/></div><p>{data.org.description}</p><div className="notice"><Shield size={18}/><p>Este é um MVP local de desenvolvimento com dados no servidor. Admin pode inspecionar os chats de trabalho do próprio servidor. Sua Inbox e solicitações de ajuda continuam pessoais.</p></div><dl className="info-list"><dt>Pessoas ativas</dt><dd>{data.people.filter(p => p.status === 'active').length}</dd><dt>Projetos visíveis</dt><dd>{data.projects.length}</dd><dt>Armazenamento</dt><dd>Local · arquivo no servidor</dd></dl></div></Modal>;
            break;
        case 'streak-info':
            content = <Modal title="Um pequeno incentivo para seguir" subtitle="Como funciona o foguinho"><div className="modal-body streak-explanation"><span className="streak-flame"><Flame size={38} fill="currentColor"/></span><p>Uma primeira conclusão com seu crédito vale um dia de entrega. Várias tarefas no mesmo dia não aumentam o número de dias.</p><p>A sequência atual pode terminar hoje ou ontem. Depois de um dia completo sem entrega, a próxima conclusão começa uma nova sequência. Fins de semana também fazem parte dos dias consecutivos.</p><p>Reabrir e concluir a mesma tarefa não gera novo crédito. O cálculo considera seu timezone e só os projetos acessíveis ao titular e ao visitante.</p><div className="notice subtle">Um incentivo, nunca uma avaliação do seu valor ou de horas trabalhadas.</div></div></Modal>;
            break;
        default: content = null;
    }
    return <div key={kind + ':' + id + ':' + projectId}>{content}</div>;
}
function InviteForm({ projectId }: {
    projectId?: string;
}) {
    const { data, toast, refresh } = useWorkspace();
    const [project, setProject] = useState(projectId || data.projects.find(p => isManager(data, p) && !p.archived)?.id || ''), [link, setLink] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    if (link)
        return <Modal title="Um convite para fazer parte" subtitle="Link local de uso único, válido por 7 dias"><div className="modal-body"><div className="success-icon"><Check size={28}/></div><p>O convite já está na Inbox da conta destinatária. Se ela ainda não tiver conta, poderá se cadastrar com o e-mail convidado. Não há envio automático de e-mail.</p><div className="invite-link"><input readOnly value={link} aria-label="Link do convite"/><button className="button" onClick={() => navigator.clipboard.writeText(link).then(() => toast('Link copiado.')).catch(() => toast('Selecione e copie o link.'))}><Copy size={15}/>Copiar</button></div><div className="notice subtle"><Shield size={16}/>O endereço é local. Para outra máquina acessar, será necessário configurar um ambiente compartilhado seguro.</div></div></Modal>;
    return <Modal title="Convide alguém para a equipe" subtitle="Mais uma pessoa, mais boas ideias."><form onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError('');
            try {
                if (f.get('password'))
                    await request('/reauth', { password: f.get('password') });
                const result = await request('/invitations', { email: f.get('email'), name: f.get('name'), role: f.get('role'), projectIds: [project] });
                setLink(`${location.origin}/#invite?token=${result.token}`);
                await refresh();
            }
            catch (e) {
                setError((e as Error).message);
            }
            finally {
                setBusy(false);
            }
        }}><div className="modal-body form-fields"><label>Nome<input name="name" placeholder="Nome da pessoa" minLength={2} maxLength={80} required autoFocus/></label><label>E-mail<input type="email" name="email" placeholder="pessoa@equipe.com" maxLength={200} required/></label><ProjectSelect value={project} onChange={setProject} managed/><label>Cargo de acesso<select name="role" defaultValue="user" disabled={data.me.role === 'coordinator'}>{Object.entries(roleNames).filter(([id]) => data.me.role === 'admin' || id === 'user').map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>{data.me.role === 'coordinator' && <input type="hidden" name="role" value="user"/>}<small>{data.me.role === 'coordinator' ? 'Você pode adicionar Usuários aos seus projetos.' : 'Cargo profissional é configurado no perfil, separado deste acesso.'}</small></label>{data.me.role === 'admin' && <label>Confirme sua senha para delegar cargos superiores<input type="password" name="password" autoComplete="current-password"/></label>}{error && <div className="form-error" role="alert">{error}</div>}<div className="notice subtle">O convite não libera todas as áreas. A pessoa receberá acesso ao projeto selecionado.</div></div><footer className="modal-footer"><button className="button primary" disabled={busy || !project}>{busy ? <LoaderCircle className="spin" size={16}/> : <Plus size={16}/>}Criar convite</button></footer></form></Modal>;
}
function ProfileForm() {
    const { data, run, toast } = useWorkspace();
    const [avatarId, setAvatar] = useState(data.me.avatarId || ''), [coverId, setCover] = useState(data.me.coverId || ''), [uploading, setUploading] = useState(false);
    const me = data.me;
    const image = async (file: File, kind: 'avatar' | 'cover') => {
        setUploading(true);
        try {
            const f = await upload(file, 'profile', me.id);
            if (kind === 'avatar')
                setAvatar(f.id);
            else
                setCover(f.id);
        }
        catch (e) {
            toast((e as Error).message);
        }
        finally {
            setUploading(false);
        }
    };
    return <ModalForm title="Seu perfil, do seu jeito" subtitle="Informações de apresentação visíveis aos colegas deste servidor." wide disabled={uploading} onSubmit={async (f) => { await run('profile.update', { name: f.get('name'), handle: f.get('handle'), title: f.get('title'), bio: f.get('bio'), location: f.get('location'), timezone: f.get('timezone'), avatarId, coverId }); toast('Perfil atualizado.'); }}><div className="profile-edit-cover" style={coverId ? { backgroundImage: `url(/api/files/${coverId})` } : undefined}><label className="button small"><Camera size={14}/>Alterar capa<input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={e => {
            if (e.target.files?.[0])
                image(e.target.files[0], 'cover');
        }}/></label></div><div className="profile-edit-avatar"><Avatar person={{ ...me, avatarId: avatarId || undefined }} size={67}/><label className="button small">Alterar foto<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => {
            if (e.target.files?.[0])
                image(e.target.files[0], 'avatar');
        }}/></label>{(coverId || avatarId) && <button type="button" className="text-link" onClick={() => { setAvatar(''); setCover(''); }}>Remover imagens</button>}{uploading && <LoaderCircle className="spin" size={17}/>}</div><div className="form-row"><label>Nome<input name="name" defaultValue={me.name} minLength={2} maxLength={80} required/></label><label>@ do perfil<input name="handle" defaultValue={me.handle} required pattern="[a-zA-Z0-9_]{3,30}" minLength={3} maxLength={30}/></label></div><label>Cargo profissional<input name="title" defaultValue={me.title} placeholder="Ex.: Senior Software Engineer" maxLength={100}/><small>Não altera seu cargo de acesso: {roleNames[me.role]}.</small></label><label>Bio<textarea name="bio" defaultValue={me.bio} rows={3} maxLength={600} placeholder="Um pouco sobre você e o que gosta de criar…"/></label><div className="form-row"><label>Localização (opcional)<input name="location" defaultValue={me.location} placeholder="Cidade ou local onde trabalha" maxLength={120}/></label><label>Timezone<select name="timezone" defaultValue={me.timezone}>{[...new Set([me.timezone, 'America/Sao_Paulo', 'America/Manaus', 'America/Recife', 'America/Fortaleza', 'America/Rio_Branco', 'Europe/Lisbon', 'UTC'])].map(t => <option key={t}>{t}</option>)}</select></label></div></ModalForm>;
}
function EventForm({ id, projectId }: {
    id?: string;
    projectId?: string;
}) {
    const { data, run, toast } = useWorkspace();
    const e = data.calendar.find(e => e.id === id);
    const [baseVersion] = useState(e?.version || 0);
    const [project, setProject] = useState(e?.projectId || projectId || data.projects.find(p => isManager(data, p) && !p.archived)?.id || '');
    const local = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const next = new Date(Date.now() + 3600000);
    next.setMinutes(0, 0, 0);
    return <ModalForm title={e ? 'Editar evento' : 'Uma conversa com contexto'} subtitle={`Digite os horários no fuso do dispositivo: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`} wide label={e ? 'Salvar evento' : 'Agendar evento'} onSubmit={async (f) => { await run('event.save', { id: e?.id, projectId: project, title: f.get('title'), start: new Date(String(f.get('start'))).toISOString(), end: new Date(String(f.get('end'))).toISOString(), attendeeIds: f.getAll('attendeeIds'), meeting: f.get('meeting') === 'on', version: baseVersion }); toast('Evento salvo na agenda.'); }}><label>Título<input name="title" defaultValue={e?.title || ''} placeholder="Ex.: Review de design" maxLength={200} required autoFocus/></label><ProjectSelect value={project} onChange={setProject} managed/><div className="form-row"><label>Início<input type="datetime-local" name="start" defaultValue={local(e ? new Date(e.start) : next)} required/></label><label>Fim<input type="datetime-local" name="end" defaultValue={local(e ? new Date(e.end) : new Date(next.getTime() + 1800000))} required/></label></div><label className="check-label"><input type="checkbox" name="meeting" defaultChecked={e?.meeting ?? true}/><span>Este evento é uma reunião de trabalho.<small>Sala multipessoa depende de serviço de mídia configurado.</small></span></label><label>Convidados</label><PeoplePicker key={project} projectId={project} name="attendeeIds" selected={e?.attendeeIds || [data.me.id]}/></ModalForm>;
}
function InstantMeetingForm({projectId}:{projectId?:string}){
 const {data,run,setDialog,navigate}=useWorkspace();
 const [project,setProject]=useState(projectId||data.projects.find(p=>isManager(data,p)&&!p.archived)?.id||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <Modal title="Reunir agora" subtitle="Sem agendamento. Escolha o projeto e quem quer convidar."><form onSubmit={async e=>{
  e.preventDefault();if(busy)return;const form=new FormData(e.currentTarget);setBusy(true);setError('');
  try{const result=await run('meeting.instant',{projectId:project,title:form.get('title'),attendeeIds:form.getAll('attendeeIds')});setDialog(data.mediaConfigured?null:{kind:'meeting-preview',id:result.id});if(data.mediaConfigured)navigate(`meeting/${result.id}`);}
  catch(e){setError((e as Error).message);setBusy(false);}
 }}><div className="modal-body form-fields"><label>Título<input name="title" defaultValue="Reunião rápida" maxLength={200} required autoFocus/></label><ProjectSelect value={project} onChange={setProject} managed/><label>Convidados</label><PeoplePicker key={project} projectId={project} name="attendeeIds" selected={[data.me.id]}/><p>{data.mediaConfigured?'Você entrará na sala com câmera e microfone desligados. Ative-os pelos controles quando desejar.':'A prévia será aberta agora. O serviço de mídia ainda precisa ser configurado.'}</p>{error&&<p role="alert" className="form-error">{error}</p>}</div><footer className="modal-footer"><button type="button" className="button" disabled={busy} onClick={()=>setDialog(null)}>Cancelar</button><button className="button primary" disabled={busy||!project}>{busy&&<LoaderCircle className="spin" size={16}/>}Criar e abrir agora</button></footer></form></Modal>;
}
function MeetingPreview({ id }: {
    id: string;
}) {
    const { data, setDialog, navigate, run, toast } = useWorkspace();
    const e = data.calendar.find(e => e.id === id);
    const [stream, setStream] = useState<MediaStream | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [camera, setCamera] = useState(true), [mic, setMic] = useState(true);
    const video = useRef<HTMLVideoElement>(null), media = useRef<MediaStream | null>(null), alive = useRef(false);
    useEffect(() => {
        if (video.current && stream) {
            video.current.srcObject = stream;
            video.current.play().catch(() => { });
        }
    }, [stream]);
    useEffect(() => { alive.current = !!e; if(!e){media.current?.getTracks().forEach(t=>t.stop());setStream(null);} return () => { alive.current = false; media.current?.getTracks().forEach(t => t.stop()); }; }, [e?.id]);
    useEffect(()=>{
        const onKey=(event:KeyboardEvent)=>{
            const target=event.target as HTMLElement|null;
            const kind=meetingShortcut(event.key,target?.tagName||'',!!target?.closest('input,textarea,select,[contenteditable=true]'),event.ctrlKey||event.metaKey||event.altKey||event.repeat);
            if(!kind||!stream||!e)return;
            const tracks=kind==='audio'?stream.getAudioTracks():stream.getVideoTracks();
            if(!tracks.length)return;event.preventDefault();const enabled=!tracks.some(t=>t.enabled);tracks.forEach(t=>t.enabled=enabled);
            if(kind==='audio')setMic(enabled);else setCamera(enabled);
        };
        document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);
    },[stream,e?.id]);
    if (!e)
        return <Modal title="Evento não disponível"><div className="modal-body"><p>O evento foi removido ou o acesso mudou.</p></div></Modal>;
    const p = data.projects.find(p => p.id === e.projectId), manage = isManager(data, p) && !p?.archived;
    const testDevices = async () => {
        setBusy(true);
        setError('');
        try {
            media.current?.getTracks().forEach(t => t.stop());
            const s = await ownMedia(navigator.mediaDevices.getUserMedia({ video: true, audio: true }), () => alive.current);
            if (!s)
                return;
            media.current = s;
            setStream(s);
            setCamera(true);
            setMic(true);
        }
        catch {
            setError('Não foi possível acessar câmera e microfone. Autorize os dispositivos no navegador ou confira se estão disponíveis.');
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title={e.title} subtitle={p?.name} wide><div className="modal-body meeting-preview"><div className="device-preview">{stream ? <video ref={video} autoPlay muted playsInline/> : <div><Video size={42}/><p>Seus dispositivos começam desligados.</p><button className="button" disabled={busy} onClick={testDevices}>{busy ? <LoaderCircle className="spin" size={17}/> : <Camera size={17}/>}Testar câmera e microfone</button></div>}{stream && <div className="device-controls"><button className={!camera ? 'off' : ''} aria-label={camera ? 'Desligar câmera' : 'Ligar câmera'} onClick={() => { stream.getVideoTracks().forEach(t => t.enabled = !camera); setCamera(!camera); }}>{camera ? <Video size={20}/> : <VideoOff size={20}/>}</button><button className={!mic ? 'off' : ''} aria-label={mic ? 'Desligar microfone' : 'Ligar microfone'} onClick={() => { stream.getAudioTracks().forEach(t => t.enabled = !mic); setMic(!mic); }}>{mic ? <Mic size={20}/> : <MicOff size={20}/>}</button><span>Prévia local · M: microfone · C: câmera</span></div>}</div>{error && <div className="form-error" role="alert">{error}</div>}{e.instant&&<p className="notice">Reunião criada na hora, sem agendamento. Acesso rápido exibido por até2 horas; isso não indica que uma chamada está conectada.</p>}<div className="event-detail-row"><span><CalendarDays size={17}/>{dateLabel(e.start, { day: 'numeric', month: 'long' })}</span><span><Clock3 size={17}/>{new Date(e.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: data.me.timezone })} — {new Date(e.end).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: data.me.timezone })}</span><small>{data.me.timezone}</small></div><div className="event-attendees"><AvatarGroup ids={e.attendeeIds}/><span>{e.attendeeIds.length} convidados</span>{e.attendeeIds.includes(data.me.id) && <div><button className={`button small ${e.responses[data.me.id] === 'accepted' ? 'selected-response' : ''}`} onClick={() => run('event.respond', { id: e.id, response: 'accepted' }).then(() => toast('Presença confirmada.')).catch(() => { })}><Check size={14}/>Vou participar</button><button className="button small" onClick={() => run('event.respond', { id: e.id, response: 'declined' }).then(() => toast('Resposta atualizada.')).catch(() => { })}>Não poderei ir</button></div>}</div>{e.meeting && !data.mediaConfigured && <div className="notice media-notice"><AlertCircle size={20}/><div><strong>Sala multipessoa indisponível nesta instalação.</strong><p>O serviço de mídia ainda não foi configurado. A prévia acima é local e não transmite para a equipe. Nenhuma chamada foi iniciada.</p></div></div>}</div><footer className="modal-footer">{e.meeting&&data.mediaConfigured&&<button className="button primary" onClick={()=>{media.current?.getTracks().forEach(t=>t.stop());setDialog(null);navigate(`meeting/${e.id}`);}}>Entrar na sala</button>}{manage && <><button className="button danger" onClick={() => {
                if (confirm('Excluir este evento da agenda?'))
                    run('event.delete', { id: e.id, version: e.version }).then(() => setDialog(null)).catch(() => { });
            }}>Excluir evento</button>{!e.instant&&<button className="button" onClick={() => setDialog({ kind: 'event', id: e.id, projectId: e.projectId })}>Editar evento</button>}</>}<button className="button" onClick={() => setDialog(null)}>Fechar prévia</button></footer></Modal>;
}
function DocForm({ id, projectId }: {
    id?: string;
    projectId?: string;
}) {
    const { data, run, toast, route } = useWorkspace();
    const d = data.documents.find(d => d.id === id);
    const [baseVersion] = useState(d?.version || 0);
    const [body, setBody] = useState(d?.body || ''), [revisions, setRevisions] = useState(false), [project, setProject] = useState(d?.projectId || projectId || data.projects.find(p => !p.archived)?.id || '');
    const archived = data.projects.find(p => p.id === project)?.archived;
    return <ModalForm title={d ? 'Documento do projeto' : 'Dê um lugar à ideia'} subtitle={d ? `Versão ${d.version} · atualizado em ${dateLabel(d.updatedAt)}` : 'Briefings, decisões e notas de trabalho.'} wide disabled={!!archived} label="Salvar documento" onSubmit={async (f) => { await run('doc.save', { id: d?.id, projectId: project, title: f.get('title'), body, version: baseVersion }); toast('Documento salvo com uma nova revisão.'); }}><label>Título<input name="title" defaultValue={d?.title || ''} required maxLength={200} readOnly={!!archived} placeholder="Ex.: Briefing do projeto"/></label>{!d && (route.startsWith('project/') || route.startsWith('docs/') ? <label>Projeto<input readOnly value={data.projects.find(p => p.id === project)?.name || ''}/></label> : route.startsWith('workspace-docs/') ? <label>Projeto<select value={project} onChange={e => setProject(e.target.value)}>{data.projects.filter(p => !p.archived && p.workspaceId === route.split('/')[1]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label> : <ProjectSelect value={project} onChange={setProject}/>)}<div className="document-editor-toolbar"><span><FileText size={16}/>Texto / Markdown simples</span>{d && <button type="button" className="text-link" onClick={() => setRevisions(v => !v)}>{revisions ? 'Fechar histórico' : `Histórico (${d.revisions.length})`}</button>}</div>{revisions && <div className="doc-revisions">{d?.revisions.map(r => <button type="button" key={r.version} onClick={() => {
                    if (confirm(`Carregar conteúdo da versão ${r.version} no editor? Salvar criará uma nova revisão.`)) {
                        setBody(r.body);
                        setRevisions(false);
                    }
                }}>Versão {r.version} · {dateLabel(r.at)}<span>Carregar no editor</span></button>)}{!d?.revisions.length && <p>Nenhuma revisão anterior ainda.</p>}</div>}<textarea className="document-editor" value={body} readOnly={!!archived} onChange={e => setBody(e.target.value)} maxLength={30000} rows={17} placeholder="# Comece por um pouco de contexto…"/><small>Sem HTML executável. Em conflito, seu texto fica preservado para comparar e copiar antes de recarregar.</small></ModalForm>;
}
function HelpForm() { const { run, toast } = useWorkspace(); return <ModalForm title="Conte o que aconteceu" subtitle="Só você acessa esta solicitação no MVP local. Nenhuma mensagem externa é enviada." label="Abrir solicitação" onSubmit={async (f) => { const r = await run('help.create', { title: f.get('title'), body: f.get('body') }); toast(`Solicitação registrada · ${r.id.slice(0, 8).toUpperCase()}`); }}><label>Assunto<input name="title" required maxLength={200} autoFocus placeholder="Em que você precisa de ajuda?"/></label><label>O que aconteceu?<textarea name="body" rows={6} maxLength={5000} required placeholder="Conte o que estava tentando fazer, os passos e o erro que apareceu…"/></label><div className="notice subtle">Não envie senhas, tokens ou conteúdo privado desnecessário.</div></ModalForm>; }
function FolderForm({ id, projectId }: {
    id?: string;
    projectId?: string;
}) { const { data, run, toast } = useWorkspace(); const f = data.folders.find(f => f.id === id); return <ModalForm title={f ? 'Organizar pasta' : 'Um lugar para os materiais'} onSubmit={async (form) => { await run(f ? 'folder.update' : 'folder.create', f ? { id: f.id, name: form.get('name'), archived: form.get('archived') === 'on' } : { projectId: projectId || form.get('projectId'), name: form.get('name') }); toast('Pasta salva.'); }}>{!projectId && !f && <ProjectSelect managed/>}<label>Nome da pasta<input name="name" defaultValue={f?.name || ''} required maxLength={80} placeholder="Ex.: Referências de design" autoFocus/></label>{f && <label className="check-label"><input name="archived" type="checkbox" defaultChecked={f.archived}/><span>Arquivar pasta<small>Anexos históricos continuam disponíveis no seu escopo.</small></span></label>}<div className="notice subtle">Uma pasta organiza materiais; ela não altera permissões nem move arquivos para outro projeto.</div></ModalForm>; }
function ChatForm({ id, projectId }: {
    id?: string;
    projectId?: string;
}) {
    const { data, run, navigate, route, toast } = useWorkspace();
    const scoped = route.startsWith('project/') || route.startsWith('workspace/') || route.startsWith('workspace-chat/') || route.startsWith('workspace-settings/');
    const c = data.conversations.find(c => c.id === id);
    const [kind, setKind] = useState('project'), [project, setProject] = useState(projectId || data.projects.find(p => isManager(data, p) && !p.archived)?.id || '');
    return <ModalForm title={c ? 'Configurar conversa' : 'Um espaço para conversar'} label={c ? 'Salvar conversa' : 'Criar conversa'} onSubmit={async (f) => { const r = await run(c ? 'conversation.update' : 'conversation.create', c ? { id: c.id, name: f.get('name'), archived: f.get('archived') === 'on' } : { name: f.get('name'), ...(kind === 'project' ? { projectId: project } : { memberIds: f.getAll('memberIds') }) }); if (!scoped)
        navigate(`chat/${r.id}`);
    else
        toast('Conversa salva neste espaço.'); }}><label>Nome<input name="name" defaultValue={c?.name || ''} required maxLength={100} placeholder="Ex.: Discussões de design"/></label>{!c && <><label>Tipo<select disabled={scoped} value={kind} onChange={e => setKind(e.target.value)}><option value="project">Canal de projeto</option><option value="direct">Conversa direta</option></select></label>{kind === 'project' ? scoped ? route.startsWith('project/') ? <label>Projeto<input readOnly value={data.projects.find(p => p.id === project)?.name || ''}/></label> : <label>Projeto<select value={project} onChange={e => setProject(e.target.value)}>{data.projects.filter(p => !p.archived && p.workspaceId === route.split('/')[1] && isManager(data, p)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label> : <ProjectSelect value={project} onChange={setProject} managed/> : <><label>Pessoas</label><PeoplePicker name="memberIds"/></>}</>}{c && <label className="check-label"><input type="checkbox" name="archived" defaultChecked={c.archived}/><span>Arquivar conversa</span></label>}<div className="notice subtle">Administrar a conversa não permite reescrever mensagens de outras pessoas. Novos destinatários de um direto exigem uma nova conversa.</div></ModalForm>;
}
function MemberForm({ id }: {
    id: string;
}) {
    const { data, run, toast } = useWorkspace();
    const p = data.people.find(p => p.id === id);
    if (!p)
        return <Modal title="Pessoa não disponível"><div className="modal-body">Este cadastro não está mais disponível.</div></Modal>;
    return <ModalForm title={`Acesso de ${p.name.split(' ')[0]}`} subtitle="Apenas Admin pode delegar cargos ou alterar cadastros administrativos." onSubmit={async (f) => {
            if (f.get('password'))
                await request('/reauth', { password: f.get('password') });
            const status = f.get('status');
            if (status === 'removed' && !confirm(`Remover ${p.name} deste servidor? O histórico de autoria será preservado.`))
                throw new Error('Remoção cancelada.');
            await run('member.update', { id: p.id, name: f.get('name'), role: f.get('role'), status, projectIds: f.getAll('projectIds') });
            toast('Acesso atualizado.');
        }}><div className="member-form-person"><Avatar person={p} size={49}/><span>{p.email}<small>@{p.handle}</small></span></div><label>Nome profissional<input name="name" defaultValue={p.name} minLength={2} maxLength={80} required/></label><div className="form-row"><label>Cargo de acesso<select name="role" defaultValue={p.role}>{Object.entries(roleNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Estado<select name="status" defaultValue={p.status}><option value="active">Ativo</option><option value="suspended">Suspenso</option><option value="removed">Remover do servidor</option></select></label></div><label>Projetos atribuídos</label><div className="people-picker">{data.projects.filter(p => !p.archived).map(pr => <label key={pr.id}><input name="projectIds" type="checkbox" value={pr.id} defaultChecked={p.projectIds.includes(pr.id)}/><span>{pr.name}</span></label>)}</div><label>Confirme sua senha se a sessão não for recente<input type="password" name="password" autoComplete="current-password"/></label><div className="notice subtle"><Shield size={16}/>O último Admin ativo permanece protegido. Excluir do servidor não apaga autoria nem revela credenciais.</div></ModalForm>;
}
function ProjectForm({ workspaceId }: {
    workspaceId?: string;
}) { const { data, run, navigate } = useWorkspace(); return <ModalForm title="Dê forma a um novo projeto" label="Criar projeto" onSubmit={async (f) => { const r = await run('project.create', { workspaceId: workspaceId || f.get('workspaceId'), name: f.get('name'), description: f.get('description') }); navigate(`project/${r.id}`); }}>{!workspaceId && <label>Área<select name="workspaceId">{data.workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}<label>Nome do projeto<input name="name" required maxLength={100} autoFocus placeholder="Qual será a próxima iniciativa?"/></label><label>Um pouco de contexto<textarea name="description" maxLength={500} rows={3} placeholder="O que vocês querem construir juntos?"/></label></ModalForm>; }
function ProjectInfo({ id }: {
    id: string;
}) {
    const { data, run, toast } = useWorkspace();
    const p = data.projects.find(p => p.id === id);
    const [baseVersion] = useState(p?.version || 0);
    if (!p)
        return null;
    const manage = isManager(data, p) && !p.archived;
    return <ModalForm title="Sobre o projeto" subtitle={`Versão ${p.version} · ${data.workspaces.find(w => w.id === p.workspaceId)?.name}`} disabled={!manage} onSubmit={async (f) => { await run('project.update', { id: p.id, name: f.get('name'), description: f.get('description'), archived: f.get('archived') === 'on', version: baseVersion }); toast('Projeto atualizado.'); }}><label>Nome<input name="name" defaultValue={p.name} required readOnly={!manage} maxLength={100}/></label><label>Descrição<textarea name="description" defaultValue={p.description} rows={4} readOnly={!manage} maxLength={500}/></label><label className="check-label"><input name="archived" type="checkbox" disabled={!manage} defaultChecked={p.archived}/><span>Arquivar projeto<small>Preserva o histórico e bloqueia mutações de trabalho.</small></span></label></ModalForm>;
}
function ContributionDay({ userId, date }: {
    userId: string;
    date: string;
}) { const { data, setDialog } = useWorkspace(); const p = data.people.find(p => p.id === userId); const tasks = data.tasks.filter(t => t.firstCompletion?.assigneeIds.includes(userId) && p?.projectIds.includes(t.projectId) && dayIn(t.firstCompletion.at, p.timezone) === date); return <Modal title={`Entregas de ${dateLabel(date, { day: 'numeric', month: 'long' })}`} subtitle={`${p?.name} · ${p?.timezone}`}><div className="modal-body contribution-task-list">{tasks.map(t => <button key={t.id} onClick={() => setDialog({ kind: 'task-detail', id: t.id })}><CheckCircle2 size={19}/><span>{t.title}<small>{data.projects.find(p => p.id === t.projectId)?.name}</small></span><ArrowRight size={16}/></button>)}{!tasks.length && <Empty title="Sem conclusões elegíveis neste dia">O mapa só mostra entregas autorizadas para este perfil.</Empty>}</div></Modal>; }
function SearchDialog() {
    const { data, navigate, setDialog } = useWorkspace();
    const [q, setQ] = useState('');
    const term = q.trim().toLowerCase();
    const results = term.length < 2 ? [] : [...data.tasks.filter(t => !t.archived && (t.title + ' ' + t.description).toLowerCase().includes(term)).map(t => ({ id: t.id, title: t.title, detail: 'Tarefa · ' + data.projects.find(p => p.id === t.projectId)?.name, kind: 'task' })), ...data.documents.filter(d => (d.title + ' ' + d.body).toLowerCase().includes(term)).map(d => ({ id: d.id, title: d.title, detail: 'Documento', kind: 'doc' })), ...data.files.filter(f => f.name.toLowerCase().includes(term)).map(f => ({ id: f.id, title: f.name, detail: 'Arquivo autorizado', kind: 'file' })), ...data.people.filter(p => p.status === 'active' && (p.name + ' ' + p.handle + ' ' + p.title).toLowerCase().includes(term)).map(p => ({ id: p.id, title: p.name, detail: '@' + p.handle, kind: 'person' }))].slice(0, 20);
    return <Modal title="Encontre o seu contexto" subtitle="Tarefas, documentos, materiais e pessoas autorizados."><div className="modal-body search-dialog"><label className="global-search-input"><Search size={20}/><input autoFocus placeholder="Buscar no seu espaço…" value={q} onChange={e => setQ(e.target.value)}/><kbd>Esc</kbd></label><div className="global-search-results">{results.map(r => <button key={r.kind + r.id} onClick={() => {
                if (r.kind === 'person') {
                    setDialog(null);
                    navigate(`profile/${r.id}`);
                }
                else
                    setDialog({ kind: r.kind === 'task' ? 'task-detail' : r.kind === 'doc' ? 'doc' : 'file-preview', id: r.id });
            }}><span className="search-result-icon">{r.kind === 'person' ? '@' : r.kind === 'task' ? <CheckCircle2 size={19}/> : <FileText size={19}/>}</span><span><strong>{r.title}</strong><small>{r.detail}</small></span><ArrowRight size={15}/></button>)}{!term && <div className="search-empty">Tudo o que você precisa, mais perto.<small>Digite ao menos 2 caracteres para buscar.</small></div>}{term.length >= 2 && !results.length && <Empty title="Nenhum resultado neste espaço">Tente outro termo. Conteúdo sem acesso não aparece na busca.</Empty>}</div></div></Modal>;
}
