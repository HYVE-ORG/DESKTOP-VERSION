import { resolve } from 'node:path';
import { createApp } from './app';
import {supabaseIdentityFromEnv} from './supabase-identity';
import {centralDomainFromEnv} from './central-domain';
import {billingFromEnv} from './billing-domain';
import {mediaFromEnv} from './meeting-media';
void Promise.resolve().then(()=>{const central=centralDomainFromEnv(process.env);return createApp(process.env.DATA_DIR || resolve(process.cwd(), '.data'), Number(process.env.PORT || 4100),{identity:supabaseIdentityFromEnv(process.env),central,uploadVerifier:process.env.FORMA_UPLOAD_VERIFIER,billing:billingFromEnv(central,process.env),media:mediaFromEnv(process.env)});}).then(server => {
    console.log(`Forma API: http://127.0.0.1:${server.port} · modo local`);
    const stop = async () => { await server.close(); process.exit(0); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}).catch(error => { console.error(error); process.exit(1); });
