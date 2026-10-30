import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
const {Store,provisionStudio}=await import('../apps/api/src/provision.ts');
// Local operator tool, using the authenticated OS account's filesystem access.
const prompt=createInterface({input:stdin,output:stdout});
try {
 if(await prompt.question('A API está parada? Digite SIM: ')!=='SIM')throw new Error('Pare a API antes de continuar.');
 const email=await prompt.question('E-mail da conta Admin já cadastrada: ');
 const name=await prompt.question('Nome do Studio: ');
 await new Store(resolve(process.env.DATA_DIR||'.data')).transact(s=>provisionStudio(s,email,name));
 console.log('Studio criado. Inicie novamente a API e abra Meus Studios.');
}finally{prompt.close();}
