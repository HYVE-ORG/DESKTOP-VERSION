const sections=new Set(['inicio','produto','recursos','como-funciona','desktop','planos','perguntas']);
export function publicLandingSection(hash:string,desktop=false):string|null {
 if(desktop)return null;
 const route=hash.replace(/^#/,'');
 if(!route)return 'inicio';
 if(route==='landing')return 'inicio';
 if(route.startsWith('landing/')){const section=route.slice('landing/'.length);return sections.has(section)?section:'inicio';}
 return null;
}
