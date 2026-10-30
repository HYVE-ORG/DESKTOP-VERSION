import { scrypt as scryptCallback, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response } from 'express';
import type { State, User, Account } from '../../../packages/contracts';
import { ensure } from './errors';
const scrypt = promisify(scryptCallback);
export async function passwordHash(password: string) {
    const salt = randomBytes(16).toString('hex');
    const hash = await scrypt(password, salt, 64) as Buffer;
    return `${salt}:${hash.toString('hex')}`;
}
export async function passwordMatches(password: string, encoded: string) {
    const [salt, hex] = encoded.split(':');
    if (!salt || !hex)
        return false;
    const expected = Buffer.from(hex, 'hex');
    const actual = await scrypt(password, salt, 64) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const cookieToken = (cookie = '') => cookie.split(';').map(p => p.trim()).find(p => p.startsWith('forma_session='))?.split('=')[1] || '';
export function sessionUser(s: State, cookie = ''): User {
    const hash = tokenHash(cookieToken(cookie));
    const session = s.sessions.find(s => s.hash === hash && s.expiresAt > Date.now());
    const account = sessionAccount(s,cookie);
    const u = s.users.find(u => (u.accountId || u.id) === account.id && u.status === 'active' && (!session?.activeOrgId || u.orgId===session.activeOrgId));
    ensure(u, 'Selecione um Studio para continuar.', 403);
    return u;
}
export function sessionAccount(s:State,cookie=''):Account {
    const session=s.sessions.find(x=>x.hash===tokenHash(cookieToken(cookie)) && x.expiresAt>Date.now());
    const a=s.accounts?.find(a=>a.id===session?.userId && a.status==='active') || (!s.accounts ? s.users.find(u=>u.id===session?.userId && u.status==='active') : undefined);
    ensure(a,'Entre novamente para continuar.',401);
    return a;
}
export function createSession(s: State, u: User | Account, res: Response) {
    const token = randomBytes(32).toString('hex');
    s.sessions = s.sessions.filter(s => s.expiresAt > Date.now());
    s.sessions.push({ hash: tokenHash(token), userId: 'accountId' in u ? u.accountId || u.id : u.id, activeOrgId:'orgId' in u ? u.orgId : s.users.find(p=>(p.accountId||p.id)===u.id && p.status==='active')?.orgId, expiresAt: Date.now() + 86400000, reauthAt: Date.now() });
    res.setHeader('Set-Cookie', `forma_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.SECURE_COOKIE === 'true' ? '; Secure' : ''}`);
}
export function originGuard(req: Request, origins: Set<string>) { ensure(typeof req.headers.origin === 'string' && origins.has(req.headers.origin), 'Origem de requisição não permitida.', 403); }
export function requireRecent(s: State, cookie = '') { const hash = tokenHash(cookieToken(cookie)); const session = s.sessions.find(session => session.hash === hash && session.expiresAt > Date.now()); ensure(session && (session.reauthAt || 0) > Date.now() - 300000, 'Confirme sua senha no formulário para esta operação administrativa.', 428); }
