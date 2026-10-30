import 'reflect-metadata';
import { Controller, Module, Get, Post, Param, Query, Req, Res, Body, Catch, type ExceptionFilter, type ArgumentsHost } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express, { type Request, type Response } from 'express';
import { Server } from 'socket.io';
import { z, ZodError } from 'zod';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { Store } from './store';
import type { StateStore } from './state-store';
import type { SupabaseIdentity } from './supabase-identity';
import type { CentralDomain } from './central-domain';
import {centralAuthorization,centralRefresh,centralCookies} from './central-session';
import {createCentralWorkController} from './central-work-controller';
import {createBillingController} from './billing-controller';
import type {BillingDomain} from './billing-domain';
import {meetingAccess,type MeetingMedia} from './meeting-media';
import { seedState, id, now } from './seed';
import { execute } from './actions';
import { snapshot } from './views';
import { ensure, DomainError } from './errors';
import { createSession, sessionAccount, sessionUser, passwordHash, passwordMatches, tokenHash, originGuard, cookieToken, requireRecent } from './auth';
import { accountView, inviteAccount, respondInvitation } from './invitations';
import { canProject, canManage, canSend, canFile } from './policy';
import { detectFile, MAX_UPLOAD } from './files';
@Catch()
class Errors implements ExceptionFilter {
    catch(error: unknown, host: ArgumentsHost) {
        const res = host.switchToHttp().getResponse<Response>();
        const status = error instanceof DomainError ? error.status : error instanceof ZodError ? 400 : typeof (error as any)?.getStatus === 'function' ? (error as any).getStatus() : (error as any)?.status === 413 ? 413 : 500;
        if (status === 500)
            console.error('Erro interno da API:', error instanceof Error ? error.message : 'erro desconhecido');
        const message = error instanceof DomainError ? error.message : error instanceof ZodError ? `Confira os campos: ${error.issues.map(i => i.path.join('.')).join(', ') || 'formato inválido'}` : status === 413 ? 'Arquivo acima de 15 MB.' : status === 404 ? 'Recurso não encontrado.' : 'Não foi possível concluir. Tente novamente.';
        res.status(status).json({ message });
    }
}
export async function createApp(directory: string, port = 4100, options: {host?: string; staticDir?: string; downloadDir?: string; store?: StateStore; identity?: Pick<SupabaseIdentity,'verify'>; central?: CentralDomain;uploadVerifier?:string;billing?:BillingDomain;media?:MeetingMedia} = {}) {
    if(options.uploadVerifier!==undefined&&!/^[a-f0-9]{64}$/.test(options.uploadVerifier))throw new TypeError('Configuração da inspeção de arquivos inválida.');
    const dataDirectory = resolve(directory);
    const store = options.store === undefined ? new Store(dataDirectory) : options.store;
    if (!store || typeof store.read !== 'function' || typeof store.transact !== 'function')
        throw new TypeError('Adapter de persistência inválido: store exige read e transact.');
    const origins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173', `http://127.0.0.1:${port}`, `http://localhost:${port}`]);
    if (process.env.APP_ORIGIN)
        origins.add(new URL(process.env.APP_ORIGIN).origin);
    let io: Server;
    const mediaLeases=new Map<string,{cookie:string;eventId:string;room:string;identity:string;until:number}>();
    let checkingMedia=false;
    let lastMediaInspection=0;
    const changed = (orgId: string) => io?.to(`org:${orgId}`).emit('refresh');
    const attempts = new Map<string, {
        count: number;
        start: number;
    }>();
    const authPayload = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(10).max(128) }).strict();
    const limited = (req: Request,maximum=12,scope='auth') => {
        const key = scope+':'+(req.ip || 'local');
        const bucket = attempts.get(key);
        if (!bucket || bucket.start < Date.now() - 60000)
            attempts.set(key, { count: 1, start: Date.now() });
        else {
            ensure(bucket.count < maximum, 'Muitas tentativas. Aguarde um minuto.', 429);
            bucket.count++;
        }
        if (attempts.size > 1000)
            for (const [k, b] of attempts)
                if (b.start < Date.now() - 60000)
                    attempts.delete(k);
    };
    @Controller('api')
    class Api {
        private central(){ensure(options.central,'O domínio central ainda não está configurado.',503);return options.central;}
        @Get('central/status')
        centralStatus(){return {configured:!!options.central,scope:'work-and-accounts',uploadsConfigured:!!options.central&&!!options.uploadVerifier};}
        @Post('central/login')
        async centralLogin(@Req() req:Request,@Res({passthrough:true}) res:Response,@Body() body:unknown){
            originGuard(req,origins);limited(req);const data=authPayload.parse(body);
            const tokens=await this.central().signIn(data.email,data.password);
            res.setHeader('Set-Cookie',centralCookies(tokens,process.env.SECURE_COOKIE==='true'));return {ok:true};
        }
        @Post('central/register')
        async centralRegister(@Req() req:Request,@Body() body:unknown){
            originGuard(req,origins);limited(req);const data=authPayload.parse(body);
            return this.central().register(data.email,data.password);
        }
        @Post('central/refresh')
        async centralRenew(@Req() req:Request,@Res({passthrough:true}) res:Response){
            originGuard(req,origins);limited(req);const token=centralRefresh(req.headers.cookie);
            ensure(token,'Entre novamente na sua conta central.',401);
            try{res.setHeader('Set-Cookie',centralCookies(await this.central().refresh(token),process.env.SECURE_COOKIE==='true'));}
            catch(e){if(e instanceof DomainError&&e.status===401)res.setHeader('Set-Cookie',centralCookies(null,process.env.SECURE_COOKIE==='true'));throw e;}
            return {ok:true};
        }
        @Post('central/logout')
        async centralLogout(@Req() req:Request,@Res({passthrough:true}) res:Response){
            originGuard(req,origins);limited(req);
            try{await this.central().closeSession(centralAuthorization(req.headers),centralRefresh(req.headers.cookie));}
            finally{res.setHeader('Set-Cookie',centralCookies(null,process.env.SECURE_COOKIE==='true'));}
            return {ok:true};
        }
        @Get('central/account')
        async centralAccount(@Req() req:Request){return this.central().account(centralAuthorization(req.headers));}
        @Post('central/profile')
        async centralProfile(@Req() req:Request,@Body() body:unknown){
            originGuard(req,origins);limited(req);
            const data=z.object({name:z.string().trim().min(2).max(80),handle:z.string().regex(/^[a-z0-9_]{3,40}$/),bio:z.string().max(600),title:z.string().max(100),location:z.string().max(120)}).strict().parse(body);
            return this.central().saveProfile(centralAuthorization(req.headers),data);
        }
        @Post('central/invitations')
        async centralInvite(@Req() req:Request,@Body() body:unknown){
            originGuard(req,origins);limited(req);
            const data=z.object({studioId:z.uuid(),email:z.string().trim().toLowerCase().email().max(200),role:z.enum(['admin','coordinator','user'])}).strict().parse(body);
            return {id:await this.central().invite(centralAuthorization(req.headers),data)};
        }
        @Post('central/invitations/:id/respond')
        async centralRespond(@Req() req:Request,@Param('id') invitationId:string,@Body() body:unknown){
            originGuard(req,origins);limited(req);z.uuid().parse(invitationId);
            const {decision}=z.object({decision:z.enum(['accept','decline'])}).strict().parse(body);
            return this.central().respond(centralAuthorization(req.headers),invitationId,decision==='accept');
        }
        @Post('central/invitations/:id/revoke')
        async centralRevoke(@Req() req:Request,@Param('id') invitationId:string){
            originGuard(req,origins);limited(req);z.uuid().parse(invitationId);
            return {ok:await this.central().revoke(centralAuthorization(req.headers),invitationId)};
        }
        @Get('auth/identity')
        async remoteIdentity(@Req() req:Request) {
            limited(req);
            ensure(options.identity,'A identidade central ainda não está configurada.',503);
            return options.identity.verify(req.headers.authorization);
        }
        @Get('status')
        async status() { const s = await store.read(); return { initialized: s.users.length > 0, mode: 'local', mediaConfigured: !!options.media }; }
        @Post('meetings/:id/join')
        async joinMeeting(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
            originGuard(req,origins);limited(req,20,'media');z.object({}).strict().parse(body);
            const state=await store.read(),u=sessionUser(state,req.headers.cookie),access=meetingAccess(state,u,id);
            ensure(options.media,'O servidor de chamadas ainda não está configurado.',503);
            ensure(mediaLeases.size<8192||mediaLeases.has(access.room+'|'+u.id),'Limite local de admissões atingido. Aguarde alguns minutos.',429);
            const result=await options.media.join(access);
            const latest=await store.read();meetingAccess(latest,sessionUser(latest,req.headers.cookie),id);
            mediaLeases.set(access.room+'|'+u.id,{cookie:req.headers.cookie||'',eventId:id,room:access.room,identity:u.id,until:Date.now()+900000});
            return result;
        }
        @Post('meetings/:id/presence')
        async meetingPresence(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
            originGuard(req,origins);z.object({}).strict().parse(body);
            const state=await store.read();meetingAccess(state,sessionUser(state,req.headers.cookie),id);return {allowed:true};
        }
        @Post('setup')
        async setup(
        @Req()
        req: Request, 
        @Res({ passthrough: true })
        res: Response, 
        @Body()
        body: unknown) {
            originGuard(req, origins);
            limited(req);
            ensure(false,'Studios são criados somente pela administração da plataforma.',403);
        }
        @Post('login')
        async login(
        @Req()
        req: Request, 
        @Res({ passthrough: true })
        res: Response, 
        @Body()
        body: unknown) {
            originGuard(req, origins);
            limited(req);
            const data = authPayload.parse(body);
            const initial = await store.read();
            const candidate = initial.accounts?.find(u => u.email === data.email && u.status === 'active') || (!initial.accounts ? initial.users.find(u => u.email === data.email && u.status === 'active') : undefined);
            const valid = candidate && await passwordMatches(data.password, candidate.passwordHash);
            ensure(valid, 'E-mail ou senha inválidos.', 401);
            return store.transact(s => { const u = (s.accounts || s.users).find(u => u.id === candidate!.id && u.status === 'active' && u.passwordHash === candidate!.passwordHash); ensure(u, 'E-mail ou senha inválidos.', 401); createSession(s, u, res); return { ok: true }; });
        }
        @Post('register')
        async register(@Req() req:Request,@Res({passthrough:true}) res:Response,@Body() body:unknown) {
            originGuard(req,origins);limited(req);
            const data=authPayload.extend({name:z.string().trim().min(2).max(80)}).parse(body);
            const hash=await passwordHash(data.password);
            return store.transact(s=>{
                s.accounts ||= [];
                ensure(!s.accounts.some(a=>a.email===data.email) && !s.users.some(u=>u.email===data.email),'E-mail já cadastrado.',409);
                const a={id:id(),name:data.name,email:data.email,passwordHash:hash,status:'active' as const,handle:`pessoa_${randomBytes(5).toString('hex')}`,title:'',bio:'',location:'',timezone:'America/Sao_Paulo'};
                s.accounts.push(a);s.schemaVersion=2;createSession(s,a,res);return {ok:true};
            });
        }
        @Get('account')
        async account(@Req() req:Request) {const s=await store.read();return accountView(s,sessionAccount(s,req.headers.cookie));}
        @Post('account/profile')
        async accountProfile(@Req() req:Request,@Body() body:unknown) {
            originGuard(req,origins);
            const data=z.object({name:z.string().trim().min(2).max(80),bio:z.string().max(600),title:z.string().max(100),location:z.string().max(120)}).strict().parse(body);
            return store.transact(s=>{const a=sessionAccount(s,req.headers.cookie);Object.assign(a,data);s.users.filter(u=>(u.accountId||u.id)===a.id).forEach(u=>Object.assign(u,data));return {ok:true};});
        }
        @Post('studios/select')
        async selectStudio(@Req() req:Request,@Body() body:unknown) {
            originGuard(req,origins);const {orgId}=z.object({orgId:z.string().min(1)}).strict().parse(body);
            return store.transact(s=>{const a=sessionAccount(s,req.headers.cookie);ensure(s.users.some(u=>(u.accountId||u.id)===a.id && u.orgId===orgId && u.status==='active'));const session=s.sessions.find(x=>x.hash===tokenHash(cookieToken(req.headers.cookie)))!;session.activeOrgId=orgId;return {ok:true};});
        }
        @Post('invitations/:id/respond')
        async respond(@Req() req:Request,@Param('id') invitationId:string,@Body() body:unknown) {
            originGuard(req,origins);const {decision}=z.object({decision:z.enum(['accept','decline'])}).strict().parse(body);
            return store.transact(s=>respondInvitation(s,sessionAccount(s,req.headers.cookie),invitationId,decision));
        }
        @Post('invitations/:id/revoke')
        async revoke(@Req() req:Request,@Param('id') invitationId:string) {
            originGuard(req,origins);return store.transact(s=>{const u=sessionUser(s,req.headers.cookie),i=s.invitations.find(i=>i.id===invitationId && i.orgId===u.orgId);ensure(i && (u.role==='admin'||u.id===i.inviterId && i.projectIds.every(pid=>canManage(s,u,pid))));ensure(!i.used,'Convite já respondido.',409);i.used=true;i.status='revoked';return {ok:true};});
        }
        @Get('studio/invitations')
        async studioInvitations(@Req() req:Request){const s=await store.read(),u=sessionUser(s,req.headers.cookie);ensure(u.role!=='user');return s.invitations.filter(i=>i.orgId===u.orgId && (u.role==='admin'||i.inviterId===u.id && i.projectIds.every(pid=>canManage(s,u,pid)))).map(({hash,...i})=>i);}
        @Post('logout')
        async logout(
        @Req()
        req: Request, 
        @Res({ passthrough: true })
        res: Response) {
            originGuard(req, origins);
            const hash = tokenHash(cookieToken(req.headers.cookie));
            await store.transact(s => { s.sessions = s.sessions.filter(s => s.hash !== hash); });
            res.setHeader('Set-Cookie', 'forma_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
            return { ok: true };
        }
        @Get('state')
        async state(
        @Req()
        req: Request) {
            const s = await store.read(),user=sessionUser(s,req.headers.cookie),view=snapshot(s,user);
            const connected=new Set<string>();
            for(const socket of io.sockets.sockets.values()){
                try{const peer=sessionUser(s,socket.data.cookie);if(peer.orgId===user.orgId)connected.add(peer.id);}catch{}
            }
            return {...view,people:view.people.map(person=>({...person,presence:connected.has(person.id)?'online' as const:'offline' as const})),mediaConfigured:!!options.media};
        }
        @Post('actions')
        async action(
        @Req()
        req: Request, 
        @Body()
        body: unknown) {
            originGuard(req, origins);
            let orgId = '';
            const result = await store.transact(s => {
                const u = sessionUser(s, req.headers.cookie);
                orgId = u.orgId;
                const action = body as {
                    type?: string;
                    payload?: {
                        text?: unknown;
                    };
                };
                if (['member.update', 'org.update', 'member.access', 'workspace.create', 'workspace.update'].includes(action?.type || '') || action?.type === 'command.execute' && typeof action.payload?.text === 'string' && /^\/?cargo(?:\s|$)/.test(action.payload.text.trim()))
                    requireRecent(s, req.headers.cookie);
                return execute(s, u.id, body);
            });
            changed(orgId);
            return result;
        }
        @Post('invitations')
        async invite(
        @Req()
        req: Request, 
        @Body()
        body: unknown) {
            originGuard(req, origins);
            const data = z.object({ email: z.string().email().max(200), name: z.string().trim().min(2).max(80), role: z.enum(['admin', 'coordinator', 'user']), projectIds: z.array(z.string()).min(1).max(30) }).strict().parse(body);
            const token = randomBytes(32).toString('hex');
            return store.transact(s => {
                const u = sessionUser(s, req.headers.cookie);
                ensure(u.role !== 'user');
                ensure(u.role === 'admin' || data.role === 'user');
                if (data.role !== 'user')
                    requireRecent(s, req.headers.cookie);
                ensure(data.projectIds.every(pid => canManage(s, u, pid)), 'Projeto fora do escopo.');
                const invitation=inviteAccount(s,u,data,token);
                return { id:invitation.id, token, expiresInDays: 7 };
            });
        }
        @Get('invitations/:token')
        async preview(
        @Param('token')
        token: string) {
            const s = await store.read();
            const inv = s.invitations.find(i => i.hash === tokenHash(token) && !i.used && i.expiresAt > Date.now());
            ensure(inv, 'Convite inválido ou expirado.', 404);
            return { name: inv.name, email: inv.email, organization: s.orgs.find(o => o.id === inv.orgId)?.name };
        }
        @Post('accept-invitation')
        async accept(
        @Req()
        req: Request, 
        @Res({ passthrough: true })
        res: Response, 
        @Body()
        body: unknown) {
            originGuard(req, origins);
            limited(req);
            const data = authPayload.extend({ token: z.string().min(32).max(200) }).parse(body);
            // Link acceptance also requires the existing recipient account's password.
            return store.transact(s => {
                const inv = s.invitations.find(i => i.hash === tokenHash(data.token) && !i.used && i.expiresAt > Date.now());
                ensure(inv && inv.email === data.email, 'Convite inválido, expirado ou de outro e-mail.', 400);
                ensure(false,'Crie ou entre na sua conta e aceite o convite pela Inbox.',409);
            });
        }
        @Post('files')
        async upload(
        @Req()
        req: Request, 
        @Query()
        query: unknown) {
            originGuard(req, origins);
            const data = z.object({ name: z.string().max(180), scope: z.enum(['project', 'conversation', 'profile', 'studio']), scopeId: z.string().max(100), folderId: z.string().optional() }).strict().parse(query);
            ensure(Buffer.isBuffer(req.body), 'Envie o arquivo como application/octet-stream.', 400);
            const buffer = req.body as Buffer;
            const mime = detectFile(data.name, buffer);
            const fileId = id();
            const uploads = join(dataDirectory, 'uploads');
            await mkdir(uploads, { recursive: true });
            const filePath = join(uploads, fileId);
            try {
                const result = await store.transact(async (s) => {
                    const u = sessionUser(s, req.headers.cookie);
                    if (data.scope === 'profile')
                        ensure(data.scopeId === u.id && mime.startsWith('image/'));
                    else if(data.scope==='studio') ensure(u.role==='admin' && data.scopeId===u.orgId && mime.startsWith('image/'));
                    else if (data.scope === 'project') {
                        const p = s.projects.find(p => p.id === data.scopeId);
                        ensure(p && !p.archived && canProject(s, u, p));
                    }
                    else {
                        const c = s.conversations.find(c => c.id === data.scopeId);
                        ensure(c && canSend(s, u, c));
                    }
                    if (data.folderId)
                        ensure(data.scope === 'project' && s.folders.some(f => f.id === data.folderId && f.projectId === data.scopeId && !f.archived));
                    const f = { ...data, id: fileId, orgId: u.orgId, uploaderId: u.id, mime, size: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), createdAt: now() };
                    await writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 });
                    s.files.push(f);
                    return f;
                });
                changed(result.orgId);
                return result;
            }
            catch (error) {
                await rm(filePath, { force: true });
                throw error;
            }
        }
        @Get('files/:id')
        async download(
        @Req()
        req: Request, 
        @Res()
        res: Response, 
        @Param('id')
        fileId: string) {
            const s = await store.read(), u = sessionUser(s, req.headers.cookie);
            const f = s.files.find(f => f.id === fileId);
            ensure(f && canFile(s, u, f), 'Arquivo não encontrado.', 404);
            ensure(/^[a-f0-9-]{36}$/.test(f.id), 'Arquivo inválido.', 400);
            const data = await readFile(join(dataDirectory, 'uploads', f.id));
            res.setHeader('Content-Type', f.mime);
            res.setHeader('Content-Disposition', `${f.mime.startsWith('text/') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
            res.setHeader('Accept-Ranges', 'bytes');
            if (req.headers.range) {
                const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
                ensure(match, 'Intervalo inválido.', 416);
                const start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), data.length - 1) : data.length - 1;
                ensure(start >= 0 && start <= end && start < data.length, 'Intervalo inválido.', 416);
                res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${data.length}`);
                res.setHeader('Content-Length', end - start + 1);
                res.end(data.subarray(start, end + 1));
            }
            else {
                res.setHeader('Content-Length', data.length);
                res.end(data);
            }
        }
        @Post('reauth')
        async reauth(
        @Req()
        req: Request, 
        @Body()
        body: unknown) {
            originGuard(req, origins);
            limited(req);
            const data = z.object({ password: z.string().max(128) }).strict().parse(body);
            const initial = await store.read(), u = sessionUser(initial, req.headers.cookie);
            ensure(await passwordMatches(data.password, u.passwordHash), 'Senha incorreta.', 401);
            return store.transact(s => { const actor = sessionUser(s, req.headers.cookie); ensure(actor.passwordHash === u.passwordHash, 'Entre novamente.', 401); const hash = tokenHash(cookieToken(req.headers.cookie)); s.sessions.find(session => session.hash === hash)!.reauthAt = Date.now(); return { ok: true }; });
        }
        @Post('password')
        async changePassword(
        @Req()
        req: Request, 
        @Body()
        body: unknown) {
            originGuard(req, origins);
            limited(req);
            const data = z.object({ current: z.string().max(128), next: z.string().min(10).max(128) }).strict().parse(body);
            const initial = await store.read(), user = sessionAccount(initial, req.headers.cookie);
            ensure(await passwordMatches(data.current, user.passwordHash), 'Senha atual incorreta.', 400);
            const hash = await passwordHash(data.next);
            return store.transact(s => { const u = sessionAccount(s, req.headers.cookie); ensure(u.passwordHash === user.passwordHash, 'A senha já foi alterada. Entre novamente.', 409); u.passwordHash = hash; s.users.filter(p=>(p.accountId||p.id)===u.id).forEach(p=>p.passwordHash=hash); const keep = tokenHash(cookieToken(req.headers.cookie)); s.sessions = s.sessions.filter(session => session.userId !== u.id || session.hash === keep); return { ok: true }; });
        }
    }
    const CentralWorkApi=createCentralWorkController({domain:()=>{ensure(options.central,'O domínio central ainda não está configurado.',503);return options.central;},guard:req=>{originGuard(req,origins);limited(req,120,'work');},uploadVerifier:options.uploadVerifier});
    const BillingApi=createBillingController({billing:options.billing,guard:req=>{originGuard(req,origins);limited(req,20,'billing');},webhookLimit:req=>limited(req,120,'billing-webhook')});
    @Module({ controllers: [Api,CentralWorkApi,BillingApi] })
    class AppModule {
    }
    const app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalFilters(new Errors());
    app.use((req: Request, res: Response, next: () => void) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cache-Control', req.path.startsWith('/api') ? 'no-store' : 'no-cache'); res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws://127.0.0.1:* ws://localhost:* ${options.media?.serverUrl||''} ${options.media?.serverUrl.replace(/^ws/,'http')||''}; frame-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`); next(); });
    app.use('/api/files', express.raw({ type: 'application/octet-stream', limit: MAX_UPLOAD }));
    app.use('/api/central/studios/:id/files',express.raw({type:'application/octet-stream',limit:MAX_UPLOAD}));
    const staticDir = options.staticDir || resolve(process.cwd(), 'dist');
    app.use('/downloads/installers', express.static(options.downloadDir || resolve(staticDir, '../release/downloads'), {index: false, dotfiles: 'deny', setHeaders: (res, file) => {res.setHeader('Content-Disposition', 'attachment');res.setHeader('Cache-Control', /(?:latest\.yml|release\.json)$/.test(file) ? 'no-store' : 'public, max-age=3600');}}));
    app.use(express.static(staticDir));
    io = new Server(app.getHttpServer(), { cors: { origin: [...origins], credentials: true }, maxHttpBufferSize: 10000 });
    io.use(async (socket, next) => {
        try {
            ensure(origins.has(socket.handshake.headers.origin || ''));
            const s = await store.read();
            const u = sessionUser(s, socket.handshake.headers.cookie);
            socket.data.userId = u.id;
            socket.data.cookie = socket.handshake.headers.cookie;
            socket.join(`org:${u.orgId}`);
            next();
        }
        catch {
            next(new Error('Sessão inválida'));
        }
    });
    const timer = setInterval(async () => {
        const s = await store.read().catch(() => null);
        if (!s)
            return;
        for (const socket of io.sockets.sockets.values()) {
            try {
                const u=sessionUser(s, socket.data.cookie);
                if(!socket.rooms.has(`org:${u.orgId}`)) socket.disconnect(true);
            }
            catch {
                socket.disconnect(true);
            }
        }
    }, 3000);
    timer.unref();
    const mediaTimer=options.media?setInterval(async()=>{
        if(checkingMedia)return;checkingMedia=true;
        try{
            const state=await store.read().catch(()=>null);
            if(Date.now()-lastMediaInspection>=30000){
                // Retenção15m cobre tokens renovados10m; histórico não ocupa vagas de sala.
                const connected=await options.media!.connected().catch(()=>null);
                if(connected){for(const [key,lease] of mediaLeases){if(connected.get(lease.room)?.has(lease.identity))lease.until=Date.now()+900000;else if(lease.until<Date.now())mediaLeases.delete(key);}lastMediaInspection=Date.now();}
            }
            const removals:Promise<unknown>[]=[];
            for(const [key,lease] of mediaLeases){
                let allowed=false;try{if(state){const u=sessionUser(state,lease.cookie);allowed=u.id===lease.identity&&meetingAccess(state,u,lease.eventId).room===lease.room;}}catch{}
                if(!allowed)removals.push(options.media!.remove(lease));
            }
            await Promise.allSettled(removals);
        }finally{checkingMedia=false;}
    },3000):undefined;mediaTimer?.unref();
    const billingReconciler=options.billing?.reconciler();
    const billingTimer=billingReconciler?setInterval(()=>void billingReconciler.tick().catch(()=>console.error('Conciliação de cobrança pendente; verificar operação.')),60000):undefined;
    billingTimer?.unref();
    await app.listen(port, options.host || process.env.HOST || '127.0.0.1');
    const actualPort = (app.getHttpServer().address() as {
        port: number;
    }).port;
    origins.add(`http://127.0.0.1:${actualPort}`);
    origins.add(`http://localhost:${actualPort}`);
    return { app, store, io, port: actualPort, close: async () => { clearInterval(timer);if(mediaTimer)clearInterval(mediaTimer);if(billingTimer)clearInterval(billingTimer);await new Promise<void>(r => io.close(() => r())); await app.close(); } };
}
