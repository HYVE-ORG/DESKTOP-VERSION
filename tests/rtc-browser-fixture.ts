// Apenas harness descartável de QA. Não solicita câmera/microfone do usuário.
import {Room,RoomEvent,LocalVideoTrack,LocalAudioTrack,Track} from 'livekit-client';
const room=new Room(),status=document.querySelector('#status')!,videos=document.querySelector('#videos')!,event=(document.querySelector('#event') as HTMLInputElement).value;
let animation=0,audio:AudioContext|undefined;
function render(){status.textContent=`Estado: ${room.state}; participantes: ${room.remoteParticipants.size+1}; faixas remotas: ${[...room.remoteParticipants.values()].reduce((n,p)=>n+[...p.trackPublications.values()].filter(t=>t.isSubscribed).length,0)}; vídeos decodificados: ${[...videos.querySelectorAll('video')].filter(v=>v.videoWidth>0).length}`;}
room.on(RoomEvent.TrackSubscribed,track=>{const element=track.attach();element.autoplay=true;if(element instanceof HTMLMediaElement)element.muted=true;videos.append(element);render();});
room.on(RoomEvent.ParticipantConnected,render).on(RoomEvent.ParticipantDisconnected,render).on(RoomEvent.Disconnected,render);
document.querySelector('#join')!.addEventListener('click',async()=>{try{const res=await fetch(`/api/meetings/${event}/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const data=await res.json();if(!res.ok)throw Error(data.message);await room.connect(data.serverUrl,data.token);render();}catch(e){status.textContent=(e as Error).message;}});
document.querySelector('#publish')!.addEventListener('click',async()=>{
 try{
  const canvas=document.querySelector('canvas')!,ctx=canvas.getContext('2d')!;let frame=0;
  const draw=()=>{ctx.fillStyle='#1c3e2a';ctx.fillRect(0,0,320,180);ctx.fillStyle='#eead55';ctx.fillRect(frame++%280,40,40,70);animation=requestAnimationFrame(draw);};draw();
  await room.localParticipant.publishTrack(new LocalVideoTrack(canvas.captureStream(10).getVideoTracks()[0]),{source:Track.Source.Camera});
  audio=new AudioContext();await audio.resume();const oscillator=audio.createOscillator(),gain=audio.createGain(),destination=audio.createMediaStreamDestination();gain.gain.value=0.001;oscillator.connect(gain);gain.connect(destination);oscillator.start();
  await room.localParticipant.publishTrack(new LocalAudioTrack(destination.stream.getAudioTracks()[0]),{source:Track.Source.Microphone});render();
 }catch(e){status.textContent=(e as Error).message;}
});
document.querySelector('#leave')!.addEventListener('click',()=>{cancelAnimationFrame(animation);void audio?.close();void room.disconnect();render();});
setInterval(render,1000);window.addEventListener('pagehide',()=>{cancelAnimationFrame(animation);void audio?.close();void room.disconnect();});
