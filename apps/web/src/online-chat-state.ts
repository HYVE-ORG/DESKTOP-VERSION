/** Uma confirmação não consome arquivos que chegaram depois do snapshot enviado. */
export function remainingDraftFiles<T extends {id:string}>(current:readonly T[],publishedIds:readonly string[]):T[]{
 const published=new Set(publishedIds);return current.filter(file=>!published.has(file.id));
}
