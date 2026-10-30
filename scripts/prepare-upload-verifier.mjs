import {readFile,appendFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
const file=resolve('.env');const content=await readFile(file,'utf8');
const matches=[...content.matchAll(/^FORMA_UPLOAD_VERIFIER=(.*)$/gm)];
if(matches.length>1||matches.length===1&&!/^[a-f0-9]{64}$/.test(matches[0][1].trim()))throw Error('Verificador de upload inválido no ambiente. Não foi alterado.');
if(!matches.length)await appendFile(file,`${content.endsWith('\n')?'':'\n'}FORMA_UPLOAD_VERIFIER=${randomBytes(32).toString('hex')}\n`,'utf8');
console.log('Verificador local preparado, sem exibir o valor. Configure a mesma chave privada no banco antes dos uploads.');
