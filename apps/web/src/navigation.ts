import type {Snapshot} from '../../../packages/contracts';
import type {Dialog} from './context';
export const spaceTabs={overview:'Visão geral',chat:'Chat',tasks:'Tarefas',docs:'Documentos',files:'Arquivos',meetings:'Reuniões'} as const;
export type SpaceTab=keyof typeof spaceTabs;
export function spaceTab(route:string):SpaceTab{const value=route.split('/')[2];return Object.hasOwn(spaceTabs,value)?value as SpaceTab:'overview';}
export function quickActions(data:Snapshot,route:string):{label:string;context:string;dialog:NonNullable<Dialog>}[]{
 const [page,id]=route.split('/');
 const area=['workspace','workspace-settings','workspace-chat','workspace-docs'].includes(page)?id:undefined;
 const projectId=['project','files','docs'].includes(page)?id:page==='meeting'?data.calendar.find(e=>e.id===id)?.projectId:page==='chat'&&id?data.conversations.find(c=>c.id===id)?.projectId:undefined;
 const project=data.projects.find(p=>!p.archived&&(!area||p.workspaceId===area)&&(!projectId||p.id===projectId)&&(data.me.role==='admin'||data.me.role==='coordinator'&&data.me.projectIds.includes(p.id)&&data.me.workspaceIds.includes(p.workspaceId)));
 const actions:ReturnType<typeof quickActions>=[];
 if(project){for(const [kind,label] of [['task-create','Nova tarefa'],['meeting-now','Reunir agora'],['event','Agendar encontro'],['doc','Novo documento']] as const)actions.push({label,context:project.name,dialog:{kind,projectId:project.id}});}
 if(data.me.role==='admin')actions.push({label:'Novo Space',context:'Neste Studio',dialog:{kind:'workspace'}});
 return actions;
}
