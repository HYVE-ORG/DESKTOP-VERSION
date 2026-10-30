import {useEffect,useLayoutEffect,type RefObject} from 'react';
import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import {ScrollToPlugin} from 'gsap/ScrollToPlugin';
import {ScrollSmoother} from 'gsap/ScrollSmoother';
gsap.registerPlugin(ScrollTrigger,ScrollToPlugin,ScrollSmoother);
export function useLandingScroll(root:RefObject<HTMLDivElement|null>,section:string){
 useEffect(()=>{
  const target=root.current?.querySelector<HTMLElement>(`[data-section="${section}"]`);
  const y=section==='inicio'?0:target?(ScrollSmoother.get()?.offset(target,'top top')??target):0;
  const tween=gsap.to(window,{scrollTo:{y,autoKill:true},duration:1.05,ease:'power3.inOut',overwrite:'auto'});
  return()=>{tween.kill();};
 },[root,section]);
}
export function useLandingMotion(root:RefObject<HTMLDivElement|null>){
 useLayoutEffect(()=>{
  const wrapper=root.current?.querySelector<HTMLElement>('.lp-smooth-wrapper'),content=root.current?.querySelector<HTMLElement>('.lp-smooth-content');
  if(!wrapper||!content)return;
  const smoother=ScrollSmoother.create({wrapper,content,smooth:1.1,smoothTouch:false,effects:false,normalizeScroll:false});
  const context=gsap.context(()=>{
   gsap.timeline({defaults:{ease:'power3.out'}}).from('.lp-nav',{y:-20,opacity:0,duration:.65}).from('.lp-hero-copy>*',{y:30,opacity:0,stagger:.1,duration:.85},.15);
   gsap.utils.toArray<HTMLElement>('.lp-reveal',root.current!).forEach(element=>gsap.from(element,{y:45,opacity:0,duration:.9,ease:'power3.out',scrollTrigger:{trigger:element,start:'top 92%',once:true}}));
   gsap.fromTo('.lp-scroll-progress',{scaleX:0},{scaleX:1,ease:'none',scrollTrigger:{start:0,end:'max',scrub:.2}});
   ScrollTrigger.create({trigger:'.lp-product',start:'top 80%',endTrigger:'.lp-final-cta',end:'top 90%',toggleClass:{targets:'.lp-dock',className:'is-visible'}});
   const media=gsap.matchMedia();
   media.add('(min-width: 900px)',()=>{
    gsap.fromTo('.lp-demo',{scale:.95,rotationX:5},{scale:1,rotationX:0,ease:'none',scrollTrigger:{trigger:'.lp-demo-wrap',start:'top bottom',end:'top 20%',scrub:1}});
    ['.lp-mini-task','.lp-mini-message','.lp-mini-agenda','.lp-mini-studio','.lp-desktop-window'].forEach((selector,index)=>gsap.fromTo(selector,{y:18,rotation:index%2?-2:2},{y:-12,rotation:0,ease:'none',scrollTrigger:{trigger:selector,start:'top bottom',end:'bottom top',scrub:1.2}}));
   });
  },root);
  // Disclosures change the height used by ScrollSmoother and anchor navigation.
  const resize=new ResizeObserver(()=>ScrollTrigger.refresh());resize.observe(content);ScrollTrigger.refresh();
  return()=>{resize.disconnect();context.revert();smoother.kill();};
 },[root]);
}
