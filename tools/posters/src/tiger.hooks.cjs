// Ink Tiger: the roar. The head draws back, lunges, the jaw drops; three claw strokes rip across the page,
// ink flies from the mouth, the bamboo is thrown back by the gust; then it settles.
var H={
  move:function(I){
    var T=2400, E='cubic-bezier(.15,.9,.2,1)';
    I.qa('.tg-hd').forEach(function(el){
      I.tl(el,T,[[0,{transform:'scale(1) translateY(0%)'},'cubic-bezier(.5,0,.8,.4)'],[190,{transform:'scale(.955) translateY(1.4%)'},E],
        [360,{transform:'scale(1.1) translateY(-1.8%)'},'ease-in-out'],[520,{transform:'scale(1.075) translateY(-1.2%)'},'ease-in-out'],
        [1180,{transform:'scale(1.07) translateY(-1%)'},'cubic-bezier(.4,0,.2,1)'],[1750,{transform:'scale(1) translateY(0%)'}]]);
    });
    I.tl(I.q('.tg-maw'),T,[[0,{transform:'scaleY(0)',opacity:1}],[250,{transform:'scaleY(0)',opacity:1},E],[400,{transform:'scaleY(1.06)',opacity:1},'ease-in-out'],
      [1150,{transform:'scaleY(1)',opacity:1},'cubic-bezier(.5,0,.3,1)'],[1480,{transform:'scaleY(0)',opacity:1}]]);
    I.tl(I.q('.tg-chin'),T,[[250,{transform:'translateY(0px)'},E],[400,{transform:'translateY(33px)'},'ease-in-out'],[1150,{transform:'translateY(30px)'},'cubic-bezier(.5,0,.3,1)'],[1480,{transform:'translateY(0px)'}]]);
    I.qa('.tg-glow').forEach(function(g){I.tl(g,T,[[200,{transform:'scale(1)',opacity:.8},E],[380,{transform:'scale(1.55)',opacity:1}],[1150,{transform:'scale(1.4)',opacity:1},'ease-in-out'],[1800,{transform:'scale(1)',opacity:.7}]])});
    I.qa('.tg-iris').forEach(function(g){I.tl(g,T,[[200,{transform:'scale(1,1)'},E],[380,{transform:'scale(1.12,.62)'}],[1150,{transform:'scale(1.1,.66)'},'ease-in-out'],[1600,{transform:'scale(1,1)'}]])});
    I.qa('.tg-brow').forEach(function(g){I.tl(g,T,[[200,{transform:'rotate(0deg) translateY(0px)'},E],[380,{transform:'rotate(7deg) translateY(4px)'}],[1150,{transform:'rotate(6deg) translateY(3.5px)'},'ease-in-out'],[1600,{transform:'rotate(0deg) translateY(0px)'}]])});
    I.qa('.tg-wh').forEach(function(w){I.tl(w,T,[[250,{transform:'rotate(0deg)'},E],[400,{transform:'rotate(-15deg)'},'ease-in-out'],[560,{transform:'rotate(-9deg)'},'ease-in-out'],[720,{transform:'rotate(-13deg)'},'ease-in-out'],[1150,{transform:'rotate(-10deg)'},'ease-in-out'],[1700,{transform:'rotate(0deg)'}]])});
    // claw strokes
    I.qa('.tg-sl').forEach(function(s){
      var t=430+(+s.dataset.i)*85;
      I.tl(s,T,[[0,{transform:'scale(0)',opacity:0}],[t,{transform:'scale(0)',opacity:1},'cubic-bezier(.1,.8,.1,1)'],[t+170,{transform:'scale(1)',opacity:1}],[1500,{transform:'scale(1)',opacity:1},'ease-in'],[2150,{transform:'scale(1.015)',opacity:0}]]);
    });
    I.tl(I.q('.tg-flash'),T,[[0,{opacity:0}],[400,{opacity:0}],[450,{opacity:.75}],[760,{opacity:0}]]);
    // ink from the mouth
    I.qa('.tg-dp').forEach(function(d,i){
      var t=380+i*9;
      I.tl(d,T,[[0,{transform:'translate(0px,0px) scale(.3)',opacity:0}],[t,{transform:'translate(0px,0px) scale(.3)',opacity:1},'cubic-bezier(.1,.7,.2,1)'],
        [t+520,{transform:'translate('+d.dataset.dx+'px,'+(-d.dataset.dy)+'px) scale(1)',opacity:1},'ease-in'],[t+1050,{transform:'translate('+d.dataset.dx*1.08+'px,'+(-d.dataset.dy+38)+'px) scale(.6)',opacity:0}]]);
    });
    // the gust through the bamboo
    I.qa('.tg-lf').forEach(function(l){
      var t=400+(+l.dataset.k)*40;
      I.tl(l,T,[[t,{transform:'rotate(0deg)'},E],[t+170,{transform:'rotate(21deg)'},'ease-in-out'],[t+420,{transform:'rotate(-9deg)'},'ease-in-out'],[t+700,{transform:'rotate(8deg)'},'ease-in-out'],[t+1000,{transform:'rotate(-4deg)'},'ease-in-out'],[t+1400,{transform:'rotate(0deg)'}]]);
    });
    I.qa('.tg-fly').forEach(function(l){
      var i=+l.dataset.i,t=430+i*70;
      I.tl(l,T,[[0,{transform:'translate(0px,0px) rotate(0deg)',opacity:0}],[t,{transform:'translate(0px,0px) rotate(0deg)',opacity:1},'cubic-bezier(.2,.5,.5,1)'],
        [t+1300,{transform:'translate('+(-230-i*22)+'px,'+(150+i*36)+'px) rotate('+(-300-i*70)+'deg)',opacity:1}],[t+1500,{transform:'translate('+(-250-i*22)+'px,'+(175+i*36)+'px) rotate('+(-340-i*70)+'deg)',opacity:0}]]);
    });
    // the page shakes with it
    I.tl(I.root,T,[[380,{transform:'translate(0,0)'}],[420,{transform:'translate(-1.6%,.9%)'}],[470,{transform:'translate(1.3%,-.8%)'}],[520,{transform:'translate(-1%,.5%)'}],[580,{transform:'translate(.7%,-.4%)'}],[650,{transform:'translate(-.4%,.2%)'}],[730,{transform:'translate(0,0)'}]]);
    I.tl(I.q('.tg-seal'),T,[[1500,{transform:'scale(1)'},E],[1620,{transform:'scale(1.16)'},'ease-in-out'],[1900,{transform:'scale(1)'}]]);
    I.tl(I.q('.tg-ring'),T,[[0,{opacity:0,transform:'scale(1)'}],[1540,{opacity:.9,transform:'scale(1)'},'ease-out'],[2200,{opacity:0,transform:'scale(2.3)'}]]);
  }
};
