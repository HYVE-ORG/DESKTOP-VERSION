import {DomainError} from './errors';

interface SupabaseConfig {url:string;publishableKey:string;}
type AuthFetch=(url:string,options:RequestInit)=>Promise<Response>;
const unavailable=()=>new DomainError('Não foi possível validar a identidade no Supabase. Tente novamente.',503);

export class SupabaseIdentity {
 private readonly origin:string;
 constructor(private readonly config:SupabaseConfig,private readonly authFetch:AuthFetch=fetch){
  let url:URL;try{url=new URL(config.url);}catch{throw Error('Configuração Supabase inválida.');}
  if(url.protocol!=='https:'||!url.hostname.match(/^[a-z0-9-]+\.supabase\.co$/)||url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey))throw Error('Configuração Supabase inválida: use URL do projeto e chave publishable.');
  this.origin=url.origin;
 }
 private async get(path:string,authorization?:string):Promise<unknown>{
  try{
   const response=await this.authFetch(this.origin+'/auth/v1/'+path,{headers:{apikey:this.config.publishableKey,...(authorization?{Authorization:authorization}:{})},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
   if(authorization&&(response.status===401||response.status===403))throw new DomainError('Sessão Supabase inválida ou expirada.',401);
   if(!response.ok||!response.body)throw unavailable();
   const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
   try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>65536)throw unavailable();chunks.push(chunk.value);}}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch(error){if(error instanceof DomainError)throw error;throw unavailable();}
 }
 async verify(authorization:string|undefined):Promise<{provider:'supabase';id:string}>{
  if(!authorization||!/^Bearer [A-Za-z0-9._-]{1,8192}$/.test(authorization))throw new DomainError('Envie uma sessão Supabase válida.',401);
  const user=await this.get('user',authorization) as {id?:unknown};
  if(!user||typeof user.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(user.id))throw unavailable();
  return {provider:'supabase',id:user.id};
 }
 async checkConnection(){
  const settings=await this.get('settings');
  if(!settings||typeof settings!=='object'||!('external' in settings))throw unavailable();
  return {authReachable:true,databaseVerified:false};
 }
}

export function supabaseIdentityFromEnv(env:NodeJS.ProcessEnv):SupabaseIdentity|undefined{
 if(!env.SUPABASE_URL&&!env.SUPABASE_PUBLISHABLE_KEY)return undefined;
 return new SupabaseIdentity({url:env.SUPABASE_URL||'',publishableKey:env.SUPABASE_PUBLISHABLE_KEY||''});
}
