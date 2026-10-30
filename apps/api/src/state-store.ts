import type {State} from '../../../packages/contracts';

/** State transactions commit before resolving; rejected changes must not persist. */
export interface StateStore {
    read(): Promise<State>;
    transact<T>(change: (draft: State) => T | Promise<T>): Promise<T>;
}
