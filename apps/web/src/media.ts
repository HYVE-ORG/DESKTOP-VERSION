/** Permission prompts may resolve after the owner closes or changes conversation. */
export function meetingShortcut(key:string,tag:string,editing:boolean,modified:boolean):'audio'|'video'|null {
    if(editing||modified||['INPUT','TEXTAREA','SELECT'].includes(tag))return null;
    return key.toLowerCase()==='m'?'audio':key.toLowerCase()==='c'?'video':null;
}
export async function ownMedia(pending: Promise<MediaStream>, isCurrent: () => boolean) {
    const stream = await pending;
    if (!isCurrent()) {
        stream.getTracks().forEach(track => track.stop());
        return null;
    }
    return stream;
}
