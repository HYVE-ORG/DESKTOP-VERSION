export interface CentralAccount {
 profile:null|{account_id:string;name:string;handle:string;bio:string;title:string;location:string};
 studios:{id:string;name:string;role:'admin'|'coordinator'|'user'}[];
 invitations:{id:string;studioId:string;studioName:string;role:'admin'|'coordinator'|'user';expiresAt:string}[];
}
