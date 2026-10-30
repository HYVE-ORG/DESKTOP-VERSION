import {supabaseIdentityFromEnv} from '../apps/api/src/supabase-identity';
async function main(){
 const identity=supabaseIdentityFromEnv(process.env);
 if(!identity)throw Error('Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no ambiente backend.');
 console.log(JSON.stringify(await identity.checkConnection()));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
