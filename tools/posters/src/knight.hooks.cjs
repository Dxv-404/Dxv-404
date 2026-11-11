// Pixel Knight: a 12 fps frame stepper. No easing, no tweening: each tick shows one sprite
// frame plus pixel overlays (the effects), like a game sprite sheet.
var FPS=12;
// signature move, one entry per tick: [frame, {flash, dy, x:[overlay names], sh:[dx,dy] shake}]
// He tears the sword from the ground and raises it; light pours into the blade until it is white-hot and
// the moon flares; then he drives it down: a pillar of light, the ground splits, the page shakes.
var SIG=(function(){
  var s=[['crouch'],['crouch'],['rip',{flash:1,sh:[0,-1]}],['pull',{sh:[0,1]}],['smear'],['up0',{x:['f1']}]],i,x;
  for(i=0;i<14;i++){
    x=[i>=6?'halo2':'halo','f'+Math.min(5,1+Math.floor(i/2.5))];
    if(i<6)x.push('g'+i);
    if(i>=3)x.push('a'+(i%3));
    if(i>=5&&i%2)x.push('hot');
    if(i>=7&&i%2)x.push('z'+((i>>1)%3));
    s.push([(i>>1)%2?'up2':'up1',{x:x,sh:i>=9?[i%2?1:-1,0]:null}]);
  }
  s.push(['up2',{x:['a0','f5','halo2','hot']}],['smear',{x:['halo2']}]);
  var SH=[[0,3],[1,-2],[-1,2],[1,-1],[-1,1],[0,-1],[0,1]];
  for(i=0;i<9;i++){
    x=['s'+i];if(i<6)x.push('b'+i);if(i<7)x.push('hotp');if(i<3)x.push('halo2');if(i===2||i===4)x.push('hot');
    s.push([i<2?'slamsil':i<5?'slam':i<8?'settle':'crouch',{flash:i===0?1:0,dy:i<2?1:0,x:x,sh:SH[i]}]);
  }
  for(i=0;i<10;i++)s.push([i<2?'crouch':['i0','i0','i1','i1','i2','i2','i1','i1'][i-2],{x:['e'+i]}]);
  return s;
})();
var ENT=[[null,{dark:1}],[null,{dark:.66}],[null,{dark:.33}],['i1',{dy:-34}],['i2',{dy:-16}],['i1',{dy:-4}],
  ['slamsil',{dy:1,flash:1,sh:[0,2]}],['slam',{dy:1,x:['s0'],sh:[0,-1]}],['slam',{x:['s1'],sh:[0,1]}],['settle',{x:['s2']}],['settle',{x:['s3']}],['crouch',{x:['s4']}]];
var IDLE=['i0','i0','i1','i1','i2','i2','i1','i1'];
var MX=[6,13,19,30,36,42];
function knShow(I,frame,o,n){
  o=o||{};var S=I.kn,xs=o.x||[];
  S.frames.forEach(function(f){f.classList.toggle('kn-on',f.dataset.f===frame)});
  S.sprite.setAttribute('transform',o.dy?'translate(0 '+o.dy+')':'');
  S.scene.setAttribute('transform',o.sh?'translate('+o.sh[0]+' '+o.sh[1]+')':'');
  S.flash.classList.toggle('kn-on',!!o.flash);
  S.dark.classList.toggle('kn-on',!!o.dark);S.dark.setAttribute('opacity',o.dark||0);
  S.gl.forEach(function(g){g.classList.toggle('kn-on',o.glint!==undefined&&+g.dataset.i===o.glint)});
  S.spark.forEach(function(g){g.classList.toggle('kn-on',o.spark!==undefined&&+g.dataset.i===o.spark)});
  S.xs.forEach(function(g){g.classList.toggle('kn-on',xs.indexOf(g.dataset.x)>=0)});
  S.visor.classList.toggle('kn-on',!!o.dim);
  S.stars.forEach(function(st,i){st.classList.toggle('kn-on',n!==undefined&&((n+i*7)%29)<3)});
  // fireflies drifting up (only while it runs)
  S.motes.forEach(function(m,i){
    if(n===undefined||o.dark){m.classList.remove('kn-on');return}
    var p=(n*(i%3+1)*.3+i*11)%48;
    m.setAttribute('x',MX[i]+Math.round(Math.sin((n+i*9)/7)*1.5));m.setAttribute('y',56-Math.floor(p));
    m.classList.toggle('kn-on',p<42&&((n+i)%6)!==0);
  });
}
function knRender(I){
  var S=I.kn,n=S.n,m=S.mode;
  if(m==='ent'&&n>=ENT.length){m=S.mode='idle';n=S.n=0}
  if(m==='sig'&&n>=SIG.length){m=S.mode='idle';n=S.n=0}
  if(m==='ent')knShow(I,ENT[n][0],ENT[n][1],n);
  else if(m==='sig')knShow(I,SIG[n][0],SIG[n][1],S.t);
  else{var t=S.t,x=(t%36)<18?['halo']:[],k=t%190;if(k<5)x.push('ss'+k);k=(t%70)-44;if(k>=0&&k<8)x.push('pg'+k);
    knShow(I,IDLE[n%IDLE.length],{dim:(n%37)===9||(n%37)===11||(n%53)===30,x:x},t)}
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
      gl:I.qa('.kn-gl'),spark:I.qa('.kn-spark'),visor:I.q('.kn-visor'),stars:I.qa('.kn-star'),xs:I.qa('.kn-x'),scene:I.q('.kn-scene'),motes:I.qa('.kn-mote')};
  },
  reset:function(I){var S=I.kn;cancelAnimationFrame(S.raf);S.mode='idle';S.n=0;knShow(I,'i0',{})},   // resting frame
  enter:function(I,lv){var S=I.kn;if(lv!=='full')return;S.mode='ent';S.n=0;knRender(I);knLoop(I)},
  move:function(I){var S=I.kn;S.mode='sig';S.n=0;knRender(I);knLoop(I)},
  run:function(I){knLoop(I)}
};
// test-harness hook (only used with #manual)
window.knSeek=function(ph,t){window.knDbg.forEach(function(I){var S=I.kn;S.manual=1;cancelAnimationFrame(S.raf);
  S.mode=ph==='ent'?'ent':ph;S.n=Math.floor(t/(1000/FPS));S.t=S.n+40;if(ph==='idle')S.n=S.n%8+S.n-S.n%8;knRender(I)})};
