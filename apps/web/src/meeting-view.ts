type VisualTrack={participant:{identity:string};source:string};
export function meetingTrackKey(track:VisualTrack){return `${track.participant.identity}:${track.source}`;}
export function chooseMeetingTrack<T extends VisualTrack>(tracks:T[],selected:string|null,speaker?:string):T|undefined{
 return tracks.find(t=>meetingTrackKey(t)===selected)||tracks.find(t=>t.source==='screen_share')||tracks.find(t=>t.participant.identity===speaker&&t.source==='camera')||tracks[0];
}
