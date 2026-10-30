import {createContext,useContext} from 'react';
import type {OnlineSnapshot,OnlineProject,OnlineWorkspace} from '../../../packages/contracts/central-work';
export interface OnlineContextValue {
 data:OnlineSnapshot;project:OnlineProject|null;workspace:OnlineWorkspace|null;busy:boolean;
 run:(type:string,payload:unknown,requestId?:string)=>Promise<any>;
 refresh:()=>Promise<void>;notify:(text:string)=>void;uploadsConfigured:boolean;
}
export const OnlineContext=createContext<OnlineContextValue|null>(null);
export function useOnline(){const value=useContext(OnlineContext);if(!value)throw Error('Studio online ausente.');return value;}
