import type {Role,Status,Priority} from './index';
export interface OnlineWorkspace {id:string;studio_id:string;name:string;color:string;version:number;archived:boolean;}
export interface OnlineProject {id:string;studio_id:string;workspace_id:string;name:string;description:string;color:string;version:number;archived:boolean;}
export interface OnlineMember {account_id:string;name:string;handle:string;role:Role;}
export interface OnlineTask {id:string;studio_id:string;project_id:string;title:string;description:string;status:Status;priority:Priority;due_date:string|null;version:number;created_at:string;updated_at:string;assignee_ids:string[];}
export interface OnlineConversation {id:string;studio_id:string;workspace_id:string;project_id:string|null;name:string;archived:boolean;}
export interface OnlineMessage {id:string;studio_id:string;conversation_id:string;author_id:string;body:string;version:number;created_at:string;deleted_at:string|null;attachment_ids:string[];}
export interface OnlineDocument {id:string;studio_id:string;project_id:string;title:string;body:string;version:number;updated_at:string;updated_by:string;}
export interface OnlineFile {id:string;studio_id:string;project_id:string|null;conversation_id:string|null;uploader_id:string;name:string;mime:string;size:number;sha256:string;object_key:string;status:'pending'|'ready'|'deleted';created_at:string;expires_at:string;}
export interface OnlineSnapshot {
 studio:{id:string;name:string;role:Role};actor_id:string;
 workspaces:OnlineWorkspace[];projects:OnlineProject[];members:OnlineMember[];
 access:{project_id:string;account_id:string;enabled:boolean}[];
 conversations:OnlineConversation[];
}
export type OnlineFileView=Omit<OnlineFile,'object_key'>;
export interface OnlineProjectContent {tasks:OnlineTask[];total_tasks:number;documents:Omit<OnlineDocument,'body'>[];files:OnlineFileView[];}
export interface OnlineMessages {messages:OnlineMessage[];files:OnlineFileView[];}
