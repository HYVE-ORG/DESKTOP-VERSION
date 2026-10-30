import {createHash} from 'node:crypto';
import {AccessToken,RoomServiceClient} from 'livekit-server-sdk';
import type {State,User} from '../../../packages/contracts';
import {canProject,canManage} from './policy';
import {ensure,DomainError} from './errors';
export type MeetingAccess={room:string;identity:string;name:string};
export function meetingAccess(s:State,u:User,id:string):MeetingAccess{
 const event=s.calendar.find(e=>e.id===id&&e.orgId===u.orgId&&e.meeting),project=s.projects.find(p=>p.id===event?.projectId);
 ensure(event&&project&&!project.archived&&canProject(s,u,project),'Reunião indisponível ou acesso alterado.',403);
 ensure(event.attendeeIds.includes(u.id)||canManage(s,u,project.id),'Você não foi convidado para esta reunião.',403);
 ensure(Date.parse(event.end)>Date.now()&&Date.parse(event.start)<=Date.now()+900000,'A sala está fora do período de acesso.',409);
 return {room:'forma-'+createHash('sha256').update(u.orgId+'|'+event.id).digest('hex').slice(0,40),identity:u.id,name:u.name};
}
type Config={url:string;apiKey:string;apiSecret:string};
type Service=Pick<RoomServiceClient,'createRoom'|'removeParticipant'|'listRooms'|'listParticipants'>;
export class MeetingMedia{
 readonly serverUrl:string;private service:Service;
 constructor(private config:Config,service?:Service){
  const url=new URL(config.url),local=['127.0.0.1','localhost'].includes(url.hostname);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(local&&url.protocol==='ws:'||url.protocol==='wss:')||!config.apiKey||!config.apiSecret||!local&&config.apiSecret.length<32)throw Error('Configuração LiveKit inválida. Use WSS público ou WS somente loopback.');
  this.serverUrl=url.origin;this.service=service||new RoomServiceClient(this.serverUrl.replace(/^ws/,'http'),config.apiKey,config.apiSecret,{requestTimeout:3});
 }
 async join(access:MeetingAccess){
  try{
   const rooms=await this.service.listRooms();
   ensure(rooms.filter(r=>r.numParticipants>0).length<32||rooms.some(r=>r.name===access.room&&r.numParticipants>0),'A capacidade local de salas ativas foi atingida.',429);
   await this.service.createRoom({name:access.room,maxParticipants:8,emptyTimeout:120,departureTimeout:30});
  }
  catch(e){if(e instanceof DomainError)throw e;throw new DomainError('O servidor de chamadas está indisponível. Tente novamente.',503);}
  const token=new AccessToken(this.config.apiKey,this.config.apiSecret,{identity:access.identity,name:access.name,ttl:120});
  token.addGrant({roomJoin:true,room:access.room,canPublish:true,canSubscribe:true,canPublishData:true});
  return {serverUrl:this.serverUrl,token:await token.toJwt()};
 }
 async remove(access:Pick<MeetingAccess,'room'|'identity'>){await this.service.removeParticipant(access.room,access.identity);}
 async participants(room:string){try{return (await this.service.listParticipants(room)).map(p=>p.identity);}catch(e){if((e as {code?:string}).code==='not_found')return [];throw e;}}
 async connected(){
  const rooms=(await this.service.listRooms()).filter(r=>r.numParticipants>0);
  return new Map(await Promise.all(rooms.map(async r=>[r.name,new Set(await this.participants(r.name))] as const)));
 }
}
export function mediaFromEnv(env:NodeJS.ProcessEnv){
 if(!env.LIVEKIT_URL&&!env.LIVEKIT_API_KEY&&!env.LIVEKIT_API_SECRET)return undefined;
 return new MeetingMedia({url:env.LIVEKIT_URL||'',apiKey:env.LIVEKIT_API_KEY||'',apiSecret:env.LIVEKIT_API_SECRET||''});
}
