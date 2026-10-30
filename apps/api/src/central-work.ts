import {createHmac,createHash} from 'node:crypto';
import {z} from 'zod';
import {DomainError} from './errors';
import type {OnlineFile} from '../../../packages/contracts/central-work';
const id=z.uuid(),version=z.number().int().positive(),name=(max:number)=>z.string().trim().min(2).max(max);
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const status=z.enum(['todo','in_progress','in_review','done']),priority=z.enum(['low','medium','high','urgent']);
const task={title:name(160),description:z.string().max(12000),status,priority,dueDate:z.union([z.literal(''),z.iso.date()]),assigneeIds:z.array(id).max(20)};
const schemas={
 'workspace.create':z.object({name:name(80),color}).strict(),
 'workspace.update':z.object({id,name:name(80),color,version,archived:z.boolean()}).strict(),
 'project.create':z.object({workspaceId:id,name:name(100),description:z.string().max(4000),color}).strict(),
 'project.update':z.object({id,name:name(100),description:z.string().max(4000),color,version,archived:z.boolean()}).strict(),
 'project.access':z.object({projectId:id,accountId:id,enabled:z.boolean()}).strict(),
 'task.create':z.object({projectId:id,...task}).strict(),
 'task.update':z.object({id,version,...task}).strict(),
 'task.move':z.object({id,version,status}).strict(),
 'conversation.create':z.object({workspaceId:id,projectId:id.nullable(),name:name(100)}).strict(),
 'message.send':z.object({conversationId:id,body:z.string().max(12000),attachmentIds:z.array(id).max(10)}).strict().refine(p=>!!p.body.trim()||p.attachmentIds.length>0),
 'message.update':z.object({id,version,body:z.string().trim().min(1).max(12000)}).strict(),
 'message.delete':z.object({id,version}).strict(),
 'document.save':z.object({id:id.optional(),projectId:id,version:version.optional(),title:name(160),body:z.string().max(100000)}).strict().refine(p=>!p.id||!!p.version)
};
export function parseWorkAction(body:unknown){
 const action=z.object({type:z.enum(Object.keys(schemas) as [keyof typeof schemas,...(keyof typeof schemas)[]]),payload:z.unknown(),requestId:id}).strict().parse(body);
 return {...action,payload:schemas[action.type].parse(action.payload)};
}
export function uploadProof(secret:string,file:Pick<OnlineFile,'id'|'uploader_id'|'sha256'|'size'|'mime'>){
 if(!/^[a-f0-9]{64}$/.test(secret))throw new DomainError('A inspeção de arquivos online ainda não está configurada.',503);
 return createHmac('sha256',secret).update([file.id,file.uploader_id,file.sha256,file.size,file.mime].join('|')).digest('hex');
}
export function workOperationId(requestId:string,operation:string){
 const bytes=createHash('sha256').update(requestId+'|'+operation).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
 const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
