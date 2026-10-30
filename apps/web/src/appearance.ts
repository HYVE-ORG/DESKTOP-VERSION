export type Theme='light'|'dark'|'hybrid';
type StorageLike=Pick<Storage,'getItem'|'setItem'>;
const key='forma.appearance.v1';
export function loadTheme(storage:StorageLike):Theme {try{const value=storage.getItem(key);return value==='dark'||value==='hybrid'?value:'light';}catch{return 'light';}}
export function saveTheme(theme:Theme,storage:StorageLike):boolean {try{storage.setItem(key,theme);return true;}catch{return false;}}
