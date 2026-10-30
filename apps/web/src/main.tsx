import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { MagnifyingGlassIcon as Search, BellIcon as Bell, CaretDownIcon as ChevronDown, CaretRightIcon as ChevronRight, PlusIcon as Plus, HouseIcon as Home, CheckSquareIcon as CheckSquare2, CalendarBlankIcon as CalendarDays, UsersIcon as Users, FileTextIcon as FileText, ChartBarIcon as BarChart3, ChatCircleIcon as MessageSquare, TrayIcon as Inbox, GearIcon as Settings, QuestionIcon as CircleHelp, SidebarSimpleIcon as PanelLeftClose, SidebarSimpleIcon as PanelLeftOpen, VideoCameraIcon as Video, FolderIcon as Folder, CommandIcon as Command, SignOutIcon as LogOut, ArrowUpRightIcon as ArrowUpRight, XIcon as X, SpinnerGapIcon as LoaderCircle, WifiSlashIcon as WifiOff } from '@phosphor-icons/react';
import type { Snapshot, AccountView } from '../../../packages/contracts';
import { Breadcrumbs } from './Breadcrumbs';
import { WorkspacePage } from './WorkspacePage';
import {SpacesPage,SpaceSettingsPage} from './Spaces';
import {SpaceIcon} from './SpaceIdentity';
import { CrmPage } from './Crm';
import { AccountHome } from './AccountHome';
import {StudioSwitcher} from './StudioSwitcher';
import './account.css';
import { Context, Avatar, type Dialog } from './context';
import { loadState, request, ApiError } from './api';
import { Auth, Brand } from './Auth';
import { ProjectPage, TaskList, HomePage } from './Work';
import { HiveHomePage } from './HiveHome';
import { HiveInboxPage } from './HiveInbox';
import { ChatPage } from './Chat';
import { TeamPage, ProfilePage, InboxPage, ReportsPage, CalendarPage, DocsPage, SupportPage, SettingsPage, FilesPage, MeetingsPage } from './Pages';
import { Dialogs } from './Dialogs';
import { mutationRunner } from './mutations';
import './styles.css';
import './pages.css';
import './chat.css';
import './dialogs.css';
import './auth.css';
import './responsive.css';
import './appearance.css';
import './reference-ui.css';
import './design-system.css';
import './navigation.css';
import './operation-shell.css';
import './reference-refinement.css';
import './hive-structure.css';
import './hive-figma.css';
import './hive-system.css';
import './ux-polish.css';
import { HiveShell, HIVE_SCREENS, type HiveScreen } from './HiveShell';
import {QuickActions,SidebarSpaces,MobileNavigation,RefreshData} from './AppNavigation';
import {spaceTab} from './navigation';
import { initialTheme } from './AppearanceSettings';
import { publicLandingSection } from './landing/routes';
const LandingPage = import.meta.env.MODE==='desktop'?null:React.lazy(() => import('./landing/LandingPage'));
const MeetingRoom=React.lazy(()=>import('./MeetingRoom').then(m=>({default:m.MeetingRoom})));
const CentralAccount=React.lazy(()=>import('./CentralAccount'));
document.documentElement.dataset.theme = initialTheme();
function App() {
    const [account,setAccount]=useState<AccountView|null>(null),[accountOnly,setAccountOnly]=useState(false),[studioSwitcherOpen,setStudioSwitcherOpen]=useState(false);
    const [data, setData] = useState<Snapshot | null>(null), [initialized, setInitialized] = useState(true), [loading, setLoading] = useState(true);
    const [route, setRoute] = useState(location.hash.slice(1) || 'home'), [dialog, setDialog] = useState<Dialog>(null), [message, setMessage] = useState('');
    const [sidebar, setSidebar] = useState(false), [offline, setOffline] = useState(false);
    const [compactNav,setCompactNav]=useState(true);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null), current = useRef(0);
    const toast = useCallback((text: string) => {
        setMessage(text);
        if (timer.current)
            clearTimeout(timer.current);
        timer.current = setTimeout(() => setMessage(''), 5500);
    }, []);
    const refresh = useCallback(async () => {
        const call = ++current.current;
        try {
            const personal=await request('/account') as AccountView;
            if(call!==current.current)return;
            setAccount(personal);
            if(!personal.studios.length){setData(null);setOffline(false);return;}
            const state = await loadState();
            if (call === current.current) {
                setData(state);
                setOffline(false);
            }
        }
        catch (e) {
            if (e instanceof ApiError && e.status === 401) {
                setData(null);
                setAccount(null);
                const s = await request('/status');
                setInitialized(s.initialized);
            }
            else if(e instanceof ApiError && e.status===403){setData(null);setOffline(false);}
            else {
                setOffline(true);
                throw e;
            }
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { refresh().catch(() => setLoading(false)); const onHash = () => { setRoute(location.hash.slice(1) || 'home'); setSidebar(false); }; addEventListener('hashchange', onHash); return () => removeEventListener('hashchange', onHash); }, [refresh]);
    useEffect(() => {
        if (!data)
            return;
        const socket = io({ withCredentials: true });
        socket.on('refresh', () => refresh().catch(() => { }));
        const poll = setInterval(() => refresh().catch(() => { }), 12000);
        return () => { socket.disconnect(); clearInterval(poll); };
    }, [data?.me.id, refresh]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setDialog({ kind: 'search' });
            }
        };
        addEventListener('keydown', onKey);
        return () => removeEventListener('keydown', onKey);
    }, []);
    const navigate = (next: string) => { location.hash = next; setRoute(next); setSidebar(false); };
    const mutate = useMemo(() => mutationRunner((type, payload, requestId) => request('/actions', { type, payload, requestId }), refresh), [refresh, data?.me.id]);
    const run = async (type: string, payload: unknown, requestId?: string) => {
        try {
            return await mutate(type, payload, requestId);
        }
        catch (e) {
            toast((e as Error).message);
            throw e;
        }
    };
    if (loading)
        return <div className="boot"><Brand /><LoaderCircle className="spin"/><p>Preparando seu espaço…</p></div>;
    if(account && (!data || accountOnly)) return <AccountHome account={account} refresh={refresh} onSelect={async()=>{setData(null);setDialog(null);await refresh();setAccountOnly(false);navigate('home');}}/>;
    if (!data)
        return offline ? <div className="boot"><Brand /><WifiOff /><h2>O servidor está indisponível</h2><p>Confira se a API está em execução.</p><button className="button" onClick={() => refresh().catch(() => { })}>Tentar novamente</button></div> : <Auth initialized={initialized} onSuccess={async () => { await refresh(); navigate('home'); }}/>;
    const [page, itemId] = route.split('/');
    const project = data.projects.find(p => p.id === itemId);
    const nav = [{ id: 'home', name: 'Início', icon: Home }, { id: 'my-tasks', name: 'Minhas tarefas', icon: CheckSquare2 }, { id: 'inbox', name: 'Inbox', icon: Inbox }, { id: 'calendar', name: 'Calendário', icon: CalendarDays }, { id: 'spaces', name: 'Spaces', icon: Folder }, { id: 'team', name: 'Equipe', icon: Users }, ...(data.me.role!=='user'?[{id:'clients',name:'Clientes',icon:Users},{id:'sales',name:'Comercial',icon:BarChart3}]:[]), { id: 'docs', name: 'Documentos', icon: FileText }, { id: 'reports', name: 'Relatórios', icon: BarChart3 }];
    const workspace = (page === 'workspace' || page === 'workspace-settings' || page === 'workspace-chat' || page === 'workspace-docs') ? data.workspaces.find(w => w.id === itemId) : undefined;
    const title = page==='meeting'?(data.calendar.find(e=>e.id===itemId)?.title||'Sala de reunião'):workspace ? page === 'workspace' ? workspace.name : page === 'workspace-settings' ? `${workspace.name} · Configurações` : `${workspace.name} · ${page === 'workspace-chat' ? 'Conversas' : 'Documentos'}` : project?.name || nav.find(n => n.id === page)?.name || ({ chat: 'Conversas', profile: 'Perfil', settings: 'Configurações', support: 'Ajuda e suporte', meetings: 'Reuniões', files: 'Arquivos' } as Record<string, string>)[page] || 'Seu espaço';
    const unread = data.notifications.filter(n => !n.readAt).length + (account?.invitations.length || 0);
    const showMobileNavigation=!['chat','meeting','workspace-chat'].includes(page)&&!(page==='workspace'&&spaceTab(route)==='chat');
    let content: React.ReactNode;
    switch (page) {
        case 'meeting':
            content = <React.Suspense fallback={<p role="status">Carregando a sala…</p>}><MeetingRoom id={itemId} key={`${data.org.id}:${itemId}`}/></React.Suspense>;
            break;
        case 'clients':
        case 'sales':
            content = <CrmPage key={`${data.org.id}:${page}`} sales={page==='sales'}/>;
            break;
        case 'spaces':
            content = <SpacesPage/>;
            break;
        case 'workspace-settings':
            content = <SpaceSettingsPage workspaceId={itemId} key={itemId}/>;
            break;
        case 'workspace':
            content = <WorkspacePage workspaceId={itemId} key={itemId}/>;
            break;
        case 'project':
            content = project ? <ProjectPage key={project.id} project={project}/> : <div className="empty"><h3>Projeto não disponível</h3><p>Escolha um projeto na barra lateral.</p></div>;
            break;
        case 'my-tasks':
            content = <TaskList mine/>;
            break;
        case 'workspace-chat':
            content = workspace ? <ChatPage key={route} workspaceId={workspace.id}/> : <div className="empty">Workspace não disponível.</div>;
            break;
        case 'workspace-docs':
            content = workspace ? <DocsPage key={route} workspaceId={workspace.id}/> : <div className="empty">Workspace não disponível.</div>;
            break;
        case 'chat':
            content = <ChatPage conversationId={itemId}/>;
            break;
        case 'team':
            content = <TeamPage key={data.org.id}/>;
            break;
        case 'profile':
            content = <ProfilePage userId={itemId || data.me.id}/>;
            break;
        case 'inbox':
            content = <HiveInboxPage invitationCount={account?.invitations.length||0} onOpenPersonal={()=>setAccountOnly(true)}/>;
            break;
        case 'reports':
            content = <ReportsPage />;
            break;
        case 'calendar':
            content = <CalendarPage />;
            break;
        case 'docs':
            content = <DocsPage key={route} projectId={project?.id}/>;
            break;
        case 'support':
            content = <SupportPage />;
            break;
        case 'settings':
            content = <SettingsPage />;
            break;
        case 'files':
            content = <FilesPage projectId={itemId}/>;
            break;
        case 'meetings':
            content = <MeetingsPage />;
            break;
        default: content = page==='home'?<HiveHomePage/>:<HomePage />;
    }
    if(HIVE_SCREENS.has(page as HiveScreen))content=<HiveShell screen={page as HiveScreen} title={title} unread={unread} onAccount={()=>setStudioSwitcherOpen(true)} onLogout={async()=>{await request('/logout',{});await refresh();}}>{content}</HiveShell>;
    return <Context.Provider value={{ data, run, refresh, navigate, route, dialog, setDialog, toast }}><div className={`app-window ${compactNav?'compact-navigation':''} ${showMobileNavigation?'with-mobile-navigation':''}`}>{sidebar && <div className="sidebar-scrim" onClick={() => setSidebar(false)}/>}<aside className={`sidebar ${sidebar ? 'mobile-open' : ''}`}><div className="sidebar-brand"><Brand compact={compactNav&&!sidebar}/><button className="icon-button collapse-button" aria-label="Recolher navegação" onClick={() => {setSidebar(false);setCompactNav(true);}}><PanelLeftClose size={17}/></button></div><button className="org-switch" onClick={() => setAccountOnly(true)}><span className="org-monogram">F</span><span><strong>{data.org.name}</strong><small>Seu espaço de trabalho</small></span><ChevronDown size={14}/></button><div className="sidebar-scroll"><span className="section-label">SEU DIA A DIA</span><nav aria-label="Seu trabalho">{nav.slice(0,6).map(n => <button key={n.id} title={n.name} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => navigate(n.id)}><n.icon size={18}/><span>{n.name}</span>{n.id === 'inbox' && unread > 0 && <b className="count-badge">{unread}</b>}</button>)}</nav><div className="nav-separator"/><span className="section-label">JUNTOS, EM CONTEXTO</span><nav><button className={`nav-item ${page === 'chat' ? 'active' : ''}`} title="Conversas" onClick={() => navigate('chat')}><MessageSquare size={18}/>Conversas</button><button className={`nav-item ${(page === 'meetings'||page === 'meeting') ? 'active' : ''}`} title="Reuniões" onClick={() => navigate('meetings')}><Video size={18}/>Reuniões</button></nav><div className="nav-separator"/><SidebarSpaces/><details className="sidebar-tools" open={nav.slice(6).some(n=>n.id===page)||undefined}><summary><Settings size={15}/>Ferramentas<ChevronDown size={12}/></summary><nav aria-label="Ferramentas do Studio">{nav.slice(6).map(n=><button key={n.id} title={n.name} className={`nav-item ${page===n.id?'active':''}`} onClick={()=>navigate(n.id)}><n.icon size={16}/>{n.name}</button>)}</nav></details></div><div className="sidebar-bottom"><button className={`nav-item ${page === 'support' ? 'active' : ''}`} title="Ajuda e suporte" onClick={() => navigate('support')}><CircleHelp size={18}/>Ajuda e suporte<ArrowUpRight size={14}/></button><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} title="Configurações" onClick={() => navigate('settings')}><Settings size={18}/>Configurações</button><div className="local-label"><span className="live-dot"/> Ambiente local · dados no servidor</div><div className="account"><button onClick={() => navigate(`profile/${data.me.id}`)}><Avatar person={data.me} size={35}/><span><strong>{data.me.name}</strong><small>@{data.me.handle}</small></span></button><button className="icon-button" title="Sair" aria-label="Sair da conta" onClick={async () => { await request('/logout', {}); await refresh(); }}><LogOut size={16}/></button></div></div></aside><div className="main-shell"><header className="topbar"><button className="icon-button desktop-navigation-toggle" aria-label={compactNav?'Expandir navegação':'Recolher navegação'} aria-expanded={!compactNav} onClick={()=>setCompactNav(v=>!v)}><PanelLeftOpen size={19}/></button><button className="icon-button mobile-menu" aria-label="Abrir navegação" onClick={() => setSidebar(true)}><PanelLeftOpen size={19}/></button><Breadcrumbs data={data} route={route} title={title}/><div className="topbar-actions"><QuickActions/><RefreshData/><button className="search-trigger" onClick={() => setDialog({ kind: 'search' })}><Search size={16}/><span>Buscar no seu espaço</span><kbd>⌘ K</kbd></button><div className="topbar-divider"/><button className="notification-button icon-button" aria-label={`Inbox, ${unread} não lidas`} onClick={() => navigate('inbox')}><Bell size={19}/>{unread > 0 && <span />}</button><button className="topbar-avatar" aria-label="Meu perfil" onClick={() => navigate(`profile/${data.me.id}`)}><Avatar person={data.me} size={31}/></button></div></header>{offline && <div className="offline-banner"><WifiOff size={16}/>Conexão interrompida. As alterações não serão confirmadas até o servidor responder.<button onClick={() => refresh().catch(() => { })}>Tentar novamente</button></div>}<main className={`main-content page-${page}`}>{content}</main></div>{showMobileNavigation&&<MobileNavigation unread={unread}/>}</div>{message && <div className="toast" role="status"><CheckSquare2 size={18}/><span>{message}</span><button aria-label="Fechar aviso" onClick={() => setMessage('')}><X size={15}/></button></div>}<Dialogs />{studioSwitcherOpen&&account&&<StudioSwitcher studios={account.studios} activeId={data.org.id} onClose={()=>setStudioSwitcherOpen(false)} onCreate={()=>{setStudioSwitcherOpen(false);navigate(import.meta.env.MODE==='desktop'?'central':'landing/planos');}} onSelect={async id=>{await request('/studios/select',{orgId:id});setDialog(null);await refresh();navigate('home');}}/>}</Context.Provider>;
}
function Entry() {
    const [hash, setHash] = useState(location.hash);
    useEffect(() => { const change = () => setHash(location.hash); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
    const section = publicLandingSection(hash,import.meta.env.MODE==='desktop');
    if(hash==='#central'||hash.startsWith('#central/studio/'))return <React.Suspense fallback={<div className="boot" role="status"><Brand/><p>Conectando sua conta online…</p></div>}><CentralAccount studioId={hash.startsWith('#central/studio/')?hash.split('/')[2]:undefined}/></React.Suspense>;
    return section === null || !LandingPage ? <App /> : <React.Suspense fallback={<div className="boot" role="status"><Brand /><p>Preparando seu próximo espaço…</p></div>}><LandingPage section={section}/></React.Suspense>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Entry /></React.StrictMode>);
