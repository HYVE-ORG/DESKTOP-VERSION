import {test} from 'node:test';
import assert from 'node:assert/strict';
import {breadcrumbItems} from '../apps/web/src/Breadcrumbs';
const data={workspaces:[{id:'design',orgId:'studio',name:'Design',color:'#eee'}],projects:[{id:'site',orgId:'studio',workspaceId:'design',name:'Website',description:'',color:'#eee',archived:false,version:1}]};
test('project breadcrumb navigates to Home, its area and project',()=>{
 assert.deepEqual(breadcrumbItems(data,'project/site','Website'),[{name:'Início',href:'#home'},{name:'Design',href:'#workspace/design'},{name:'Website',href:'#project/site'}]);
 assert.deepEqual(breadcrumbItems(data,'workspace-settings/design','Configurações').map(i=>i.name),['Início','Design','Configurações']);
 assert.deepEqual(breadcrumbItems(data,'workspace/design/chat','Design').map(i=>i.name),['Início','Design','Chat']);
 assert.deepEqual(breadcrumbItems(data,'workspace/design','Design').map(i=>i.href),['#home','#workspace/design']);
 assert.deepEqual(breadcrumbItems(data,'workspace-chat/design','Design · Conversas').map(i=>i.name),['Início','Design','Conversas']);
});
test('unknown/inaccessible project and unrelated routes do not invent parent links',()=>{
 assert.deepEqual(breadcrumbItems(data,'project/hidden','Projeto').map(i=>i.href),['#home','#project/hidden']);
 assert.deepEqual(breadcrumbItems(data,'profile/site','Perfil').map(i=>i.name),['Início','Perfil']);
});

test('Início não repete o mesmo destino no breadcrumb',()=>{
 assert.deepEqual(breadcrumbItems(data,'home','Início'),[{name:'Início',href:'#home'}]);
});
