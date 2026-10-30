const webPreferences=Object.freeze({nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,partition:'persist:forma-desktop'});
function desktopUrl(input){
 let u;try{u=new URL(input);}catch{throw new Error('Endereço desktop inválido.');}
 if(u.protocol!=='http:'||!['localhost','127.0.0.1'].includes(u.hostname)||u.username||u.password||u.pathname!=='/'||u.search)throw new Error('Use a raiz de um servidor local HTTP, sem credenciais ou parâmetros.');
 if(!u.hash)u.hash='home';return u.href;
}
function allowedNavigation(destination,origin){try{const u=new URL(destination);return u.origin===origin&&u.pathname==='/'&&!u.username&&!u.password&&!u.search;}catch{return false;}}
function allowedCheckout(destination){try{const u=new URL(destination);return u.protocol==='https:'&&u.hostname==='www.mercadopago.com.br'&&!u.port&&!u.username&&!u.password&&!u.hash&&u.pathname==='/subscriptions/checkout'&&u.searchParams.size===1&&/^[a-zA-Z0-9_-]{1,100}$/.test(u.searchParams.get('preapproval_id')||'');}catch{return false;}}
function windowBounds(saved,displays){
 const primary=displays[0]||{x:0,y:0,width:1366,height:900};
 const fallback={width:Math.min(1200,primary.width),height:Math.min(740,primary.height)};
 if(!saved||!['x','y','width','height'].every(k=>Number.isFinite(saved[k]))||saved.width<800||saved.height<600||saved.width>3840||saved.height>2160)return fallback;
 const display=displays.find(d=>Math.min(saved.x+saved.width,d.x+d.width)-Math.max(saved.x,d.x)>=80&&Math.min(saved.y+saved.height,d.y+d.height)-Math.max(saved.y,d.y)>=80);
 if(!display)return fallback;
 const width=Math.min(saved.width,display.width),height=Math.min(saved.height,display.height);
 return {x:Math.max(display.x,Math.min(saved.x,display.x+display.width-width)),y:Math.max(display.y,Math.min(saved.y,display.y+display.height-height)),width,height};
}
function isStatusSender(event,contents,statusUrl){return !!event.senderFrame&&event.sender===contents&&event.senderFrame===contents.mainFrame&&event.senderFrame.url.split('?')[0]===statusUrl;}
module.exports={desktopUrl,allowedNavigation,allowedCheckout,windowBounds,webPreferences,isStatusSender};
