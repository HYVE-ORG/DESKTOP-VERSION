import { StackIcon as Layers3, BriefcaseIcon as BriefcaseBusiness, CodeIcon as Code2, UsersIcon as Users, TargetIcon as Target, HeartIcon as Heart, MegaphoneIcon as Megaphone } from '@phosphor-icons/react';
import type {SpaceIcon as IconName,SpaceCover} from '../../../packages/contracts/spaces';
const icons={layers:Layers3,briefcase:BriefcaseBusiness,code:Code2,users:Users,target:Target,heart:Heart,megaphone:Megaphone};
export const spaceIconNames:Record<IconName,string>={layers:'Camadas',briefcase:'Trabalho',code:'Desenvolvimento',users:'Pessoas',target:'Objetivos',heart:'Cuidado',megaphone:'Marketing'};
export const spaceCoverNames:Record<SpaceCover,string>={lavender:'Lavanda',sand:'Areia',sage:'Sálvia',blue:'Azul',midnight:'Noturno'};
export function SpaceIcon({name='layers',size=22}:{name?:IconName;size?:number}){const Icon=icons[name]||Layers3;return <Icon size={size}/>;}
export function SpaceCoverArt({cover='lavender',className=''}:{cover?:SpaceCover;className?:string}){return <div className={`space-cover-art cover-${cover} ${className}`} aria-hidden="true"><i/><i/><i/></div>;}
