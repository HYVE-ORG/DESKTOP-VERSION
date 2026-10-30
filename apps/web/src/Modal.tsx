import { useContext, useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { XIcon as X, SpinnerGapIcon as LoaderCircle } from '@phosphor-icons/react';
import { Context, useWorkspace } from './context';
export function Modal({ title, subtitle, children, wide = false, onClose, drawer=false, className='' }: {
    title: string;
    subtitle?: string;
    children: ReactNode;
    wide?: boolean;
    onClose?: () => void;
    drawer?: boolean;
    className?: string;
}) {
    const workspace = useContext(Context);
    const ref = useRef<HTMLDialogElement>(null);
    const hive = true;
    const task = ['task-create','task-edit','task-detail'].includes(workspace?.dialog?.kind || '');
    const variant = hive ? drawer ? 'hive-modal hive-drawer' : task ? 'hive-modal hive-dialog' : 'hive-modal' : '';
    const close = () => onClose ? onClose() : workspace?.setDialog(null);
    useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
    return <dialog ref={ref} aria-label={title} className={`modal ${wide ? 'wide' : ''} ${drawer?'task-drawer':''} ${variant} ${className}`} onCancel={e => { e.preventDefault(); close(); }} onClick={e => {
            if (e.target === e.currentTarget) {
                const box = e.currentTarget.getBoundingClientRect();
                if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom)
                    close();
            }
        }}><header className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="icon-button" aria-label="Fechar janela" onClick={close}><X size={19}/></button></header>{children}</dialog>;
}
export function ModalForm({ title, subtitle, children, onSubmit, label = 'Salvar', wide = false, disabled = false }: {
    title: string;
    subtitle?: string;
    children: ReactNode;
    onSubmit: (form: FormData) => Promise<void>;
    label?: string;
    wide?: boolean;
    disabled?: boolean;
}) {
    const { setDialog } = useWorkspace();
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const submit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (busy)
            return;
        const form = new FormData(e.currentTarget);
        setBusy(true);
        setError('');
        try {
            await onSubmit(form);
            setDialog(null);
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    };
    return <Modal title={title} subtitle={subtitle} wide={wide}><form onSubmit={submit}><div className="modal-body form-fields">{children}{error && <div className="form-error" role="alert">{error}</div>}</div><footer className="modal-footer"><button type="button" className="button" onClick={() => setDialog(null)}>Cancelar</button><button className="button primary" disabled={busy || disabled}>{busy && <LoaderCircle size={16} className="spin"/>}{label}</button></footer></form></Modal>;
}
export function ProjectSelect({ value, onChange, name = 'projectId', managed = false }: {
    value?: string;
    onChange?: (v: string) => void;
    name?: string;
    managed?: boolean;
}) {
    const { data } = useWorkspace();
    const list = data.projects.filter(p => !p.archived && (!managed || data.me.role === 'admin' || data.me.role === 'coordinator' && data.me.projectIds.includes(p.id)));
    return <label>Projeto<select name={name} value={onChange ? value : undefined} defaultValue={onChange ? undefined : value} onChange={e => onChange?.(e.target.value)} required>{!list.length && <option value="">Nenhum projeto disponível</option>}{list.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>;
}
export function PeoplePicker({ projectId, selected = [], name = 'assigneeIds' }: {
    projectId?: string;
    selected?: string[];
    name?: string;
}) {
    const { data } = useWorkspace();
    const people = data.people.filter(p => p.status === 'active' && (!projectId || p.projectIds.includes(projectId)));
    return <div className="people-picker" role="group" aria-label="Selecionar pessoas">{people.map(p => <label key={p.id}><input type="checkbox" name={name} value={p.id} defaultChecked={selected.includes(p.id)}/><span className="picker-name"><strong>{p.name}</strong><small>@{p.handle}</small></span></label>)}</div>;
}
