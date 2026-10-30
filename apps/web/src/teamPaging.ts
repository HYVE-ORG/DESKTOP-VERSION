export const TEAM_PAGE_SIZE = 20;
export function paginateTeam<T>(people:readonly T[],requestedPage:number) {
 const total=people.length;
 const pages=Math.max(1,Math.ceil(total/TEAM_PAGE_SIZE));
 const page=Math.min(pages,Math.max(1,Number.isFinite(requestedPage)?Math.trunc(requestedPage):1));
 const offset=(page-1)*TEAM_PAGE_SIZE;
 return {items:people.slice(offset,offset+TEAM_PAGE_SIZE),page,pages,total,start:total?offset+1:0,end:Math.min(total,offset+TEAM_PAGE_SIZE)};
}
