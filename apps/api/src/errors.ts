export class DomainError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}
export function ensure(condition: unknown, message = 'Você não tem permissão para esta ação.', status = 403): asserts condition {
    if (!condition)
        throw new DomainError(message, status);
}
