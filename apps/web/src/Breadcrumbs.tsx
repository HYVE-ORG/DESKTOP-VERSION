import {Fragment} from 'react';
import { CaretRightIcon as ChevronRight } from '@phosphor-icons/react';
import {spaceTab,spaceTabs} from './navigation';
import type {Snapshot} from '../../../packages/contracts';
export function breadcrumbItems(data:Pick<Snapshot,'projects'|'workspaces'>,route:string,title:string){
 const [page,id]=route.split('/');
 const project=['project','files','docs'].includes(page)?data.projects.find(p=>p.id===id):undefined;
 const area=project?data.workspaces.find(w=>w.id===project.workspaceId):['workspace','workspace-settings','workspace-chat','workspace-docs'].includes(page)?data.workspaces.find(w=>w.id===id):undefined;
 const items=[{name:'Início',href:'#home'}];
 if(area)items.push({name:area.name,href:`#workspace/${area.id}`});
 if(page==='workspace'&&area&&spaceTab(route)!=='overview')items.push({name:spaceTabs[spaceTab(route)],href:`#${route}`});
 if(project)items.push({name:project.name,href:`#project/${project.id}`});
 if(page!=='home'&&page!=='workspace'&&page!=='project')items.push({name:page==='workspace-settings'?'Configurações':page==='workspace-chat'?'Conversas':['workspace-docs','docs'].includes(page)?'Documentos':page==='files'?'Arquivos':title,href:`#${route}`});
 if(items.length===1&&page!=='home')items.push({name:title,href:`#${route}`});
 return items;
}
export function Breadcrumbs({data,route,title}:{data:Snapshot;route:string;title:string}){
 const items=breadcrumbItems(data,route,title);
 return <nav className="breadcrumb" aria-label="Caminho de navegação">{items.map((item,index)=><Fragment key={`${item.href}-${index}`}>{index>0&&<ChevronRight size={14} aria-hidden="true"/>}<a href={item.href} aria-current={index===items.length-1?'page':undefined}>{item.name}</a></Fragment>)}</nav>;
}
