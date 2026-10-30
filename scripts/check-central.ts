// Check de conectividade/negação; não cria conta, não envia e-mail, não imprime chave.
import {SupabaseIdentity} from '../apps/api/src/supabase-identity';
async function main(){
const origin=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
if(!origin||!key)throw Error('Configure o projeto Supabase antes do check.');
new SupabaseIdentity({url:origin,publishableKey:key});
const res=await fetch(new URL('/rest/v1/rpc/forma_account',origin),{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(10000)});
const body=await res.json() as {code?:string};
if(res.status!==401||body.code!=='42501')throw Error(`RPC anônima inesperada: HTTP ${res.status}, código ${body.code||'ausente'}.`);
console.log('Forma PostgreSQL: RPC existe e recusa anon (401/42501). Dados autenticados: testar fluxo com conta confirmada.');
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'Falha no check central.');process.exitCode=1;});
