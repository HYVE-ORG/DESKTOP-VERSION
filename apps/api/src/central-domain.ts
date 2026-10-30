import {DomainError} from './errors';
import {SupabaseIdentity} from './supabase-identity';
import {centralCookies,type CentralTokens} from './central-session';
import {MAX_UPLOAD} from './files';

interface Config {url:string;publishableKey:string;}
type RemoteFetch=(url:string,options:RequestInit)=>Promise<Response>;
export class CentralDomain {
 constructor(private readonly config:Config,private readonly remote:RemoteFetch=fetch){new SupabaseIdentity(config);}
 private async auth(path:string,body:Record<string,unknown>,authorization?:string):Promise<any>{
  try{
   const res=await this.remote(new URL('/auth/v1/'+path,this.config.url).href,{method:'POST',headers:{apikey:this.config.publishableKey,'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},body:JSON.stringify(body),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!res.ok){await res.body?.cancel();throw new DomainError(res.status===429?'Aguarde antes de tentar novamente.':res.status>=500?'O serviço de contas está indisponível.':'Não foi possível autenticar. Confira os dados e a confirmação do e-mail.',res.status===429?429:res.status>=500?503:401);}
   return res.status===204?null:await boundedJson(res);
  }catch(e){if(e instanceof DomainError)throw e;throw new DomainError('O serviço de contas está indisponível. Tente novamente.',503);}
 }
 private tokens(data:any):CentralTokens{
  const tokens={accessToken:data?.access_token,refreshToken:data?.refresh_token,expiresIn:data?.expires_in};
  try{centralCookies(tokens,false);return tokens;}catch{throw new DomainError('O serviço de contas retornou uma sessão inválida.',503);}
 }
 async signIn(email:string,password:string){return this.tokens(await this.auth('token?grant_type=password',{email,password}));}
 async refresh(refreshToken:string){return this.tokens(await this.auth('token?grant_type=refresh_token',{refresh_token:refreshToken}));}
 async register(email:string,password:string){const result=await this.auth('signup',{email,password});return {confirmationRequired:!result?.access_token};}
 async signOut(authorization:string|undefined){if(!authorization||!/^Bearer [A-Za-z0-9._-]{1,8192}$/.test(authorization))throw new DomainError('Sessão inválida.',401);await this.auth('logout?scope=local',{},authorization);}
 async closeSession(authorization:string|undefined,refreshToken:string|undefined){
  if(authorization){try{await this.signOut(authorization);return;}catch(e){if(!(e instanceof DomainError)||e.status!==401)throw e;}}
  if(!refreshToken)return;
  let tokens:CentralTokens;
  try{tokens=await this.refresh(refreshToken);}catch(e){if(e instanceof DomainError&&e.status===401)return;throw e;}
  await this.signOut('Bearer '+tokens.accessToken);
 }
 private async rpc(name:string,authorization:string|undefined,body:Record<string,unknown>={},allowAnonymous=false){
  if((!authorization&&!allowAnonymous)||(authorization&&!/^Bearer [A-Za-z0-9._-]{1,8192}$/.test(authorization)))throw new DomainError('Entre na sua conta central.',401);
  try{
   const res=await this.remote(new URL('/rest/v1/rpc/'+name,this.config.url).href,{method:'POST',headers:{apikey:this.config.publishableKey,...(authorization?{Authorization:authorization}:{}),'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
   const payload=await boundedJson(res);
   if(!res.ok){
    const error=(payload||{}) as {code?:string};
    const status=error.code==='28000'||res.status===401?401:res.status===403||error.code==='42501'?403:res.status===409||error.code==='23505'||error.code==='40001'?409:error.code==='P0002'||res.status===404?404:res.status===400||error.code?.startsWith('22')||error.code==='23514'?400:503;
    throw new DomainError(error.code==='40001'?'Este item foi alterado. Reabra a versão atual antes de salvar novamente.':({401:'Sessão central inválida ou expirada.',403:'Você não tem permissão para esta ação.',409:'O registro já existe ou foi alterado.',404:'O recurso não está disponível.',400:'Confira os campos enviados.',503:'O serviço central está indisponível. Tente novamente.'})[status],status);
   }
   return payload;
  }catch(e){if(e instanceof DomainError)throw e;throw new DomainError('O serviço central está indisponível. Tente novamente.',503);}
 }
 account(auth:string|undefined){return this.rpc('forma_account',auth);}
 billingAccount(auth:string|undefined){return this.rpc('forma_billing_account',auth);}
 billingPlans(){return this.rpc('forma_billing_plans',undefined,{},true);}
 billingReceipts(auth:string|undefined){return this.rpc('forma_billing_receipts',auth);}
 billingRequests(auth:string|undefined){return this.rpc('forma_billing_requests',auth);}
 billingRequestCreate(auth:string|undefined,input:{requestId:string;kind:string;checkoutId?:string;message:string}){return this.rpc('forma_billing_request_create',auth,{p_request:input.requestId,p_kind:input.kind,p_checkout:input.checkoutId||null,p_message:input.message});}
 billingRequestRespond(auth:string|undefined,id:string,response:string){return this.rpc('forma_billing_request_respond',auth,{p_id:id,p_response:response});}
 billingServer(auth:string|undefined,payload:string,proof:string){return this.rpc('forma_billing_server',auth,{p_payload:payload,p_proof:proof},true);}
 confirmFilePurge(auth:string|undefined,id:string){return this.rpc('forma_file_purge_confirm',auth,{p_id:id});}
 saveProfile(auth:string|undefined,p:{name:string;handle:string;bio:string;title:string;location:string}){return this.rpc('forma_profile_save',auth,{p_name:p.name,p_handle:p.handle,p_bio:p.bio,p_title:p.title,p_location:p.location});}
 invite(auth:string|undefined,p:{studioId:string;email:string;role:string}){return this.rpc('forma_invite',auth,{p_studio:p.studioId,p_email:p.email,p_role:p.role});}
 respond(auth:string|undefined,id:string,accept:boolean){return this.rpc('forma_invitation_respond',auth,{p_id:id,p_accept:accept});}
 revoke(auth:string|undefined,id:string){return this.rpc('forma_invitation_revoke',auth,{p_id:id});}
 workSnapshot(auth:string|undefined,studioId:string){return this.rpc('forma_work_snapshot',auth,{p_studio:studioId});}
 exportPage(auth:string|undefined,studioId:string,section:string,after?:string){return this.rpc('forma_studio_export_page',auth,{p_studio:studioId,p_section:section,p_after:after||null});}
 projectContent(auth:string|undefined,projectId:string,after?:string){return this.rpc('forma_project_content',auth,{p_project:projectId,p_after:after||null});}
 conversationMessages(auth:string|undefined,conversationId:string,before?:string){return this.rpc('forma_conversation_messages',auth,{p_conversation:conversationId,p_before:before||null});}
 documentRead(auth:string|undefined,id:string,version?:number){return this.rpc('forma_document_read',auth,{p_id:id,p_version:version||null});}
 fileRead(auth:string|undefined,id:string){return this.rpc('forma_file_read',auth,{p_id:id});}
 cancelUpload(auth:string|undefined,studioId:string,requestId:string,cleanupRequestId:string){return this.rpc('forma_upload_cancel',auth,{p_studio:studioId,p_request:requestId,p_cleanup_request:cleanupRequestId});}
 workAction(auth:string|undefined,studioId:string,kind:string,data:unknown,requestId:string){return this.rpc('forma_work_action',auth,{p_studio:studioId,p_kind:kind,p_data:data,p_request:requestId});}
 private async storage(auth:string|undefined,key:string,method:'GET'|'POST'|'DELETE',data?:Buffer,mime?:string,signal?:AbortSignal){
  if(!auth||!/^Bearer [A-Za-z0-9._-]{1,8192}$/.test(auth))throw new DomainError('Entre na conta central.',401);
  if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(key))throw new DomainError('Caminho de arquivo inválido.',400);
  try{
   const suffix=method==='DELETE'?'':(method==='GET'?'/authenticated':'')+'/'+key;
   const path=method==='GET'?'/storage/v1/object/authenticated/forma-private/'+key:'/storage/v1/object/forma-private'+suffix;
   const headers:Record<string,string>={apikey:this.config.publishableKey,Authorization:auth};
   if(method==='POST'){headers['Content-Type']=mime!.split(';')[0];headers['x-upsert']='false';headers['cache-control']='no-store';}
   if(method==='DELETE')headers['Content-Type']='application/json';
   const res=await this.remote(new URL(path,this.config.url).href,{method,headers,body:method==='DELETE'?JSON.stringify({prefixes:[key]}):data?new Uint8Array(data):undefined,redirect:'error',cache:'no-store',signal:AbortSignal.any([AbortSignal.timeout(45000),...(signal?[signal]:[])])});
   if(!res.ok){
    const error=await boundedJson(res).catch(()=>null) as {error?:string;code?:string}|null;
    if(method==='DELETE'&&res.status===404)return res;
    const status=res.status===401?401:res.status===403?403:res.status===404?404:res.status===409||error?.error==='Duplicate'||error?.code==='Duplicate'?409:res.status===429?429:503;
    throw new DomainError(status===409?'O arquivo já foi recebido.':status===403?'Acesso ao arquivo alterado.':status===404?'Arquivo não encontrado.':'O armazenamento está indisponível. Tente novamente.',status);
   }
   return res;
  }catch(e){if(e instanceof DomainError)throw e;throw new DomainError('O armazenamento está indisponível. Tente novamente.',503);}
 }
 async storageUpload(auth:string|undefined,key:string,data:Buffer,mime:string,signal?:AbortSignal){
  if(data.length===0||data.length>MAX_UPLOAD)throw new DomainError('Arquivo vazio ou acima de15MB.',413);
  const res=await this.storage(auth,key,'POST',data,mime,signal);await res.body?.cancel();
 }
 async storageDownload(auth:string|undefined,key:string){
  const res=await this.storage(auth,key,'GET');
  try{return await boundedBytes(res,MAX_UPLOAD);}catch{throw new DomainError('Arquivo indisponível ou acima do limite permitido.',503);}
 }
 async storageDelete(auth:string|undefined,key:string){const res=await this.storage(auth,key,'DELETE');await res.body?.cancel();}
}

async function boundedJson(res:Response):Promise<unknown>{
 return JSON.parse((await boundedBytes(res,1024*1024)).toString('utf8'));
}
async function boundedBytes(res:Response,limit:number):Promise<Buffer>{
 if(!res.body)throw new Error('Resposta vazia');
 const reader=res.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>limit)throw new Error('Resposta acima do limite');chunks.push(chunk.value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 return Buffer.concat(chunks);
}

export function centralDomainFromEnv(env:NodeJS.ProcessEnv){
 if(!env.SUPABASE_URL&&!env.SUPABASE_PUBLISHABLE_KEY)return undefined;
 return new CentralDomain({url:env.SUPABASE_URL||'',publishableKey:env.SUPABASE_PUBLISHABLE_KEY||''});
}
