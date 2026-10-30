const languages:Record<string,string>={ts:'TypeScript',tsx:'TypeScript React',js:'JavaScript',jsx:'JavaScript React',html:'HTML',css:'CSS',py:'Python',sql:'SQL',yaml:'YAML',yml:'YAML',json:'JSON',md:'Markdown',txt:'Texto',log:'Log',csv:'CSV'};
export const codeLanguage=(name:string)=>languages[name.split('.').pop()?.toLowerCase()||'']||null;
export const PREVIEW_LIMIT=500*1024;
export function codeTokens(source:string):{text:string;kind:string}[] {
 const pattern=/(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(const|let|var|function|return|export|import|from|class|interface|type|async|await|if|else|for|while|def|True|False|None|true|false|null|SELECT|FROM|WHERE)\b|\b(\d+(?:\.\d+)?)\b/g;
 const tokens:{text:string;kind:string}[]=[];let last=0;
 for(const m of source.matchAll(pattern)){if(m.index!>last)tokens.push({text:source.slice(last,m.index),kind:'plain'});tokens.push({text:m[0],kind:m[1]?'comment':m[2]?'string':m[3]?'keyword':'number'});last=m.index!+m[0].length;}
 if(last<source.length)tokens.push({text:source.slice(last),kind:'plain'});return tokens;
}
