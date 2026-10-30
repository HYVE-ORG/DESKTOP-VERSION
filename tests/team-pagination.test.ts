import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paginateTeam} from '../apps/web/src/teamPaging';
test('team pages stop at 20 and keep all members exactly once',()=>{
 for(const total of [0,1,19,20,21,40,41]){
  const people=Array.from({length:total},(_,id)=>({id}));
  const pages=paginateTeam(people,1).pages;
  const collected=Array.from({length:pages},(_,i)=>paginateTeam(people,i+1)).flatMap(p=>p.items);
  assert.deepEqual(collected,people);
  assert.equal(pages,Math.max(1,Math.ceil(total/20)));
  for(let i=1;i<=pages;i++)assert.ok(paginateTeam(people,i).items.length<=20);
 }
});
test('shrinking/filtering a team clamps stale pages and preserves range labels',()=>{
 const people=Array.from({length:41},(_,id)=>id);
 assert.deepEqual(paginateTeam(people,3),{items:[40],page:3,pages:3,total:41,start:41,end:41});
 const filtered=paginateTeam(people.filter(id=>id<3),3);
 assert.equal(filtered.page,1);assert.deepEqual(filtered.items,[0,1,2]);
 assert.equal(paginateTeam([],9).start,0);
 assert.equal(paginateTeam(people,-1).page,1);
 assert.equal(paginateTeam(people,NaN).page,1);
});
