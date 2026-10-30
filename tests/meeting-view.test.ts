import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseMeetingTrack} from '../apps/web/src/meeting-view';
const camera=(identity:string)=>({participant:{identity},source:'camera'});
const a=camera('a'),b=camera('b'),screen={participant:{identity:'b'},source:'screen_share'};
test('meeting focus prioritizes screen sharing then active speaker then first track',()=>{
 assert.equal(chooseMeetingTrack([a,b,screen],null,'a'),screen);
 assert.equal(chooseMeetingTrack([a,b],null,'b'),b);
 assert.equal(chooseMeetingTrack([a,b],null,'missing'),a);
});
test('manual focus stays on its source and safely falls back when that track leaves',()=>{
 assert.equal(chooseMeetingTrack([a,b,screen],'a:camera','b'),a);
 assert.equal(chooseMeetingTrack([b,screen],'a:camera','a'),screen);
 assert.equal(chooseMeetingTrack([a,b,screen],'b:screen_share','a'),screen);
 assert.equal(chooseMeetingTrack([],null,'a'),undefined);
});
