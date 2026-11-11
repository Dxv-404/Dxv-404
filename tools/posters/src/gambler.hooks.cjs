// Classic Gambler signature move: the ace vanishes from his fingers, bursts up out of the gold
// stack spinning (scaleX flip, face/back), and he snatches it. Ember flares, chips jump, rays pulse.
var H={
  move:function(I){
    var T=1900, POP=330, CATCH=960, RX=7, RY=-9;            // RX,RY: where the hand reaches to
    function off(t){return Math.max(0,Math.min(1,t/T))}
    // sampled ballistic path -> keyframes (x linear, y parabola), fn(u) returns extra transform text
    function arc(el,t0,dur,x1,y1,peak,fn,pre,post){
      var kf=[],n=22,i,u,x,y;
      kf.push({offset:0,transform:pre||'translate(0px,0px)',opacity:pre?0:1});
      if(pre)kf.push({offset:off(t0-1),transform:'translate(0px,0px)',opacity:0});
      for(i=0;i<=n;i++){u=i/n;x=x1*u;y=y1*u-peak*4*u*(1-u);
        kf.push({offset:off(t0+dur*u),transform:'translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px) '+(fn?fn(u):''),opacity:1});}
      return kf;
    }
    // 1. vanish: wrist flick, the held card turns edge-on and is gone
    var hand=I.q('.gm-hand');
    I.tl(hand,T,[[0,{transform:'translate(0px,0px) rotate(0deg)'},'ease-in'],
      [90,{transform:'translate(-2px,3px) rotate(-10deg)'},'cubic-bezier(.1,.8,.3,1)'],
      [190,{transform:'translate(1px,-2px) rotate(4deg)'},'ease-in-out'],
      [360,{transform:'translate(0px,0px) rotate(0deg)'}],
      [700,{transform:'translate(0px,0px) rotate(0deg)'},'cubic-bezier(.5,0,.8,.4)'],
      [CATCH-20,{transform:'translate('+RX+'px,'+RY+'px) rotate(0deg)'}],
      [CATCH,{transform:'translate('+RX+'px,'+RY+'px) rotate(0deg)'},'cubic-bezier(.1,.8,.3,1)'],
      [CATCH+70,{transform:'translate(-5px,6px) rotate(6deg)'},'ease-in-out'],
      [CATCH+230,{transform:'translate(1px,-1px) rotate(-1.5deg)'},'ease-in-out'],
      [CATCH+400,{transform:'translate(0px,0px) rotate(0deg)'}]]);
    I.tl(I.q('.gm-card'),T,[[0,{transform:'scale(1,1)',opacity:1},'ease-in'],
      [150,{transform:'scale(.02,1.04)',opacity:1}],[151,{transform:'scale(.02,1)',opacity:0}],
      [CATCH-1,{transform:'scale(1.1,1.1)',opacity:0}],[CATCH,{transform:'scale(1.1,1.1)',opacity:1},'ease-out'],
      [CATCH+200,{transform:'scale(1,1)',opacity:1}]]);
    // 2. the ace erupts from behind the gold stack and flies to the fingers
    var X0=103.5, Y0=74, PEAK=58, DUR=CATCH-POP, n=30, kc=[], kf=[], kb=[], i, u, sx, s, x, y, r, o;
    kc.push({offset:0,transform:'translate('+X0+'px,'+Y0+'px)',opacity:0});
    kc.push({offset:off(POP-1),transform:'translate('+X0+'px,'+Y0+'px)',opacity:0});
    kf.push({offset:0,opacity:1});kb.push({offset:0,opacity:0});
    for(i=0;i<=n;i++){
      u=i/n; o=off(POP+DUR*u);
      var e=u*u*(3-2*u);e=.35*u+.65*e;                    // x: straight up off the stack first, then across
      x=X0+(RX-X0)*e; y=Y0+(RY-Y0)*u-PEAK*4*u*(1-u);
      sx=Math.cos(Math.PI*4*u); s=1+.22*Math.sin(Math.PI*u);
      r=-374*Math.pow(1-u,1.5);
      kc.push({offset:o,transform:'translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px) rotate('+r.toFixed(1)+'deg) scale('+(s*(Math.abs(sx)<.04?.04:sx)).toFixed(3)+','+s.toFixed(3)+')',opacity:1});
      kf.push({offset:o,opacity:sx>=0?1:0});kb.push({offset:o,opacity:sx>=0?0:1});
    }
    kc.push({offset:off(CATCH+1),transform:'translate('+RX+'px,'+RY+'px)',opacity:0});
    kc.push({offset:1,transform:'translate('+RX+'px,'+RY+'px)',opacity:0});
    kf.push({offset:1,opacity:1});kb.push({offset:1,opacity:0});
    I.anim(I.q('.gm-fly'),kc,{duration:T});I.anim(I.q('.gm-fly-face'),kf,{duration:T});I.anim(I.q('.gm-fly-back'),kb,{duration:T});
    // catch flash on the card
    I.tl(I.q('.gm-catch'),T,[[CATCH-1,{transform:'scale(.2) rotate(0deg)',opacity:0}],[CATCH,{transform:'scale(.3) rotate(0deg)',opacity:1},'ease-out'],
      [CATCH+120,{transform:'scale(1.25) rotate(35deg)',opacity:1}],[CATCH+330,{transform:'scale(.1) rotate(80deg)',opacity:0}]]);
    // 3. stacks: rumble, pop, settle
    I.tl(I.q('.gm-stack-g'),T,[[150,{transform:'translate(0px,0px) scale(1,1)'}],[190,{transform:'translate(1.4px,0px) scale(1,1)'}],[230,{transform:'translate(-1.4px,0px) scale(1,1)'}],
      [270,{transform:'translate(1.2px,0px) scale(1.02,.97)'}],[POP-10,{transform:'translate(0px,0px) scale(1.07,.9)'},'cubic-bezier(.1,.8,.3,1)'],
      [POP+70,{transform:'translate(0px,-7px) scale(.95,1.08)'},'ease-in'],[POP+190,{transform:'translate(0px,0px) scale(1.05,.94)'},'ease-out'],[POP+300,{transform:'translate(0px,0px) scale(1,1)'}]]);
    I.tl(I.q('.gm-stack-r'),T,[[POP+20,{transform:'translate(0px,0px)'},'ease-out'],[POP+90,{transform:'translate(1px,-3px)'},'ease-in'],[POP+180,{transform:'translate(0px,0px)'}]]);
    I.tl(I.q('.gm-stack-w'),T,[[POP+40,{transform:'translate(0px,0px)'},'ease-out'],[POP+110,{transform:'translate(1px,-2px)'},'ease-in'],[POP+200,{transform:'translate(0px,0px)'}]]);
    // 4. chips: two fly off the stack and off the table, the loose two are knocked up and land back
    var flip=function(turns){return function(u){return 'rotate('+(turns*360*u).toFixed(0)+'deg) scale(1,'+(1+.8*Math.abs(Math.sin(Math.PI*turns*2*u))).toFixed(2)+')'}};
    var c=arc(I.q('.gm-spill-c'),POP,620,74,96,74,flip(1.25),'x');c.push({offset:1,transform:'translate(74px,96px)',opacity:0});
    I.anim(I.q('.gm-spill-c'),c,{duration:T});
    var d=arc(I.q('.gm-spill-d'),POP+40,640,-52,96,60,flip(-1),'x');d.push({offset:1,transform:'translate(-52px,96px)',opacity:0});
    I.anim(I.q('.gm-spill-d'),d,{duration:T});
    var a=arc(I.q('.gm-toss-a'),POP+30,520,0,0,46,flip(1));
    a.push({offset:off(POP+600),transform:'translate(0px,-5px) rotate(360deg) scale(1,1)',opacity:1});a.push({offset:off(POP+660),transform:'translate(0px,0px) rotate(360deg) scale(1,1)',opacity:1});a.push({offset:1,transform:'translate(0px,0px) rotate(360deg) scale(1,1)',opacity:1});
    I.anim(I.q('.gm-toss-a'),a,{duration:T});
    var b=arc(I.q('.gm-toss-b'),POP+70,440,0,0,30,flip(-.5));
    b.push({offset:off(POP+560),transform:'translate(0px,-3px) rotate(-180deg) scale(1,1)',opacity:1});b.push({offset:off(POP+610),transform:'translate(0px,0px) rotate(-180deg) scale(1,1)',opacity:1});b.push({offset:1,transform:'translate(0px,0px) rotate(-180deg) scale(1,1)',opacity:1});
    I.anim(I.q('.gm-toss-b'),b,{duration:T});
    // 5. on the catch: ember flares, lights his face, smoke ring; eyes flash; sunburst pulses once
    I.tl(I.q('.gm-flare'),T,[[CATCH,{transform:'scale(1)'},'cubic-bezier(.1,.8,.3,1)'],[CATCH+110,{transform:'scale(2.7)'},'ease-in-out'],[CATCH+620,{transform:'scale(1)'}]]);
    I.tl(I.q('.gm-jawflare'),T,[[CATCH,{opacity:0},'ease-out'],[CATCH+110,{opacity:.75},'ease-in-out'],[CATCH+650,{opacity:0}]]);
    I.tl(I.q('.gm-ring'),T,[[CATCH+60,{transform:'translate(0px,0px) scale(.4)',opacity:0}],[CATCH+100,{transform:'translate(1px,-2px) scale(.7)',opacity:.9},'ease-out'],[CATCH+760,{transform:'translate(14px,-30px) scale(3.2)',opacity:0}]]);
    I.tl(I.q('.gm-glint'),T,[[CATCH,{opacity:0}],[CATCH+70,{opacity:1}],[CATCH+300,{opacity:.6}],[CATCH+560,{opacity:0}]]);
    I.tl(I.q('.gm-star'),T,[[CATCH,{transform:'scale(0) rotate(0deg)',opacity:0}],[CATCH+110,{transform:'scale(1.2) rotate(40deg)',opacity:1}],[CATCH+380,{transform:'scale(0) rotate(100deg)',opacity:0}]]);
    I.tl(I.q('.gm-rays'),T,[[CATCH,{opacity:.13,transform:'scale(1) rotate(0deg)'},'cubic-bezier(.1,.8,.3,1)'],[CATCH+130,{opacity:.5,transform:'scale(1.06) rotate(3deg)'},'ease-in-out'],[CATCH+800,{opacity:.13,transform:'scale(1) rotate(0deg)'}]]);
    I.tl(I.q('.gm-rings'),T,[[CATCH,{opacity:.55,transform:'scale(1)'},'cubic-bezier(.1,.8,.3,1)'],[CATCH+150,{opacity:1,transform:'scale(1.07)'},'ease-in-out'],[CATCH+800,{opacity:.55,transform:'scale(1)'}]]);
  },
  // the smoke ribbon is SMIL: pause/rewind it with the motion level and visibility
  smil:function(I,on){var s=I.q('.gm-l-smoke');try{if(on)s.unpauseAnimations();else s.pauseAnimations()}catch(e){}},
  enter:function(I,lv){if(lv!=='full'){try{I.q('.gm-l-smoke').setCurrentTime(0)}catch(e){}}H.smil(I,lv==='full'&&I.run)},
  run:function(I,on){H.smil(I,on&&I.level()==='full')}
};
// test-harness hook (only used with #manual)
window.gmSeek=function(ph,t){[].forEach.call(document.querySelectorAll('.gm-svg'),function(s){s.pauseAnimations();s.setCurrentTime(((ph==='sig'?6000:0)+t)/1000)})};
