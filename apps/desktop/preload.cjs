const {contextBridge,ipcRenderer}=require('electron');
// Main accepts these channels only from its packaged status page and main frame.
contextBridge.exposeInMainWorld('formaDesktop',Object.freeze({retry:()=>ipcRenderer.invoke('forma:retry'),quit:()=>ipcRenderer.invoke('forma:quit'),provision:(input)=>ipcRenderer.invoke('forma:provision',input),checkUpdate:()=>ipcRenderer.invoke('forma:update:check')}));
// The loopback port changes on each launch; keep only the appearance enum in the native profile.
try{const theme=ipcRenderer.sendSync('forma:appearance:get');if(['light','dark','hybrid'].includes(theme))localStorage.setItem('forma.appearance.v1',theme);}catch{}
window.addEventListener('DOMContentLoaded',()=>{
 const save=()=>{const theme=document.documentElement.dataset.theme;if(['light','dark','hybrid'].includes(theme))ipcRenderer.send('forma:appearance:set',theme);};
 new MutationObserver(save).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});save();
});
