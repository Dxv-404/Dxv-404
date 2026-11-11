// Ink Sensei signature move: coil, thrust, chips whip tight, fling + ink burst + gust, seal stamp.
var H={
  move:function(I){
    var T=2500, HIT=800;                               // HIT = the instant the chips are flung
    // 1. arm: coil back, thrust, small recoil on the fling
    I.tl(I.q('.sn-arm'),T,[
      [0,{transform:'rotate(0deg) scale(1,1)'},'cubic-bezier(.3,0,.3,1)'],
      [230,{transform:'rotate(15deg) scale(.66,.96)'}],
      [290,{transform:'rotate(16deg) scale(.64,.96)'},'cubic-bezier(.05,.9,.2,1)'],
      [370,{transform:'rotate(-4deg) scale(1.12,1)'},'ease-in-out'],
      [540,{transform:'rotate(0deg) scale(1,1)'}],
      [HIT-40,{transform:'rotate(1deg) scale(.97,1)'},'cubic-bezier(.05,.9,.2,1)'],
      [HIT+40,{transform:'rotate(-3deg) scale(1.08,1)'},'ease-in-out'],
      [HIT+320,{transform:'rotate(0deg) scale(1,1)'}]]);
    // 2. vortex: unwinds a touch, whips two turns while tightening, explodes, re-forms
    I.tl(I.q('.sn-vortex'),T,[
      [0,{transform:'rotate(0deg) scale(1)'},'ease-out'],
      [270,{transform:'rotate(-28deg) scale(1.08)'},'cubic-bezier(.55,0,.85,.4)'],
      [HIT,{transform:'rotate(720deg) scale(.3)'},'cubic-bezier(.05,.8,.2,1)'],
      [HIT+330,{transform:'rotate(770deg) scale(1.7)'}],
      [1490,{transform:'rotate(770deg) scale(1.7)'}],
      [1500,{transform:'rotate(-240deg) scale(.25)'},'cubic-bezier(.15,.7,.2,1)'],
      [2350,{transform:'rotate(0deg) scale(1)'}]]);
    I.qa('.sn-chip').forEach(function(c,k){
      var ux=+c.dataset.ux,uy=+c.dataset.uy,d=26+((k*37)%29),sp=(k%2?1:-1)*(200+k*40),back=1520+k*45;
      I.tl(c,T,[
        [HIT,{transform:'translate(0px,0px) rotate(0deg)',opacity:1},'cubic-bezier(.1,.7,.3,1)'],
        [HIT+230,{transform:'translate('+ux*d*.85+'px,'+uy*d*.85+'px) rotate('+sp*.8+'deg)',opacity:1}],
        [HIT+360,{transform:'translate('+ux*d+'px,'+uy*d+'px) rotate('+sp+'deg)',opacity:0}],
        [back-5,{transform:'translate('+ux*d+'px,'+uy*d+'px) rotate('+sp+'deg)',opacity:0}],
        [back,{transform:'translate(0px,0px) rotate(0deg)',opacity:0}],
        [back+220,{transform:'translate(0px,0px) rotate(0deg)',opacity:1}]]);
    });
    I.tl(I.q('.sn-flecks'),T,[[HIT,{opacity:.8}],[HIT+260,{opacity:0}],[1700,{opacity:0}],[2300,{opacity:.8}]]);
    // 3. speed rays crack outward from the fingertips
    I.qa('.sn-ray').forEach(function(r,i){
      I.tl(r,T,[[HIT-10,{transform:'scale(.15)',opacity:0}],[HIT,{transform:'scale(.2)',opacity:.95},'cubic-bezier(.1,.8,.2,1)'],
        [HIT+130+i%3*30,{transform:'scale(1)',opacity:.9}],[HIT+420,{transform:'scale(1.12)',opacity:0}]]);
    });
    // 4. ink: big splats slap onto the paper, droplets fly out from the hand and stick
    I.qa('.sn-splat').forEach(function(s,i){
      var t=HIT+50+i*38;
      I.tl(s,T,[[t-1,{transform:'scale(.1)',opacity:0}],[t,{transform:'scale(.15)',opacity:1},'cubic-bezier(.1,.9,.2,1)'],
        [t+90,{transform:'scale(1.12)',opacity:1},'ease-out'],[t+240,{transform:'scale(1)',opacity:1}],
        [1850,{transform:'scale(1)',opacity:.92}],[2450,{transform:'scale(1)',opacity:0}]]);
    });
    I.qa('.sn-drop').forEach(function(d,i){
      var t=HIT+(i%5)*14,fly=150+(i%4)*45;
      I.tl(d,T,[[t-1,{translate:d.dataset.dx+'px '+d.dataset.dy+'px',opacity:0}],[t,{translate:(d.dataset.dx*.8)+'px '+(d.dataset.dy*.8)+'px',opacity:1},'cubic-bezier(.1,.7,.2,1)'],
        [t+fly,{translate:'0px 0px',opacity:1}],[1800,{translate:'0px 0px',opacity:.9}],[2400+(i%3)*30,{translate:'0px 0px',opacity:0}]]);
    });
    // 5. the gust: robe tatters, beard and hair snap straight out, then ring down; wind rips across
    I.qa('.sn-gust').forEach(function(g,i){
      var t=HIT+30+(i%4)*22,s=(i%2?1:-1);
      I.tl(g,T,[[t,{transform:'rotate(0deg) scale(1,1)'},'cubic-bezier(.05,.9,.2,1)'],
        [t+90,{transform:'rotate('+(-9*s-4)+'deg) scale(1.34,.82)'},'ease-in-out'],
        [t+250,{transform:'rotate('+(6*s)+'deg) scale(.93,1.08)'},'ease-in-out'],
        [t+430,{transform:'rotate('+(-3.5*s)+'deg) scale(1.1,.96)'},'ease-in-out'],
        [t+640,{transform:'rotate('+(1.5*s)+'deg) scale(.98,1.02)'},'ease-in-out'],
        [t+860,{transform:'rotate(0deg) scale(1,1)'}]]);
    });
    I.qa('.sn-rush').forEach(function(r,i){
      var t=HIT+i*46;
      I.tl(r,T,[[t-1,{transform:'translateX(0px)',opacity:0}],[t,{transform:'translateX(0px)',opacity:1},'cubic-bezier(.3,.3,.4,1)'],
        [t+330,{transform:'translateX(430px)',opacity:.9}],[t+420,{transform:'translateX(470px)',opacity:0}]]);
    });
    // 6. the seal stamps
    var ST=1330;
    I.tl(I.q('.sn-seal'),T,[[HIT+200,{transform:'scale(1)',opacity:1}],[HIT+330,{transform:'scale(1)',opacity:0}],
      [ST-110,{transform:'scale(2.5) rotate(-9deg)',opacity:0},'cubic-bezier(.6,0,.9,.5)'],
      [ST,{transform:'scale(.9) rotate(0deg)',opacity:1},'ease-out'],[ST+70,{transform:'scale(1.06)',opacity:1}],[ST+170,{transform:'scale(1)',opacity:1}]]);
    I.tl(I.q('.sn-sealring'),T,[[ST-1,{transform:'scale(1)',opacity:0}],[ST,{transform:'scale(1)',opacity:.9},'ease-out'],[ST+380,{transform:'scale(1.9)',opacity:0}]]);
  }
};
