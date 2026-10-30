import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { test } from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {HiveShell,HIVE_SCREENS} from '../apps/web/src/HiveShell';
import {Context} from '../apps/web/src/context';
import {seedState} from '../apps/api/src/seed';
import {snapshot} from '../apps/api/src/views';

const src = new URL('../apps/web/src/', import.meta.url);
const publicHive = new URL('../apps/web/public/assets/figma/hive/', import.meta.url);

const source = (file: string) => readFileSync(new URL(file, src), 'utf8');

test('every private screen renders the shared shell for all roles without losing its content',()=>{
 const state=seedState('Admin','qa@example.invalid','hash',true);
 for(const role of ['admin','coordinator','user']){
  const person=state.users.find(user=>user.role===role)!;
  for(const screen of HIVE_SCREENS){
   const data=snapshot(state,person);
   const html=renderToStaticMarkup(createElement(Context.Provider,{value:{data,run:async()=>({}),refresh:async()=>{},navigate:()=>{},route:screen,dialog:null,setDialog:()=>{},toast:()=>{}}},createElement(HiveShell,{screen,children:createElement('h1',null,`Content ${screen}`)})));
   assert.ok(html.includes(`Content ${screen}`),`${role}:${screen}`);
   for(const destination of ['Início','Inbox','Minhas tarefas','Calendário','Spaces','Equipe','Configurações'])assert.ok(html.includes(`aria-label="${destination}"`),destination);
   assert.equal(html.includes('>Clientes</button>'),role!=='user');
  }
 }
});

test('hive shell is scoped to the approved screens', () => {
  const main = source('main.tsx');
  const shell = source('HiveShell.tsx');
  const scoped = shell.match(/HIVE_SCREENS\s*=\s*new Set\(([^;]+)\)/)?.[1] ?? '';

  assert.match(main, /HIVE_SCREENS/);
  for (const screen of ['home','my-tasks','inbox','calendar','spaces','workspace','project','team','chat','docs','files','meetings','meeting','reports','settings','support','clients','sales','profile'])
    assert.match(scoped, new RegExp(`['"]${screen}['"]`));
  assert.doesNotMatch(scoped, /['"]landing['"]/);
});

test('hive assets are local and non-empty', () => {
  assert.equal(existsSync(publicHive), true);
  const files = readdirSync(publicHive).filter(file => !file.startsWith('.'));
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(statSync(new URL(file, publicHive)).size > 0, file);
});

test('hive source has no temporary figma asset urls', () => {
  const files = ['HiveShell.tsx', 'hive-figma.css', 'main.tsx'];
  for (const file of files) assert.doesNotMatch(source(file), /figma\.com\/api\/mcp\/asset/i);
});

test('Hive create menu exposes the approved actions and Home uses real recent materials', () => {
  const shell = source('HiveShell.tsx');
  const work = source('HiveHome.tsx');
  const actions = [
    ['Nova tarefa', 'task-create'],
    ['Reunir agora', 'meeting-now'],
    ['Agendar encontro', 'event'],
    ['Novo documento', 'doc'],
    ['Novo Space', 'workspace'],
  ];
  for (const [label, kind] of actions) {
    assert.match(shell, new RegExp(label));
    assert.match(shell, new RegExp(kind));
  }
  assert.match(work, /Materiais recentes/);
  assert.match(work, /data\.documents/);
  assert.doesNotMatch(work, /Onboarding Flow|Diana Kors|Lucas Mendes/);
});

test('Hive Inbox keeps Studio notifications separate from personal invitations', () => {
  const inbox = source('HiveInbox.tsx');
  const pages = source('Pages.tsx');
  const shell = source('HiveShell.tsx');
  assert.match(inbox, /hive-inbox-grid/);
  assert.match(inbox, /Convites para Studios/);
  assert.match(inbox, /onOpenPersonal/);
  assert.match(pages, /Todas/);
  assert.match(pages, /Não lidas/);
  assert.match(shell, /hive-popover-empty/);
  assert.match(shell, /notifications\.length/);
});
