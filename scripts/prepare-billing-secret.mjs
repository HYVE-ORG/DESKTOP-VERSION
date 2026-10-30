import {randomBytes} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../.env',import.meta.url));
const source=await readFile(path,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
const found=source.match(/^FORMA_BILLING_SECRET=(.*)$/m);
if(found){if(!/^[a-f0-9]{64}$/.test(found[1].trim()))throw Error('Chave de cobrança existente inválida; não foi substituída.');console.log('Chave privada de cobrança já existe; preservada.');}
else{const temporary=path+'.billing-'+randomBytes(6).toString('hex');await writeFile(temporary,source+(source.endsWith('\n')||!source?'':'\n')+'FORMA_BILLING_SECRET='+randomBytes(32).toString('hex')+'\n',{flag:'wx',mode:0o600});await rename(temporary,path);console.log('Chave privada de cobrança preparada no .env; configure a mesma chave no banco sem expor seu valor.');}
