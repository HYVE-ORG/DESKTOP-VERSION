import { useState, useRef, useEffect } from 'react';
import { HashIcon as Hash, MagnifyingGlassIcon as Search, PlusIcon as Plus, InfoIcon as Info, PaperclipIcon as Paperclip, PaperPlaneTiltIcon as Send, SmileyIcon as Smile, AtIcon as AtSign, MicrophoneIcon as Mic, SquareIcon as Square, XIcon as X, DotsThreeIcon as MoreHorizontal, PencilIcon as Pencil, TrashIcon as Trash2, ShieldCheckIcon as ShieldCheck, ChatCircleIcon as MessageSquare, FileIcon as FileIcon, DownloadIcon as Download, SpinnerGapIcon as LoaderCircle, PlayIcon as Play, LockKeyIcon as LockKeyhole, VideoCameraIcon as Video } from '@phosphor-icons/react';
import { useWorkspace, Avatar, dateLabel, Empty, isManager } from './context';
import { upload } from './api';
import { ownMedia } from './media';
import { inContext } from './work-views';
import type { Conversation, Message } from '../../../packages/contracts';
import { CodePreview } from './CodePreview';
export function Attachment({ id }: {
    id: string;
}) {
    const { data } = useWorkspace();
    const f = data.files.find(f => f.id === id);
    if (!f)
        return <span className="muted">Anexo não disponível</span>;
    if (f.mime.startsWith('image/'))
        return <a className="image-attachment" href={`/api/files/${id}`} target="_blank" rel="noreferrer"><img src={`/api/files/${id}`} alt={f.name}/></a>;
    if (f.mime.startsWith('audio/'))
        return <div className="audio-attachment"><Mic size={16}/><audio controls src={`/api/files/${id}`} preload="metadata"/><a href={`/api/files/${id}`} download={f.name} aria-label="Baixar áudio"><Download size={15}/></a></div>;
    if (f.mime.startsWith('video/'))
        return <div className="video-attachment"><video controls src={`/api/files/${id}`} preload="metadata"/><small>{f.name}</small></div>;
    if(f.mime.startsWith('text/')) return <CodePreview file={f}/>;
    return <a className="file-attachment" href={`/api/files/${id}`} download={f.name}><span><FileIcon size={20}/></span><div><strong>{f.name}</strong><small>{(f.size / 1024).toFixed(1)} KB</small></div><Download size={17}/></a>;
}
function MessageBody({ body }: {
    body: string;
}) { return <>{body.split(/(@[a-zA-Z0-9_]+)/).map((p, i) => p.startsWith('@') ? <span className="mention-text" key={i}>{p}</span> : <span key={i}>{p}</span>)}</>; }
export function ChatPage({ conversationId, projectId, workspaceId }: {
    projectId?: string;
    workspaceId?: string;
    conversationId?: string;
}) {
    const { data, navigate, setDialog, run, toast } = useWorkspace();
    const [find, setFind] = useState(''), [body, setBody] = useState(''), [attachments, setAttachments] = useState<string[]>([]), [uploading, setUploading] = useState(false), [sending, setSending] = useState(false), [menu, setMenu] = useState(''), [editing, setEditing] = useState<Message | null>(null), [editBody, setEditBody] = useState(''), [sideInfo, setSideInfo] = useState(false);
    const [recording, setRecording] = useState(false), [preview, setPreview] = useState<Blob | null>(null), [audioURL, setAudioURL] = useState(''), [focusOption, setFocusOption] = useState(0);
    const input = useRef<HTMLTextAreaElement>(null), fileInput = useRef<HTMLInputElement>(null), end = useRef<HTMLDivElement>(null), recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), key = useRef<string | null>(null), lastBody = useRef(''), captureEpoch = useRef(0);
    const [selectedId, setSelectedId] = useState<string>();
    const scoped = !!projectId || !!workspaceId;
    const conversations = data.conversations.filter(c => !c.archived && inContext(c, data.projects, projectId, workspaceId));
    const c = conversationId ? conversations.find(c => c.id === conversationId) : conversations.find(c => c.id === selectedId) || conversations[0];
    const selectConversation = (id: string) => scoped ? setSelectedId(id) : navigate(`chat/${id}`);
    const createProject = projectId || c?.projectId || data.projects.find(p => !p.archived && inContext({ projectId: p.id }, data.projects, undefined, workspaceId))?.id;
    const messages = data.messages.filter(m => m.conversationId === c?.id);
    const members = c ? data.people.filter(p => p.status === 'active' && (c.kind === 'direct' ? c.memberIds.includes(p.id) : c.kind === 'workspace' ? p.workspaceIds.includes(c.workspaceId!) : p.projectIds.includes(c.projectId!))) : [];
    const participating = !!c && (c.kind === 'direct' ? c.memberIds.includes(data.me.id) : c.kind === 'workspace' ? data.me.workspaceIds.includes(c.workspaceId!) : data.me.projectIds.includes(c.projectId!));
    const isAdminView = !!c && !participating && data.me.role === 'admin';
    const moderate = !!c && (data.me.role === 'admin' || data.me.role === 'coordinator' && c.kind !== 'direct' && (c.kind === 'workspace' ? data.me.workspaceIds.includes(c.workspaceId!) : isManager(data, data.projects.find(p => p.id === c.projectId))));
    useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, c?.id]);
    useEffect(() => { setBody(''); setAttachments([]); setEditing(null); setMenu(''); setRecording(false); setPreview(null); key.current = null; }, [c?.id]);
    useEffect(() => {
        captureEpoch.current++;
        return () => {
            captureEpoch.current++;
            if (recorder.current) {
                recorder.current.onstop = null;
                if (recorder.current.state === 'recording')
                    recorder.current.stop();
            }
            stream.current?.getTracks().forEach(t => t.stop());
        };
    }, [c?.id]);
    useEffect(() => {
        if (preview) {
            const url = URL.createObjectURL(preview);
            setAudioURL(url);
            return () => URL.revokeObjectURL(url);
        }
        setAudioURL('');
    }, [preview]);
    const saveFile = async (file: File) => {
        if (!c)
            return;
        setUploading(true);
        try {
            const f = await upload(file, 'conversation', c.id);
            setAttachments(a => [...a, f.id]);
            await new Promise(r => setTimeout(r, 50));
            toast('Arquivo pronto para enviar.');
            return true;
        }
        catch (e) {
            toast((e as Error).message);
            return false;
        }
        finally {
            setUploading(false);
        }
    };
    const record = async () => {
        const epoch = captureEpoch.current;
        try {
            const media = await ownMedia(navigator.mediaDevices.getUserMedia({ audio: true }), () => captureEpoch.current === epoch);
            if (!media)
                return;
            stream.current = media;
            const r = new MediaRecorder(media);
            const chunks: BlobPart[] = [];
            r.ondataavailable = e => {
                if (e.data.size)
                    chunks.push(e.data);
            };
            r.onstop = () => { setPreview(new Blob(chunks, { type: r.mimeType })); media.getTracks().forEach(t => t.stop()); setRecording(false); };
            r.start();
            recorder.current = r;
            setRecording(true);
            setTimeout(() => {
                if (r.state === 'recording')
                    r.stop();
            }, 120000);
        }
        catch {
            toast('Não foi possível acessar o microfone. Confira a permissão do navegador.');
        }
    };
    const send = async () => {
        if (!c || sending || (!body.trim() && !attachments.length))
            return;
        setSending(true);
        const text = body.trim();
        try {
            if (text.startsWith('/')) {
                let result = await run('command.execute', { conversationId: c.id, text });
                if (result.confirmText) {
                    if (!confirm(result.message))
                        return;
                    result = await run('command.execute', { conversationId: c.id, text: result.confirmText });
                }
                if (result.navigate)
                    navigate(result.navigate);
                if (result.message)
                    toast(result.message);
                if (result.open) {
                    const kind = ({ tarefa: 'task-create', chat: 'chat-create', pasta: 'folder', reuniao: 'event', atribuir: 'task-create' } as Record<string, string>)[result.open];
                    if (kind)
                        setDialog({ kind, projectId: result.projectId });
                }
                else if (result.id)
                    toast('Comando concluído.');
            }
            else {
                const fingerprint = JSON.stringify([text, attachments]);
                if (lastBody.current !== fingerprint) {
                    key.current = crypto.randomUUID();
                    lastBody.current = fingerprint;
                }
                await run('message.send', { conversationId: c.id, body: text, attachmentIds: attachments }, key.current || crypto.randomUUID());
            }
            setBody('');
            setAttachments([]);
            key.current = null;
            input.current?.focus();
        }
        catch { /* preserve draft and retry key */ }
        finally {
            setSending(false);
        }
    };
    const query = /(?:^|\s)@([a-zA-Z0-9_]*)$/.exec(body), slash = body.startsWith('/') && !body.includes(' ');
    const options = slash ? data.commands.filter(cmd => cmd.id.startsWith(body.slice(1))).map(cmd => ({ id: cmd.id, value: '/' + cmd.id + ' ', label: cmd.label, detail: cmd.description })) : query ? [...members.map(p => ({ id: p.id, value: '@' + p.handle + ' ', label: p.name, detail: '@' + p.handle })), ...(data.me.role === 'user' || data.me.role === 'coordinator' && c?.kind === 'direct' ? [] : ['usuarios', 'coordenadores', 'todos', ...(data.me.role === 'admin' ? ['admins'] : [])].map(g => ({ id: g, value: '@' + g + ' ', label: '@' + g, detail: g === 'todos' && data.me.role === 'coordinator' ? 'Usuários e Coordenadores deste escopo' : 'Grupo autorizado no contexto' })))].filter(p => (p.label + ' ' + p.detail).toLowerCase().includes(query[1].toLowerCase())).slice(0, 7) : [];
    const selectOption = (value: string) => {
        if (slash)
            setBody(value);
        else
            setBody(body.replace(/@([a-zA-Z0-9_]*)$/, value));
        setFocusOption(0);
        input.current?.focus();
    };
    return <div className="chat-layout"><aside className="chat-list"><div className="chat-list-heading"><h1>{workspaceId?'Canais':'Conversas'}</h1>{data.me.role !== 'user' && createProject && <button className="icon-button" aria-label="Criar chat" onClick={() => setDialog({ kind: 'chat-create', projectId: createProject })}><Plus size={18}/></button>}</div><label className="search-field"><Search size={15}/><input value={find} onChange={e => setFind(e.target.value)} placeholder="Encontrar conversa…"/></label><span className="section-label">CANAIS E PROJETOS</span>{conversations.filter(c => c.name.toLowerCase().includes(find.toLowerCase())).map(conv => <button key={conv.id} className={`conversation-item ${conv.id === c?.id ? 'active' : ''}`} aria-current={conv.id===c?.id?'true':undefined} onClick={() => selectConversation(conv.id)}><span className="channel-icon">{conv.kind === 'direct' ? <MessageSquare size={18}/> : <Hash size={18}/>}</span><span><strong>{conv.name}</strong><small>{conv.kind === 'direct' ? 'Conversa direta' : data.projects.find(p => p.id === conv.projectId)?.name || 'Canal da área'}</small></span></button>)}<div className="chat-list-note"><LockKeyhole size={16}/><p>Contexto de trabalho.<br />Admins podem inspecionar os chats do servidor.</p></div></aside>{!c ? <Empty icon={<MessageSquare size={28}/>} title="Sua próxima conversa começa aqui">A coordenação pode criar um canal para a equipe.</Empty> : <><section className="conversation"><header className="conversation-header"><span className="channel-heading-icon"><Hash size={23}/></span><div><h2>{c.name}</h2><p>{members.length} participantes · {c.kind === 'direct' ? 'Conversa direta' : 'Ideias, decisões e próximos passos'}</p></div>{c.projectId&&isManager(data,data.projects.find(p=>p.id===c.projectId))&&!data.projects.find(p=>p.id===c.projectId)?.archived&&<button className="icon-button" aria-label="Reunir agora" title="Reunir agora" onClick={()=>setDialog({kind:'meeting-now',projectId:c.projectId})}><Video size={19}/></button>}<button className="icon-button" aria-label="Informações do canal" onClick={() => setSideInfo(v => !v)}><Info size={19}/></button>{moderate && <button className="icon-button" aria-label="Configurar chat" onClick={() => setDialog({ kind: 'chat-edit', id: c.id })}><MoreHorizontal size={20}/></button>}</header>{isAdminView && <div className="admin-inspection"><ShieldCheck size={16}/>Acesso administrativo · Você não está participando desta conversa.</div>}<div className="messages-area"><div className="conversation-start"><span className="channel-big"><Hash size={31}/></span><h2>Um espaço para {c.name.toLowerCase()}.</h2><p>Compartilhe ideias, mantenha o contexto e faça o trabalho avançar.</p></div><div className="day-divider"><span>Histórico da conversa</span></div>{messages.map((m, index) => {
                const p = data.people.find(p => p.id === m.authorId);
                return <article key={m.id} className="message"><Avatar person={p} size={35}/><div className="message-content"><div className="message-meta"><button onClick={() => navigate(`profile/${p?.id}`)}>{p?.name || 'Membro removido'}</button>{p?.role === 'coordinator' && <span className="tiny-role">Coord.</span>}<time>{new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>{m.editedAt && <small>editada</small>}</div>{m.deletedAt ? <p className="message-deleted">Mensagem removida{m.deletedBy !== m.authorId ? ' pela moderação' : ''}.</p> : editing?.id === m.id ? <div className="edit-message"><textarea value={editBody} onChange={e => setEditBody(e.target.value)}/><div><button className="button small" onClick={() => setEditing(null)}>Cancelar</button><button className="button primary small" onClick={() => run('message.edit', { id: m.id, body: editBody, version: editing.version }).then(() => setEditing(null)).catch(() => { })}>Salvar</button></div></div> : <><p className="message-body"><MessageBody body={m.body}/></p>{m.attachmentIds.map(id => <Attachment key={id} id={id}/>)}</>}</div>{!m.deletedAt && (m.authorId === data.me.id && participating || moderate) && <div className="message-actions">{m.authorId === data.me.id && participating && <button aria-label="Editar mensagem" onClick={() => { setEditing(m); setEditBody(m.body); }}><Pencil size={14}/></button>}<button aria-label="Apagar mensagem" onClick={() => {
                            if (confirm('Remover esta mensagem? Um marcador será mantido.'))
                                run('message.delete', { id: m.id, version: m.version }).catch(() => { });
                        }}><Trash2 size={14}/></button></div>}</article>;
            })}<div ref={end}/></div>{participating ? <div className="composer-area">{options.length > 0 && <div className="suggestion-menu" role="listbox" aria-label={slash ? 'Comandos disponíveis' : 'Pessoas e grupos'}>{options.map((o, i) => <button key={o.id} role="option" aria-selected={focusOption === i} className={i === focusOption ? 'focused' : ''} onClick={() => selectOption(o.value)}><span>{slash ? '/' : '@'}</span><div><strong>{o.label}</strong><small>{o.detail}</small></div></button>)}</div>}{preview && <div className="recording-preview"><audio controls src={audioURL}/><button className="button small" onClick={() => {
                        saveFile(new File([preview], `audio-${Date.now()}.webm`, { type: preview.type })).then(ok => {
                            if (ok)
                                setPreview(null);
                        });
                    }}>Anexar áudio</button><button className="icon-button" aria-label="Descartar áudio" onClick={() => setPreview(null)}><X size={16}/></button></div>}{attachments.length > 0 && <div className="pending-attachments">{attachments.map((id, i) => <span key={id}><Paperclip size={14}/>Anexo {i + 1}<button aria-label="Remover anexo" onClick={() => setAttachments(a => a.filter(x => x !== id))}><X size={12}/></button></span>)}</div>}<div className="message-composer"><textarea ref={input} value={body} disabled={sending} aria-label="Mensagem" placeholder={`Mensagem em ${c.name} · use / para comandos`} onChange={e => { setBody(e.target.value); setFocusOption(0); }} onKeyDown={e => {
                    if (options.length && e.key === 'ArrowDown') {
                        e.preventDefault();
                        setFocusOption(i => (i + 1) % options.length);
                    }
                    else if (options.length && e.key === 'ArrowUp') {
                        e.preventDefault();
                        setFocusOption(i => (i + options.length - 1) % options.length);
                    }
                    else if (e.key === 'Escape') {
                        setBody(v => v + ' ');
                    }
                    else if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (options.length)
                            selectOption(options[Math.min(focusOption, options.length - 1)].value);
                        else
                            send();
                    }
                }}/><div className="composer-tools"><div><input ref={fileInput} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp,audio/*,video/mp4,video/webm,.txt,.md,.csv,.json" onChange={e => {
                    const f = e.target.files?.[0];
                    if (f)
                        saveFile(f);
                    e.target.value = '';
                }}/><button className="icon-button" aria-label="Anexar arquivo" disabled={uploading || attachments.length >= 10} onClick={() => fileInput.current?.click()}>{uploading ? <LoaderCircle className="spin" size={17}/> : <Paperclip size={18}/>}</button><button className="icon-button" aria-label="Mencionar pessoa" onClick={() => { setBody(v => v + (v ? ' ' : '') + '@'); input.current?.focus(); }}><AtSign size={18}/></button><span className="composer-divider"/><button className="icon-button" aria-label={recording ? 'Parar gravação' : 'Gravar áudio'} onClick={() => recording ? recorder.current?.stop() : record()}>{recording ? <Square className="recording-icon" size={17} fill="currentColor"/> : <Mic size={18}/>}</button>{recording && <span className="recording-label">Gravando…</span>}</div><div><span className="composer-hint">Shift + Enter para nova linha</span><button className="send-button" aria-label="Enviar mensagem" disabled={sending || uploading || (!body.trim() && !attachments.length)} onClick={send}>{sending ? <LoaderCircle className="spin" size={17}/> : <Send size={17}/>}</button></div></div></div><p className="chat-bottom-note">Conversa de trabalho · Administração com acesso informado no servidor.</p></div> : <div className="inspection-note"><LockKeyhole size={17}/>Compositor indisponível neste modo de inspeção.</div>}</section>{sideInfo && <aside className="chat-info"><h3>Sobre esta conversa</h3><p>{c.name}</p><dl><dt>Tipo</dt><dd>{c.kind === 'direct' ? 'Direta' : 'Canal de projeto'}</dd><dt>Participantes</dt><dd>{members.length}</dd></dl><h4>Pessoas</h4>{members.map(p => <button key={p.id} onClick={() => navigate(`profile/${p.id}`)}><Avatar person={p} size={30}/><span>{p.name}<small>{p.title}</small></span></button>)}</aside>}</>}</div>;
}
