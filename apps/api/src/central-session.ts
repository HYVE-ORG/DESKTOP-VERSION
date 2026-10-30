export interface CentralTokens {accessToken:string;refreshToken:string;expiresIn:number;}
const tokenPattern=/^[A-Za-z0-9._-]{1,8192}$/;
function cookieValue(cookie:string|undefined,name:string){
 const values=(cookie||'').split(';').map(p=>p.trim()).filter(p=>p.startsWith(name+'='));
 if(values.length!==1)return undefined;
 const value=values[0].slice(name.length+1);return tokenPattern.test(value)?value:undefined;
}
export function centralAuthorization(headers:{authorization?:string;cookie?:string}){
 if(headers.authorization)return headers.authorization;
 const value=cookieValue(headers.cookie,'forma_central_access');return value?'Bearer '+value:undefined;
}
export const centralRefresh=(cookie:string|undefined)=>cookieValue(cookie,'forma_central_refresh');
export function centralCookies(tokens:CentralTokens|null,secure:boolean){
 if(tokens&&(typeof tokens.accessToken!=='string'||typeof tokens.refreshToken!=='string'||!tokenPattern.test(tokens.accessToken)||!tokenPattern.test(tokens.refreshToken)||!Number.isInteger(tokens.expiresIn)||tokens.expiresIn<1||tokens.expiresIn>86400))throw new Error('Sessão central inválida.');
 const flags=`; HttpOnly; SameSite=Strict; Path=/api/central${secure?'; Secure':''}`;
 return [
  `forma_central_access=${tokens?.accessToken||''}; Max-Age=${tokens?.expiresIn||0}${flags}`,
  `forma_central_refresh=${tokens?.refreshToken||''}; Max-Age=${tokens?2592000:0}${flags}`
 ];
}
