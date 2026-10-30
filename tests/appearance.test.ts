import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTheme,saveTheme } from '../apps/web/src/appearance';
test('theme preferences tolerate unavailable storage and invalid values',()=>{
 const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
 assert.equal(loadTheme(denied),'light');assert.equal(saveTheme('dark',denied),false);
 let value='unknown';const storage={getItem:()=>value,setItem:(_k:string,v:string)=>{value=v;}};
 assert.equal(loadTheme(storage),'light');assert.equal(saveTheme('hybrid',storage),true);assert.equal(loadTheme(storage),'hybrid');
});
