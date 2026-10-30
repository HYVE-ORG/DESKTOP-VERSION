import {request,ApiError} from './api';
let renewal:Promise<unknown>|undefined;
function renew(){return renewal ||= request('/central/refresh',{}).finally(()=>{renewal=undefined;});}
export async function centralRequest<T=any>(path:string,body?:unknown):Promise<T>{
 try{return await request<T>('/central'+path,body);}
 catch(e){
  if(!(e instanceof ApiError)||e.status!==401||['/login','/register','/refresh','/logout','/status'].includes(path))throw e;
  await renew();
  return request<T>('/central'+path,body);
 }
}
export async function centralFileResponse(path:string,options:RequestInit={}){
 const send=()=>fetch('/api/central'+path,{...options,credentials:'include'});
 let res=await send();
 if(res.status===401){await res.body?.cancel();await renew();res=await send();}
 if(!res.ok){const error=await res.json().catch(()=>({}));throw new ApiError(error.message||'Arquivo indisponível.',res.status);}
 return res;
}
export async function centralQuery<T=any>(path:string,signal?:AbortSignal):Promise<T>{return (await centralFileResponse(path,{signal})).json();}
