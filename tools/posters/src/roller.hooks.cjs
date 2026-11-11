// The High Roller: the throw. Both dice leave their hover, arc up over his head spinning hard, and come
// down in front of his chest on double six: a ring of gold, sparks, chips thrown up off the rail, a grin.
// Then they lift back to where they were turning.
var H={
  move:function(I){
    var T=3300, LAND=980, HOLD=2250, U=function(n){return (n/36*100).toFixed(1)+'%'};
    var dws=I.qa('.hr-dw'), LANDXY=[[98-36,312-96],[168-228,318-72]];
    I.qa('.hr-die').forEach(function(d,i){
      var dur=+d.dataset.dur, dir=+d.dataset.dir, p=0;
      try{var ca=d.getAnimations().filter(function(a){return a.animationName==='hr-tumble'})[0];if(ca)p=ca.effect.getComputedTiming().progress||0}catch(e){}
      if(dir<0)p=1-p;                                       // progress along the forward keyframes
      var p2=p+dir*T/dur;                                   // where the idle tumble will be when the move ends
      var ang=function(q){return [-24+360*q,32+360*q]}, a0=ang(p), a1=ang(p2);
      var k=dir>0?3:-3, LX=-20+360*k, LY=(i?-24:22)+360*k;  // three full turns, then six up
      var endk=Math.round((LX-a1[0])/360)+dir;              // and a turn on the way back
      var R=function(x,y){return 'rotateX('+x.toFixed(1)+'deg) rotateY('+y.toFixed(1)+'deg)'};
      I.tl(d,T,[[0,{transform:R(a0[0],a0[1])},'cubic-bezier(.3,0,.5,1)'],[LAND,{transform:R(LX,LY)}],[HOLD,{transform:R(LX,LY)},'cubic-bezier(.5,0,.4,1)'],[T,{transform:R(a1[0]+360*endk,a1[1]+360*endk)}]]);
      var w=dws[i], x=LANDXY[i][0], y=LANDXY[i][1], t0=i*70;
      var tr=function(fx,fy,s){return 'translate('+U(x*fx)+','+U(fy)+') scale('+s+')'};
      I.tl(w,T,[[0,{transform:'translate(0%,0%) scale(1)'},'cubic-bezier(.3,0,.7,1)'],[130+t0,{transform:'translate(0%,14%) scale(.94)'},'cubic-bezier(.1,.7,.4,1)'],
        [520+t0,{transform:tr(.45,-70-i*14,1.25)},'cubic-bezier(.5,0,.9,.5)'],[LAND,{transform:tr(1,y,1.42)},'cubic-bezier(.2,.8,.4,1)'],
        [LAND+110,{transform:tr(1,y-16,1.42)},'cubic-bezier(.6,0,.9,.6)'],[LAND+220,{transform:tr(1,y,1.42)}],[HOLD,{transform:tr(1,y,1.42)},'cubic-bezier(.5,0,.3,1)'],[T,{transform:'translate(0%,0%) scale(1)'}]]);
    });
    // the landing
    I.qa('.hr-ring').forEach(function(r,i){I.tl(r,T,[[0,{transform:'scale(.3)',opacity:0}],[LAND+i*90,{transform:'scale(.3)',opacity:1},'cubic-bezier(.1,.7,.2,1)'],[LAND+620+i*90,{transform:'scale('+(3.1+i)+')',opacity:0}]])});
    I.qa('.hr-spark').forEach(function(s){I.tl(s,T,[[0,{transform:'scale(.2)',opacity:0}],[LAND,{transform:'scale(.2)',opacity:1},'cubic-bezier(.1,.8,.2,1)'],[LAND+330,{transform:'scale(1.25)',opacity:1},'ease-in'],[LAND+640,{transform:'scale(1.5)',opacity:0}]])});
    I.qa('.hr-toss').forEach(function(c){
      var dx=+c.dataset.dx, h=+c.dataset.h, t=LAND+20+(+c.dataset.i)*22, up=420+h, s=(dx>0?1:-1)*(360+h*2);
      I.tl(c,T,[[0,{transform:'translate(0px,0px) rotate(0deg)',opacity:0}],[t,{transform:'translate(0px,0px) rotate(0deg)',opacity:1},'cubic-bezier(.2,.7,.4,1)'],
        [t+up*.5,{transform:'translate('+dx*.6+'px,'+(-h)+'px) rotate('+s*.5+'deg)',opacity:1},'cubic-bezier(.6,0,.9,.5)'],[t+up,{transform:'translate('+dx+'px,40px) rotate('+s+'deg)',opacity:1}],[t+up+1,{transform:'translate('+dx+'px,40px)',opacity:0}]]);
    });
    I.qa('.hr-stack').forEach(function(s,i){I.tl(s,T,[[LAND,{transform:'translateY(0px)'},'cubic-bezier(.2,.8,.3,1)'],[LAND+90,{transform:'translateY(-9px)'},'cubic-bezier(.6,0,.8,.5)'],[LAND+200+i*14,{transform:'translateY(0px)'}]])});
    // he likes it
    I.tl(I.q('.hr-smirk'),T,[[0,{opacity:1}],[LAND+60,{opacity:1}],[LAND+140,{opacity:0}],[HOLD+200,{opacity:0}],[HOLD+380,{opacity:1}]]);
    I.tl(I.q('.hr-grin'),T,[[0,{opacity:0}],[LAND+60,{opacity:0}],[LAND+140,{opacity:1}],[HOLD+200,{opacity:1}],[HOLD+380,{opacity:0}]]);
    I.tl(I.q('.hr-glint'),T,[[0,{transform:'translateX(0px)'}],[LAND+120,{transform:'translateX(0px)'},'ease-in-out'],[LAND+560,{transform:'translateX(120px)'}],[LAND+561,{transform:'translateX(0px)'}],[LAND+700,{transform:'translateX(0px)'},'ease-in-out'],[LAND+1100,{transform:'translateX(120px)'}]]);
    I.tl(I.q('.hr-l-fig'),T,[[0,{transform:'scale(1) translateY(0%)'},'ease-in-out'],[300,{transform:'scale(1.02) translateY(-.6%)'},'ease-in-out'],[LAND,{transform:'scale(1) translateY(0%)'},'cubic-bezier(.2,.8,.3,1)'],[LAND+160,{transform:'scale(1.03) translateY(0%)'},'ease-in-out'],[LAND+700,{transform:'scale(1) translateY(0%)'}]]);
    I.qa('.hr-in').forEach(function(l,i){I.tl(l,T,[[LAND,{transform:'scale(1)',filter:'brightness(1)'},'cubic-bezier(.1,.8,.2,1)'],[LAND+170,{transform:'scale('+(i?1.09:1.04)+')',filter:'brightness(1.7)'},'ease-in-out'],[LAND+900,{transform:'scale(1)',filter:'brightness(1)'}]])});
  }
};
