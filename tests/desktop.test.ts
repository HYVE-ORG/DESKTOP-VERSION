import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const require=createRequire(import.meta.url);
const {desktopUrl,allowedNavigation,windowBounds,webPreferences,isStatusSender}=require('../apps/desktop/runtime.cjs');
test('checkout desktop abre somente assinatura HTTPS do Mercado Pago no navegador externo',()=>{
 const {allowedCheckout}=require('../apps/desktop/runtime.cjs');
 assert.equal(allowedCheckout('https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=abc123'),true);
 for(const url of ['https://www.mercadopago.com.br/other','https://www.mercadopago.com.br.evil.invalid/subscriptions/checkout?preapproval_id=abc','http://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=abc','https://user:pass@www.mercadopago.com.br/subscriptions/checkout?preapproval_id=abc','https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=abc&redirect=https://evil.invalid'])assert.equal(allowedCheckout(url),false);
});

test('preload restaura apenas tema válido antes da interface e acompanha mudanças',()=>{
 const source=readFileSync(new URL('../apps/desktop/preload.cjs',import.meta.url),'utf8');
 for(const saved of ['dark','hybrid','light','invalid']){
  const storage=new Map(),sent:unknown[]=[];let loaded=()=>{},changed=()=>{};
  const document={documentElement:{dataset:{theme:'hybrid'}}};
  runInNewContext(source,{require:()=>({contextBridge:{exposeInMainWorld(){}},ipcRenderer:{sendSync:()=>saved,send:(...args:unknown[])=>sent.push(args)}}),localStorage:{setItem:(key:string,value:string)=>storage.set(key,value)},window:{addEventListener:(_name:string,callback:()=>void)=>{loaded=callback;}},document,MutationObserver:class {constructor(callback:()=>void){changed=callback;}observe(){}}});
  assert.equal(storage.get('forma.appearance.v1'),saved==='invalid'?undefined:saved);
  loaded();assert.deepEqual(sent,[['forma:appearance:set','hybrid']]);
  document.documentElement.dataset.theme='dark';changed();assert.deepEqual(sent[1],['forma:appearance:set','dark']);
  document.documentElement.dataset.theme='invalid';changed();assert.equal(sent.length,2);
 }
});
test('desktop valida override local e nunca aceita credenciais, origem remota ou caminhos externos',()=>{
    assert.equal(desktopUrl('http://127.0.0.1:5173/#home'),'http://127.0.0.1:5173/#home');
    assert.equal(desktopUrl('http://localhost:4100'),'http://localhost:4100/#home');
    for(const url of ['https://exemplo.com','http://localhost.evil.test','file:///C:/segredo','javascript:alert(1)','http://admin:senha@localhost:4100','http://localhost:4100/api/files/x','http://localhost:4100/?token=segredo'])assert.throws(()=>desktopUrl(url));
    assert.ok(allowedNavigation('http://127.0.0.1:45000/#clients','http://127.0.0.1:45000'));
    assert.equal(allowedNavigation('http://127.0.0.1:45000/api/files/x','http://127.0.0.1:45000'),false);
    assert.equal(allowedNavigation('http://127.0.0.1:45001/','http://127.0.0.1:45000'),false);
    assert.equal(allowedNavigation('file:///etc/passwd','http://127.0.0.1:45000'),false);
});
test('desktop restaura limites úteis e mantém isolamento do renderer',()=>{
    const display={x:0,y:0,width:1366,height:768};
    assert.deepEqual(windowBounds({x:9000,y:9000,width:-1,height:100000},[display]),{width:1200,height:740});
    const restored=windowBounds({x:20,y:30,width:1100,height:700},[display]);
    assert.deepEqual(restored,{x:20,y:30,width:1100,height:700});
    assert.equal(webPreferences.nodeIntegration,false);
    assert.equal(webPreferences.contextIsolation,true);
    assert.equal(webPreferences.sandbox,true);
    assert.equal(webPreferences.webSecurity,true);
});
test('IPC nativo exige janela e frame principal da página de status empacotada',()=>{
 const status='file:///C:/Forma/status.html';const frame={url:status+'?state=admin'},contents={mainFrame:frame};
 assert.equal(isStatusSender({sender:contents,senderFrame:frame},contents,status),true);
 assert.equal(isStatusSender({sender:contents,senderFrame:{url:frame.url}},contents,status),false);
 assert.equal(isStatusSender({sender:contents,senderFrame:null},contents,status),false);
 assert.equal(isStatusSender({sender:{mainFrame:frame},senderFrame:frame},contents,status),false);
 frame.url='http://127.0.0.1:4100/#home';assert.equal(isStatusSender({sender:contents,senderFrame:frame},contents,status),false);
});
