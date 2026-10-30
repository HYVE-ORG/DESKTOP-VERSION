import { useState, useRef, type FormEvent } from 'react';
import { FlagIcon as Flag, CalendarBlankIcon as CalendarDays, CheckSquareIcon as CheckSquare2, ChatCircleIcon as MessageSquare, PaperclipIcon as Paperclip, ClockIcon as Clock3, PlusIcon as Plus, CheckIcon as Check, PaperPlaneTiltIcon as Send, PencilIcon as Pencil, CopyIcon as Copy, TrashIcon as Trash2, UploadIcon as Upload, SpinnerGapIcon as LoaderCircle, ClockCounterClockwiseIcon as History, ArrowRightIcon as ArrowRight } from '@phosphor-icons/react';
import { useWorkspace, Avatar, AvatarGroup, dateLabel, isManager, mayMove } from './context';
import { Modal, ModalForm, ProjectSelect, PeoplePicker } from './Modal';
import { statusNames, priorityNames, type Status } from '../../../packages/contracts';
import { upload } from './api';
import { Attachment } from './Chat';
export function TaskForm({ taskId, projectId, initialStatus }: {
    taskId?: string;
    projectId?: string;
    initialStatus?: string;
}) {
    const { data, run, toast } = useWorkspace();
    const t = data.tasks.find(t => t.id === taskId);
    const [baseVersion] = useState(t?.version || 0);
    const [project, setProject] = useState(t?.projectId || projectId || data.projects.find(p => !p.archived)?.id || '');
    return <ModalForm title={t ? 'Editar tarefa' : 'Crie uma tarefa'} subtitle={t ? 'Atualize o contexto e alinhe os próximos passos.' : 'Dê um nome, um responsável e um próximo passo.'} wide label={t ? 'Salvar alterações' : 'Criar tarefa'} onSubmit={async (f) => {
            const payload = { title: f.get('title'), description: f.get('description'), priority: f.get('priority'), dueDate: f.get('dueDate'), labels: String(f.get('labels') || '').split(',').map(s => s.trim()).filter(Boolean), assigneeIds: f.getAll('assigneeIds') };
            const result = await run(t ? 'task.update' : 'task.create', t ? { ...payload, id: t.id, version: baseVersion } : { ...payload, projectId: project, initialStatus: initialStatus || 'todo' });
            toast(t ? 'Tarefa atualizada.' : 'Próximo passo criado.');
        }}><div className="form-two-columns"><div><label>Título da tarefa<input name="title" defaultValue={t?.title || ''} placeholder="O que precisamos entregar?" maxLength={200} autoFocus required/></label><label>Contexto e descrição<textarea name="description" defaultValue={t?.description || ''} rows={6} maxLength={10000} placeholder="Adicione o briefing, links e o que uma boa entrega precisa ter…"/></label><label>Etiquetas<input name="labels" defaultValue={t?.labels.join(', ') || ''} placeholder="Design, Produto, Frontend" maxLength={150}/><small>Separe por vírgulas. Até 6 etiquetas.</small></label></div><div>{!t && <ProjectSelect value={project} onChange={setProject} managed/>}<label>Prioridade<select name="priority" defaultValue={t?.priority || 'medium'}>{Object.entries(priorityNames).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label>Prazo<input type="date" name="dueDate" required defaultValue={t?.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}/></label><label>Responsáveis</label><PeoplePicker key={project} projectId={project} selected={t?.assigneeIds || []}/></div></div></ModalForm>;
}
export function TaskDetail({ id }: {
    id: string;
}) {
    const { data, run, setDialog, toast } = useWorkspace();
    const t = data.tasks.find(t => t.id === id);
    const [comment, setComment] = useState(''), [checkText, setCheckText] = useState(''), [tab, setTab] = useState('comments'), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    if (!t)
        return <Modal title="Tarefa não disponível"><div className="modal-body"><p>O item não existe ou seu acesso foi alterado.</p></div></Modal>;
    const p = data.projects.find(p => p.id === t.projectId), manage = isManager(data, p) && !p?.archived && !t.archived, move = mayMove(data, t);
    const complete = async (status: Status) => {
        if (status === 'done' && t.checklist.some(c => !c.done) && !confirm('Existem itens pendentes no checklist. Concluir mesmo assim?'))
            return;
        await run('task.move', { id: t.id, status, version: t.version, confirmPending: status === 'done' });
    };
    const sendComment = async (e: FormEvent) => {
        e.preventDefault();
        if (!comment.trim() || busy)
            return;
        setBusy(true);
        try {
            await run('comment.add', { taskId: t.id, body: comment });
            setComment('');
        }
        catch { }
        finally {
            setBusy(false);
        }
    };
    const attach = async (file: File) => {
        setUploading(true);
        try {
            const f = await upload(file, 'project', t.projectId);
            await run('task.attach', { taskId: t.id, fileId: f.id });
            toast('Arquivo anexado à tarefa.');
        }
        catch (e) {
            toast((e as Error).message);
        }
        finally {
            setUploading(false);
        }
    };
    return <Modal title="Detalhes da tarefa" subtitle={p?.name} wide drawer><div className="task-detail-layout"><div className="task-detail-main"><div className="task-detail-title"><h1>{t.title}</h1>{manage && <button className="icon-button" aria-label="Editar tarefa" onClick={() => setDialog({ kind: 'task-edit', id: t.id })}><Pencil size={17}/></button>}</div><div className="description-block"><span className="field-heading">Descrição</span><p>{t.description || 'Nenhuma descrição adicionada ainda.'}</p></div><div className="checklist-heading"><span className="field-heading"><CheckSquare2 size={15}/>Checklist</span><span>{t.checklist.filter(c => c.done).length}/{t.checklist.length}</span></div><div className="simple-progress"><i style={{ width: `${t.checklist.length ? t.checklist.filter(c => c.done).length / t.checklist.length * 100 : 0}%` }}/></div><div className="task-checklist">{t.checklist.map(item => <label key={item.id} className={item.done ? 'done' : ''}><input type="checkbox" checked={item.done} disabled={!move} onChange={e => run('checklist.toggle', { taskId: t.id, itemId: item.id, done: e.target.checked, version: t.version }).catch(() => { })}/><span>{item.text}</span></label>)}</div>{manage && <form className="inline-add" onSubmit={e => {
                e.preventDefault();
                if (checkText.trim())
                    run('checklist.add', { taskId: t.id, text: checkText, version: t.version }).then(() => setCheckText('')).catch(() => { });
            }}><input placeholder="Adicionar um próximo passo…" value={checkText} maxLength={200} onChange={e => setCheckText(e.target.value)}/><button type="submit" aria-label="Adicionar item de checklist"><Plus size={17}/></button></form>}<div className="task-attachments"><div><span className="field-heading"><Paperclip size={15}/>Anexos</span>{!p?.archived && !t.archived && <button className="text-link" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? <LoaderCircle className="spin" size={14}/> : <Plus size={14}/>}Adicionar</button>}<input hidden ref={fileInput} type="file" onChange={e => {
            if (e.target.files?.[0])
                attach(e.target.files[0]);
            e.target.value = '';
        }}/></div>{t.attachmentIds?.map(id => <Attachment key={id} id={id}/>)}{!t.attachmentIds?.length && <p className="muted small-text">Nenhum arquivo anexado.</p>}</div><div className="detail-tabs"><button className={tab === 'comments' ? 'active' : ''} onClick={() => setTab('comments')}><MessageSquare size={15}/>Comentários<span>{t.comments.filter(c => !c.deleted).length}</span></button><button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}><History size={15}/>Atividade</button></div>{tab === 'comments' ? <><div className="comments-list">{t.comments.map(c => <article className="task-comment" key={c.id}><Avatar person={data.people.find(p => p.id === c.authorId)} size={29}/><div><strong>{data.people.find(p => p.id === c.authorId)?.name || 'Equipe'}</strong><small>{dateLabel(c.at)}{c.editedAt ? ' · editado' : ''}</small><p>{c.deleted ? 'Comentário removido.' : c.body}</p></div>{!c.deleted && (c.authorId === data.me.id || manage) && <button className="icon-button" aria-label="Remover comentário" onClick={() => {
                        if (confirm('Remover comentário?'))
                            run('comment.delete', { taskId: t.id, id: c.id }).catch(() => { });
                    }}><Trash2 size={13}/></button>}</article>)}</div>{!t.archived && !p?.archived && <form className="comment-form" onSubmit={sendComment}><Avatar person={data.me} size={31}/><div><textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={4000} placeholder="Compartilhe contexto ou mencione @alguém…"/><button className="button primary small" disabled={busy || !comment.trim()}>Comentar<Send size={13}/></button></div></form>}</> : <div className="task-history">{[...t.events].reverse().map(e => <div key={e.id}><span /><p><strong>{data.people.find(p => p.id === e.actorId)?.name || 'Equipe'}</strong> {e.text.replaceAll('in_progress', 'Em andamento').replaceAll('todo', 'A fazer').replaceAll('in_review', 'Em revisão').replaceAll('done', 'Concluída')}<small>{dateLabel(e.at)} · {new Date(e.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></p></div>)}</div>}</div><aside className="task-detail-sidebar"><label>Status<select value={t.status} disabled={!move} onChange={e => complete(e.target.value as Status).catch(() => { })}>{Object.entries(statusNames).filter(([s]) => data.me.role !== 'user' || s === t.status || t.status !== 'done' && s !== 'todo').map(([s, name]) => <option key={s} value={s}>{name}</option>)}</select></label><label>Prioridade<div className={`priority priority-${t.priority}`}><Flag size={13}/>{priorityNames[t.priority]}</div></label><label>Responsáveis<div className="detail-assignees">{t.assigneeIds.map(id => { const person = data.people.find(p => p.id === id); return <div key={id}><Avatar person={person} size={25}/><span>{person?.name || 'Equipe'}</span></div>; })}{!t.assigneeIds.length && <span className="muted">Ainda sem responsável</span>}</div></label><label>Prazo<div className="muted"><CalendarDays size={15}/>{dateLabel(t.dueDate, { day: 'numeric', month: 'long' })}</div></label><label>Etiquetas<div className="task-labels">{t.labels.map(l => <span key={l}>{l}</span>)}</div></label><div className="detail-meta"><span>Criada em {dateLabel(t.createdAt)}</span><span>Versão {t.version}</span><button className="text-link" onClick={() => navigator.clipboard.writeText(t.id).then(() => toast('ID copiado para usar nos comandos.')).catch(() => toast(t.id))}><Copy size={13}/>Copiar ID</button></div>{manage && <button className="button danger subtle-button" onClick={() => {
                if (confirm('Arquivar esta tarefa? Ela sairá do quadro, mas manterá seu histórico.'))
                    run('task.archive', { id: t.id, version: t.version }).then(() => setDialog(null)).catch(() => { });
            }}><Trash2 size={14}/>Arquivar tarefa</button>}</aside></div></Modal>;
}
