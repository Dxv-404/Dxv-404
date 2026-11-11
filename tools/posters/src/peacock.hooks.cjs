// Velvet Peacock: the tail folds shut, then snaps open feather by feather (centre outwards,
// each overshooting), and a shimmer runs across all fifteen eyes. Entrance = the same move from closed.
var H={
  move:function(I,first){
    var SHUT=first?0:230, OPEN=first?330:440, STEP=34, T=OPEN+2000;
    var closed=function(a){return 'rotate('+(-a*.94).toFixed(2)+'deg) scale(.8,.52)'};
    I.qa('.pk-f').forEach(function(f){
      var a=+f.dataset.a, r=+f.dataset.r, t0=OPEN+r*STEP, fr=[];
      if(!first)fr.push([Math.max(0,(7-r)*9),{transform:'rotate(0deg) scale(1,1)'},'cubic-bezier(.6,0,.9,.6)']);
      fr.push([first?0:SHUT,{transform:closed(a)}]);
      fr.push([t0,{transform:closed(a)},'cubic-bezier(.3,.6,.2,1)']);
      fr.push([t0+240,{transform:'rotate('+(a*.085).toFixed(2)+'deg) scale(1.03,1.06)'},'ease-in-out']);
      fr.push([t0+390,{transform:'rotate('+(-a*.03).toFixed(2)+'deg) scale(.995,.985)'},'ease-in-out']);
      fr.push([t0+540,{transform:'rotate(0deg) scale(1,1)'}]);
      I.tl(f,T,fr);
    });
    // body: tucks while folded, rises proud as the fan lands
    var B=OPEN+7*STEP;
    I.tl(I.q('.pk-body'),T,[[0,{transform:first?'translateY(4px) scale(1,.975)':'translateY(0px) scale(1,1)'},'ease-in-out'],
      [first?1:SHUT,{transform:'translateY(4px) scale(1,.975)'}],[OPEN,{transform:'translateY(4px) scale(1,.975)'},'cubic-bezier(.2,.8,.2,1)'],
      [B+150,{transform:'translateY(-3px) scale(1,1.03)'},'ease-in-out'],[B+520,{transform:'translateY(0px) scale(1,1)'}]]);
    I.tl(I.q('.pk-crest'),T,[[0,{transform:first?'rotate(-22deg) scale(.8)':'rotate(0deg) scale(1)'},'ease-in'],
      [first?1:SHUT,{transform:'rotate(-22deg) scale(.8)'}],[OPEN+60,{transform:'rotate(-22deg) scale(.8)'},'cubic-bezier(.2,.9,.2,1)'],
      [OPEN+260,{transform:'rotate(12deg) scale(1.15)'},'ease-in-out'],[OPEN+440,{transform:'rotate(-5deg) scale(.98)'},'ease-in-out'],
      [OPEN+620,{transform:'rotate(2deg) scale(1)'},'ease-in-out'],[OPEN+800,{transform:'rotate(0deg) scale(1)'}]]);
    // sunburst turns exactly one ray (15deg) with the snap, so it ends where it began
    I.tl(I.q('.pk-rays'),T,[[OPEN,{transform:'rotate(0deg)',opacity:.22},'cubic-bezier(.2,.8,.2,1)'],[B+200,{transform:'rotate(11deg)',opacity:.5},'ease-out'],[B+900,{transform:'rotate(15deg)',opacity:.22}]]);
    I.tl(I.q('.pk-arcs'),T,[[B,{transform:'scale(1)',opacity:.5},'cubic-bezier(.2,.8,.2,1)'],[B+180,{transform:'scale(1.035)',opacity:1},'ease-in-out'],[B+700,{transform:'scale(1)',opacity:.5}]]);
    // shimmer: light runs across every eye in sequence, left to right
    var SH=B+330;
    I.qa('.pk-eye').forEach(function(e){
      var t=SH+(+e.dataset.i)*46;
      I.tl(e,T,[[t,{transform:'scale(1)'},'cubic-bezier(.2,.8,.2,1)'],[t+110,{transform:'scale(1.24)'},'ease-in-out'],[t+420,{transform:'scale(1)'}]]);
      I.tl(e.querySelector('.pk-shine'),T,[[t-1,{opacity:0}],[t+90,{opacity:1}],[t+200,{opacity:.75}],[t+460,{opacity:0}]]);
    });
  },
  enter:function(I,lv){if(lv!=='full')return false;H.move(I,true);return true}
};
