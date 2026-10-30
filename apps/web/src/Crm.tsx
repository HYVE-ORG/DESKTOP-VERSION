import { useState } from 'react';
import { PlusIcon as Plus, MagnifyingGlassIcon as Search, UsersIcon as Users, ArrowUpRightIcon as ArrowUpRight, FileTextIcon as FileText, PencilIcon as Pencil, CheckCircleIcon as CheckCircle2, BriefcaseIcon as BriefcaseBusiness } from '@phosphor-icons/react';
import type { Contact, Opportunity, SalesStage } from '../../../packages/contracts';
import { useWorkspace, Empty } from './context';
import { Modal, ModalForm } from './Modal';
import { paginateTeam } from './teamPaging';
import { TeamPagination } from './TeamPagination';
import './crm.css';

const stages:Record<SalesStage,string>={new:'Novas',qualified:'Qualificadas',proposal:'Em proposta',won:'Ganhas',lost:'Perdidas'};
const kinds={lead:'Lead',client:'Cliente',vendor:'Fornecedor'};
const money=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
function cents(form:FormData,name:string) {
    const value=String(form.get(name)||'').trim();
    if(!/^\d{1,8}([.,]\d{1,2})?$/.test(value))throw new Error('Informe um valor em reais com até duas casas decimais.');
    const [whole,fraction='']=value.replace(',','.').split('.');
    const result=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    if(result>1_000_000_000)throw new Error('O valor máximo por registro é R$ 10.000.000,00.');
    return result;
}
const moneyInput=(value:number)=>(value/100).toFixed(2);
function useCrm() {
    const context=useWorkspace();
    return {...context,crm:context.data.crm||{contacts:[],opportunities:[],proposals:[]},areas:context.data.workspaces.filter(w=>context.data.me.role==='admin'||context.data.me.role==='coordinator'&&context.data.me.workspaceIds.includes(w.id))};
}
export function CrmPage({sales=false}:{sales?:boolean}) {
    const {data,crm,areas,setDialog}=useCrm();
    const [query,setQuery]=useState(''),[area,setArea]=useState(''),[page,setPage]=useState(1);
    if(data.me.role==='user')return <Empty title="Gestão comercial restrita">Seu cargo não possui acesso a clientes e propostas.</Empty>;
    const matches=(workspaceId:string,text:string)=>(!area||workspaceId===area)&&text.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'));
    const contacts=crm.contacts.filter(c=>matches(c.workspaceId,`${c.name} ${c.company} ${c.email}`));
    const opportunities=crm.opportunities.filter(o=>matches(o.workspaceId,`${o.title} ${crm.contacts.find(c=>c.id===o.contactId)?.name||''}`));
    const pagination={...paginateTeam(contacts,page),noun:'contato',group:'de contatos'};
    const open=opportunities.filter(o=>o.stage!=='won'&&o.stage!=='lost');
    return <section className="crm-page"><header className="crm-heading"><div><span className="eyebrow">GESTÃO DO STUDIO</span><h1>{sales?'Comercial':'Clientes'}</h1><p>{sales?'Da primeira conversa ao próximo projeto.':'Pessoas e empresas que fazem parte do seu trabalho.'}</p></div><button className="button primary" disabled={!areas.length||sales&&!crm.contacts.length} onClick={()=>setDialog({kind:sales?'crm-opportunity':'crm-contact'})}><Plus size={16}/>{sales?'Nova oportunidade':'Novo contato'}</button></header>
        <div className="crm-stats"><article><Users size={20}/><strong>{sales?opportunities.length:contacts.length}</strong><span>{sales?'Oportunidades':'Contatos encontrados'}</span></article><article><BriefcaseBusiness size={20}/><strong>{money(open.reduce((n,o)=>n+o.valueCents,0))}</strong><span>Pipeline aberto · estimativa em BRL</span></article><article><CheckCircle2 size={20}/><strong>{opportunities.filter(o=>o.stage==='won').length}</strong><span>Oportunidades convertidas</span></article></div>
        <div className="crm-toolbar"><label className="crm-search"><Search size={16}/><input aria-label={sales?'Buscar oportunidades':'Buscar clientes'} placeholder={sales?'Buscar por oportunidade ou contato…':'Buscar nome, empresa ou e-mail…'} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></label><label>Área<select aria-label="Filtrar área comercial" value={area} onChange={e=>{setArea(e.target.value);setPage(1);}}><option value="">Todas as áreas permitidas</option>{areas.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label></div>
        {sales?<><div className="crm-pipeline">{Object.entries(stages).map(([stage,label])=><section className={`crm-column stage-${stage}`} key={stage}><h2><span/>{label}<b>{opportunities.filter(o=>o.stage===stage).length}</b></h2>{opportunities.filter(o=>o.stage===stage).map(o=><OpportunityCard key={o.id} opportunity={o}/>)}{!opportunities.some(o=>o.stage===stage)&&<p className="crm-column-empty">Nenhuma oportunidade</p>}</section>)}</div>{!crm.contacts.length&&<Empty title="Tudo começa com um contato" action={<a className="button" href="#clients">Cadastrar cliente ou lead</a>}>Cadastre um contato antes de abrir uma oportunidade.</Empty>}</>:
        <><div className="crm-contacts">{pagination.items.map(c=><article key={c.id}><div className="crm-contact-top"><span className="crm-monogram">{c.name.slice(0,2).toUpperCase()}</span><span className="crm-tag">{kinds[c.kind]}</span></div><h2>{c.name}</h2><p>{c.company||'Empresa não informada'}</p><dl><dt>E-mail</dt><dd>{c.email||'Não informado'}</dd><dt>Telefone</dt><dd>{c.phone||'Não informado'}</dd><dt>Área</dt><dd>{areas.find(w=>w.id===c.workspaceId)?.name}</dd></dl>{c.notes&&<p className="crm-notes">{c.notes}</p>}<footer><button className="button" onClick={()=>setDialog({kind:'crm-contact',id:c.id})}><Pencil size={14}/>Editar</button><button className="button" onClick={()=>setDialog({kind:'crm-opportunity',projectId:c.id})}>Nova oportunidade<ArrowUpRight size={14}/></button></footer></article>)}</div><TeamPagination {...pagination} onPage={setPage}/>{!contacts.length&&<Empty title={crm.contacts.length?'Nenhum contato encontrado':'Seu primeiro relacionamento começa aqui'}>Cadastre clientes, leads e fornecedores, mantendo cada contato na sua área de trabalho.</Empty>}</>}
        <p className="crm-footnote">Gestão interna por área. Valores comerciais são estimativas; propostas não emitem cobranças ou documentos fiscais.</p></section>;
}
function OpportunityCard({opportunity:o}:{opportunity:Opportunity}) {
    const {crm,data,setDialog}=useCrm();
    const proposals=crm.proposals.filter(p=>p.opportunityId===o.id);
    return <article className="crm-opportunity"><span className="crm-tag">{crm.contacts.find(c=>c.id===o.contactId)?.name}</span><h3>{o.title}</h3><strong>{money(o.valueCents)}</strong><p>{o.description||'Sem descrição adicional.'}</p><div className="crm-card-actions">{!o.projectId&&<button className="button" onClick={()=>setDialog({kind:'crm-opportunity',id:o.id})}><Pencil size={13}/>Editar etapa</button>}{!o.projectId&&o.stage!=='lost'&&<button className="button" onClick={()=>setDialog({kind:'crm-proposal',projectId:o.id})}><Plus size={13}/>Proposta</button>}</div>{proposals.map(p=><button className="crm-proposal-link" key={p.id} onClick={()=>setDialog({kind:'crm-proposal',id:p.id})}><FileText size={14}/><span>{p.title}<small>v{p.version} · {p.status==='accepted'?'Aceita':'Rascunho'} · {money(p.totalCents)}</small></span><ArrowUpRight size={13}/></button>)}{o.projectId&&data.projects.some(p=>p.id===o.projectId)&&<a className="button crm-project-link" href={`#project/${o.projectId}`}>Abrir projeto<ArrowUpRight size={14}/></a>}</article>;
}
export function CrmDialog() {
    const {dialog,data,crm}=useCrm();
    if(!dialog)return null;
    if(data.me.role==='user'||dialog.id&&![...crm.contacts,...crm.opportunities,...crm.proposals].some(r=>r.id===dialog.id))return <Modal title="Registro não disponível"><Empty title="Acesso indisponível">Feche esta janela e confira suas permissões.</Empty></Modal>;
    if(dialog.kind==='crm-contact')return <ContactForm/>;
    if(dialog.kind==='crm-opportunity')return <OpportunityForm/>;
    return <ProposalForm accepting={dialog.kind==='crm-accept'}/>;
}
function ContactForm() {
    const {crm,areas,dialog,run}=useCrm();
    const [original]=useState(()=>crm.contacts.find(c=>c.id===dialog?.id));
    return <ModalForm title={original?'Editar contato':'Novo contato'} subtitle="Este cadastro é visível apenas à gestão da área." onSubmit={async f=>{await run('crm.contact.save',{...(original?{id:original.id,version:original.version}:{}),workspaceId:String(f.get('workspaceId')),name:String(f.get('name')),email:String(f.get('email')),phone:String(f.get('phone')),company:String(f.get('company')),notes:String(f.get('notes')),kind:String(f.get('kind'))});}}>
        <label>Nome<input name="name" required maxLength={120} defaultValue={original?.name} autoFocus/></label><label>Área<select name="workspaceId" required defaultValue={original?.workspaceId} disabled={!!original}>{areas.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>{original&&<input type="hidden" name="workspaceId" value={original.workspaceId}/>}</label><label>Tipo<select name="kind" defaultValue={original?.kind||'client'}>{Object.entries(kinds).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label><label>Empresa<input name="company" maxLength={120} defaultValue={original?.company}/></label><label>E-mail<input name="email" type="email" maxLength={200} defaultValue={original?.email}/></label><label>Telefone<input name="phone" type="tel" maxLength={40} defaultValue={original?.phone}/></label><label>Notas<textarea name="notes" maxLength={3000} rows={3} defaultValue={original?.notes}/></label>
    </ModalForm>;
}
function OpportunityForm() {
    const {crm,areas,dialog,run}=useCrm();
    const [original]=useState(()=>crm.opportunities.find(o=>o.id===dialog?.id));
    const initialContact=crm.contacts.find(c=>c.id===(original?.contactId||dialog?.projectId));
    const [area,setArea]=useState(original?.workspaceId||initialContact?.workspaceId||areas[0]?.id||'');
    const contacts=crm.contacts.filter(c=>c.workspaceId===area);
    return <ModalForm title={original?'Editar oportunidade':'Nova oportunidade'} disabled={!contacts.length} onSubmit={async f=>{await run('crm.opportunity.save',{...(original?{id:original.id,version:original.version}:{}),workspaceId:area,contactId:String(f.get('contactId')),title:String(f.get('title')),description:String(f.get('description')),stage:String(f.get('stage')),valueCents:cents(f,'value')});}}>
        <label>Título<input name="title" required maxLength={100} defaultValue={original?.title} autoFocus/></label><label>Área<select value={area} disabled={!!original} onChange={e=>setArea(e.target.value)}>{areas.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label>Contato<select name="contactId" key={area} required defaultValue={initialContact?.workspaceId===area?initialContact.id:undefined}>{contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{!contacts.length&&<p role="status">Cadastre um contato nesta área primeiro.</p>}<label>Etapa<select name="stage" defaultValue={original?.stage||'new'}>{Object.entries(stages).filter(([id])=>id!=='won').map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><small>Ganha é definida pelo aceite de uma proposta.</small></label><label>Valor estimado (R$)<input name="value" inputMode="decimal" required defaultValue={moneyInput(original?.valueCents||0)} maxLength={12}/></label><label>Descrição<textarea name="description" maxLength={3000} rows={4} defaultValue={original?.description}/></label>
    </ModalForm>;
}
function ProposalForm({accepting}:{accepting:boolean}) {
    const {crm,dialog,run,setDialog,navigate}=useCrm();
    const [original]=useState(()=>crm.proposals.find(p=>p.id===dialog?.id));
    const opportunity=crm.opportunities.find(o=>o.id===(original?.opportunityId||dialog?.projectId));
    if(!opportunity)return <Empty title="Oportunidade não disponível"/>;
    if(accepting&&original)return <ModalForm title="Registrar aceite do cliente" label="Confirmar e criar projeto" subtitle="Esta ação converte a oportunidade uma única vez." onSubmit={async f=>{const result=await run('crm.proposal.accept',{id:original.id,version:original.version,acceptanceNote:String(f.get('acceptanceNote'))});navigate(`project/${result.projectId}`);}}><p><strong>{original.title}</strong> · {money(original.totalCents)} · versão {original.version}</p><label>Referência do aceite<textarea name="acceptanceNote" required minLength={5} maxLength={1000} rows={3} placeholder="Ex.: aceite recebido por e-mail em 23/10, confirmado por Maria." autoFocus/></label><label className="crm-confirm"><input type="checkbox" required/>Confirmo que o cliente aceitou esta versão e que estou registrando essa decisão.</label><p>O projeto e seu chat serão criados na área da oportunidade. Esta ação não cobra o cliente.</p></ModalForm>;
    const accepted=original?.status==='accepted';
    return <ModalForm title={original?'Proposta comercial':'Nova proposta'} subtitle={`${opportunity.title} · BRL${original?` · versão ${original.version}`:''}`} disabled={accepted} label="Salvar versão" onSubmit={async f=>{await run('crm.proposal.save',{...(original?{id:original.id,version:original.version}:{}),opportunityId:opportunity.id,title:String(f.get('title')),body:String(f.get('body')),totalCents:cents(f,'value')});}}><label>Título<input name="title" required maxLength={120} defaultValue={original?.title||`Proposta · ${opportunity.title}`} readOnly={accepted} autoFocus/></label><label>Escopo e condições<textarea name="body" required maxLength={10000} rows={7} defaultValue={original?.body} readOnly={accepted}/></label><label>Valor total (R$)<input name="value" inputMode="decimal" required maxLength={12} defaultValue={moneyInput(original?.totalCents??opportunity.valueCents)} readOnly={accepted}/></label>{original&&!accepted&&<button type="button" className="button" onClick={()=>setDialog({kind:'crm-accept',id:original.id})}><CheckCircle2 size={15}/>Registrar aceite desta versão salva</button>}{accepted&&<div className="notice subtle"><CheckCircle2 size={18}/><p>Proposta aceita em {new Date(original.acceptedAt!).toLocaleDateString('pt-BR')}.<br/>{original.acceptanceNote}</p></div>}{!!original?.revisions.length&&<details className="crm-revisions"><summary>Histórico · {original.revisions.length} versão(ões) anterior(es)</summary>{[...original.revisions].reverse().map(r=><article key={r.version}><strong>v{r.version} · {r.title} · {money(r.totalCents)}</strong><small>{new Date(r.at).toLocaleString('pt-BR')}</small><p>{r.body}</p></article>)}</details>}</ModalForm>;
}
