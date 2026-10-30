import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeftIcon, EyeIcon, EyeSlashIcon, UserPlusIcon } from '@phosphor-icons/react';
import './register.css';
import { ArrowRightIcon as ArrowRight, ShieldCheckIcon as ShieldCheck, SparkleIcon as Sparkles, StackIcon as Layers3, CheckIcon as Check, SpinnerGapIcon as LoaderCircle } from '@phosphor-icons/react';
import { request } from './api';
export function Brand({ compact = false }: {
    compact?: boolean;
}) { return <div className="brand"><span className="brand-mark"><Layers3 size={22} weight="bold"/></span>{!compact && <>forma<span className="brand-dot">.</span></>}</div>; }
export function Auth({ initialized, onSuccess }: {
    initialized: boolean;
    onSuccess: () => Promise<void>;
}) {
    const [register, setRegister] = useState(location.hash === '#register');
    const [showPassword, setShowPassword] = useState(false);
    useEffect(() => {
        const syncRoute = () => { setRegister(location.hash === '#register'); setError(''); setShowPassword(false); };
        window.addEventListener('hashchange', syncRoute);
        return () => window.removeEventListener('hashchange', syncRoute);
    }, []);
    const [email, setEmail] = useState(''), [name, setName] = useState(''), [password, setPassword] = useState('');
    const [examples, setExamples] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const params = new URLSearchParams(location.hash.replace(/^#\/?invite\?/, ''));
    const token = location.hash.startsWith('#invite?') ? params.get('token') : null;
    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            await request(register ? '/register' : '/login', register ? { email, name, password } : { email, password });
            await onSuccess();
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    };
    if (register) return <main className="register-screen">
        <header className="register-topbar"><Brand/>{import.meta.env.MODE !== 'desktop' && <a href="#landing"><ArrowLeftIcon size={16}/>Voltar ao site</a>}</header>
        <section className="register-card" aria-labelledby="register-title">
            <header className="register-heading"><span className="register-symbol"><UserPlusIcon size={26}/></span><span className="register-eyebrow">SEU PRIMEIRO PASSO</span><h1 id="register-title">Crie sua conta no Forma.</h1><p>Seu perfil é pessoal. As boas ideias são compartilhadas.</p></header>
            <form onSubmit={submit} aria-busy={busy}>
                <label htmlFor="register-name">Nome completo<input id="register-name" autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Como podemos chamar você?" disabled={busy}/></label>
                <label htmlFor="register-email">E-mail<input id="register-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com" disabled={busy}/></label>
                <label htmlFor="register-password">Senha</label>
                <div className="register-password"><input id="register-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder="Crie uma senha segura" aria-describedby="register-password-hint" disabled={busy}/><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeSlashIcon size={20}/> : <EyeIcon size={20}/>}</button></div>
                <small id="register-password-hint">Use de 10 a 128 caracteres.</small>
                <div className="register-invitation"><ShieldCheck size={22}/><p><strong>Seu espaço começa com você.</strong>Você entra sem Studio. Convites da sua equipe chegam à Inbox.</p></div>
                {error && <div className="form-error" role="alert">{error}</div>}
                <button className="register-submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={18}/>Criando sua conta…</> : <>Criar minha conta<ArrowRight size={18}/></>}</button>
            </form>
            <p className="register-login">Já faz parte? <a href="#login" onClick={e => { if (busy) e.preventDefault(); else {setRegister(false);setError('');setShowPassword(false);} }}>Entrar na minha conta<ArrowRight size={14}/></a></p>
        </section>
        <footer className="register-footer">Trabalho com clareza. Equipe com contexto.<span>Ambiente local de desenvolvimento. A administração pode inspecionar os chats de trabalho do próprio servidor, inclusive diretos.</span></footer>
    </main>;
    return <div className="auth-screen"><section className="auth-story"><Brand /><div className="auth-copy"><span className="eyebrow"><span className="live-dot"/> O SEU PRÓXIMO BOM TRABALHO COMEÇA AQUI</span><h1>Menos abas.<br />Mais <em>boas ideias.</em></h1><p>Pessoas, conversas e projetos no mesmo lugar.<br />Um espaço feito para a sua equipe fazer acontecer.</p><div className="auth-mini-board"><div className="mini-label"><span className="dot orange"/> Seu próximo projeto <span>Hoje</span></div><div className="mini-columns"><div><span>A fazer <b>3</b></span><article><i className="mini-tag">Design</i><strong>Dar forma a uma ideia</strong><div className="mini-line"/><small>✦ Um passo de cada vez</small></article></div><div><span>Concluída <b>1</b></span><article className="mini-done"><Check size={18}/><strong>Encontrar o seu espaço</strong><small>Bem-vindo à Forma.</small></article></div></div></div></div><footer>Feito para trabalhar melhor, juntos.<span>FORMA · WORKSPACE LOCAL</span></footer></section><section className="auth-form-wrap"><div className="auth-form">{import.meta.env.MODE!=='desktop'&&<a className="text-link" href="#landing">← Conhecer o Forma</a>}<div className="auth-icon"><Sparkles size={25}/></div><span className="eyebrow">BEM-VINDO AO SEU ESPAÇO</span><h2>{register ? 'Crie sua conta pessoal.' : 'Bom ter você de volta.'}</h2><p>{register ? 'Seus convites para Studios aparecerão na Inbox.' : 'Entre na sua conta para continuar.'}</p><form onSubmit={submit}>{register && <label>Seu nome<input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Como podemos chamar você?"/></label>}<label>E-mail<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@equipe.com"/></label><label>Senha<input type="password" required minLength={10} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="No mínimo 10 caracteres"/></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="button primary auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <>{register ? 'Criar minha conta' : 'Entrar no meu espaço'}<ArrowRight size={18}/></>}</button></form><button className="text-link" onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Já tenho uma conta' : 'Criar uma conta'}</button><p className="auth-note"><ShieldCheck size={16}/><span>Ambiente local de desenvolvimento. Admin pode inspecionar os chats de trabalho do próprio servidor, inclusive diretos.</span></p></div><div className="auth-bottom">Trabalho com clareza. Equipe com contexto.</div></section></div>;
}
