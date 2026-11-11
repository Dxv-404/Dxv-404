// Pixel Knight: a 12 fps frame stepper. No easing, no tweening: each tick shows one sprite
// frame plus a few overlay pixels, like a game sprite sheet.
var FPS=12;
// signature move, one entry per tick: [frame, {flash, glint, spark, dy}]
var SIG=(function(){
  var s=[['crouch'],['crouch'],['rip',{flash:1}],['pull'],['smear'],['up0',{spark:0}]],i;
  for(i=0;i<16;i++)s.push([(i>>1)%2?'up2':'up1',{glint:i,spark:i===0?1:i===1?2:-1}]);
  s.push(['up2'],['smear'],['slam',{dy:1}],['settle'],['crouch']);
  return s;
})();
var ENT=[[null,{dark:1}],[null,{dark:.66}],[null,{dark:.33}],['i1',{dy:-34}],['i2',{dy:-16}],['i1',{dy:-4}],['slam',{dy:1}],['settle'],['crouch']];
var IDLE=['i0','i0','i1','i1','i2','i2','i1','i1'];
function knShow(I,frame,o,n){
  o=o||{};var S=I.kn;
  S.frames.forEach(function(f){f.classList.toggle('kn-on',f.dataset.f===frame)});
  S.sprite.setAttribute('transform',o.dy?'translate(0 '+o.dy+')':'');
  S.flash.classList.toggle('kn-on',!!o.flash);
  S.dark.classList.toggle('kn-on',!!o.dark);S.dark.setAttribute('opacity',o.dark||0);
  S.gl.forEach(function(g){g.classList.toggle('kn-on',o.glint!==undefined&&+g.dataset.i===o.glint)});
  S.spark.forEach(function(g){g.classList.toggle('kn-on',o.spark!==undefined&&+g.dataset.i===o.spark)});
  S.visor.classList.toggle('kn-on',!!o.dim);
  S.stars.forEach(function(st,i){st.classList.toggle('kn-on',n!==undefined&&((n+i*7)%29)<3)});
}
function knRender(I){
  var S=I.kn,n=S.n,m=S.mode;
  if(m==='ent'&&n>=ENT.length){m=S.mode='idle';n=S.n=0}
  if(m==='sig'&&n>=SIG.length){m=S.mode='idle';n=S.n=0}
  if(m==='ent')knShow(I,ENT[n][0],ENT[n][1],n);
  else if(m==='sig')knShow(I,SIG[n][0],SIG[n][1],S.t);
  else knShow(I,IDLE[n%IDLE.length],{dim:(n%37)===9||(n%37)===11||(n%53)===30},S.t);
}
function knLoop(I){
  var S=I.kn;cancelAnimationFrame(S.raf);S.last=0;
  if(!I.run||I.level()!=='full'||S.manual)return;
  S.raf=requestAnimationFrame(function step(ts){
    if(!S.last)S.last=ts;
    if(I.level()!=='full'){H.reset(I);return}                 // level changed under us: rest
    if(ts-S.last>=1000/FPS){S.last+=Math.max(1,Math.floor((ts-S.last)/(1000/FPS)))*(1000/FPS);S.n++;S.t++;knRender(I)}
    S.raf=requestAnimationFrame(step);
  });
}
var H={
  init:function(I){
    I.kn={n:0,t:0,mode:'idle',raf:0,frames:I.qa('.kn-f'),sprite:I.q('.kn-sprite'),flash:I.q('.kn-flash'),dark:I.q('.kn-dark'),
      gl:I.qa('.kn-gl'),spark:I.qa('.kn-spark'),visor:I.q('.kn-visor'),stars:I.qa('.kn-star')};
  },
  reset:function(I){var S=I.kn;cancelAnimationFrame(S.raf);S.mode='idle';S.n=0;knShow(I,'i0',{})},   // resting frame
  enter:function(I,lv){var S=I.kn;if(lv!=='full')return;S.mode='ent';S.n=0;knRender(I);knLoop(I)},
  move:function(I){var S=I.kn;S.mode='sig';S.n=0;knRender(I);knLoop(I)},
  run:function(I){knLoop(I)}
};
// test-harness hook (only used with #manual)
window.knSeek=function(ph,t){window.knDbg.forEach(function(I){var S=I.kn;S.manual=1;cancelAnimationFrame(S.raf);
  S.mode=ph==='ent'?'ent':ph;S.n=Math.floor(t/(1000/FPS));S.t=S.n+40;if(ph==='idle')S.n=S.n%8+S.n-S.n%8;knRender(I)})};
