import {centralDomainFromEnv} from '../apps/api/src/central-domain';
import {billingFromEnv} from '../apps/api/src/billing-domain';
const billing=billingFromEnv(centralDomainFromEnv(process.env),process.env);
const reconciler=billing?.reconciler();
if(!reconciler)throw Error('Conciliação não configurada. Complete o ambiente privado, sem passar tokens em argumentos.');
await reconciler.tick();
console.log('Ciclo de conciliação encerrado. Confira pendências na inbox operacional; isso não confirma venda ou entrega por si só.');
