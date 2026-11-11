// Shared build helpers for the four animated posters.
// Each character module exports { prefix, name, player, markup, css, hooks, auto }.
//   markup : the inner HTML of the root element (stacked inline SVG layers)
//   css    : character CSS (every selector prefixed)
//   hooks  : JS source text defining `var H = { move(I), enter(I,level), run(I,on), reset(I) }`
//   auto   : ms after start at which the signature move plays on its own

// Base CSS every poster needs. P = prefix.
const baseCss = P => `
/* ---- ${P}: root + motion levels ---- */
.${P}-root{position:relative;width:100%;aspect-ratio:3/4;overflow:hidden;cursor:pointer;
  -webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;contain:layout paint;line-height:0}
.${P}-root svg{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
.${P}-sheen{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;pointer-events:none;
  background:linear-gradient(100deg,rgba(255,255,255,0) 38%,rgba(255,255,255,.34) 50%,rgba(255,255,255,0) 62%)}
/* paused while off screen / tab hidden */
.${P}-off *{animation-play-state:paused!important}
/* calm: no idle loops, entrance is one soft fade.  still: nothing moves. */
:is(.calm,.still) .${P}-root *, .${P}-root:is(.calm,.still) *{animation:none!important}
@keyframes ${P}-calm-in{from{opacity:0}to{opacity:1}}
.calm .${P}-root.${P}-go, .${P}-root.calm.${P}-go{animation:${P}-calm-in .5s ease-out both}
@media (prefers-reduced-motion: reduce){ .${P}-root, .${P}-root *{animation:none!important} }
`;

// Runtime: one IIFE per character. Handles levels, visibility pausing, replay.
const runtime = (P, hooks, auto) => `
(function(){
'use strict';
var P='${P}', AUTO=${auto};
var RM=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):null;
var MANUAL=/manual/.test(location.hash);           // test harness: no automatic start
${hooks}
var all=[];
function make(root){
  var I={root:root,anims:[],run:true,vis:true,started:false,timer:0};
  I.q=function(s){return root.querySelector(s)};
  I.qa=function(s){return Array.prototype.slice.call(root.querySelectorAll(s))};
  I.level=function(){
    if((RM&&RM.matches)||root.closest('.still'))return 'still';
    return root.closest('.calm')?'calm':'full';
  };
  // Web Animations wrapper: remembered so a replay can cancel it
  I.anim=function(el,kf,o){
    if(!el||!el.animate)return null;
    var a=el.animate(kf,o);I.anims.push(a);if(!I.run)a.pause();return a;
  };
  // timeline helper: fr=[[ms,{props},easing?],...] on a shared clock of T ms
  I.tl=function(el,T,fr){
    var kf=fr.map(function(f){var k={offset:Math.max(0,Math.min(1,f[0]/T))};for(var p in f[1])k[p]=f[1][p];if(f[2])k.easing=f[2];return k});
    if(kf[0].offset>0){var a={};for(var p in kf[0])a[p]=kf[0][p];a.offset=0;delete a.easing;kf.unshift(a)}
    var l=kf[kf.length-1];if(l.offset<1){var b={};for(var p2 in l)b[p2]=l[p2];b.offset=1;kf.push(b)}
    return I.anim(el,kf,{duration:T,fill:'none'});
  };
  I.stop=function(){
    I.anims.forEach(function(a){try{a.cancel()}catch(e){}});I.anims=[];
    clearTimeout(I.timer);if(H.reset)H.reset(I);
  };
  return I;
}
function play(I){
  var lv=I.level();I.stop();
  if(lv==='still')return;
  if(lv==='calm'){                                   // brief highlight instead of the move
    I.anim(I.q('.'+P+'-sheen'),[{transform:'translateX(-110%)',opacity:1},{transform:'translateX(110%)',opacity:1}],{duration:650,easing:'ease-in-out'});
    return;
  }
  H.move(I);
}
function enter(I){
  var lv=I.level();I.stop();I.started=true;
  I.root.classList.remove(P+'-go');void I.root.offsetWidth;
  if(lv!=='still')I.root.classList.add(P+'-go');
  var own=H.enter?H.enter(I,lv):false;               // a hook may run the move itself
  if(lv==='full'&&!MANUAL&&!own)I.timer=setTimeout(function(){play(I)},AUTO);
}
function setRun(I){
  var on=I.vis&&!document.hidden;
  if(on===I.run)return;I.run=on;
  I.root.classList.toggle(P+'-off',!on);
  I.anims.forEach(function(a){try{if(on){if(a.playState==='paused')a.play()}else if(a.playState==='running')a.pause()}catch(e){}});
  if(H.run)H.run(I,on);
  if(on&&!I.started&&!MANUAL)enter(I);
}
function init(root){
  if(root.__${P})return root.__${P};
  var I=root.__${P}=make(root);all.push(I);
  root.addEventListener('click',function(){play(I)});
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(es){I.vis=es[es.length-1].isIntersecting;setRun(I)},{threshold:.02}).observe(root);
  }
  if(H.init)H.init(I);
  if(document.hidden){I.run=false;root.classList.add(P+'-off');if(H.run)H.run(I,false)}
  else if(!MANUAL)enter(I);
  return I;
}
document.addEventListener('visibilitychange',function(){all.forEach(setRun)});
function each(fn,el){all.forEach(function(I){if(!el||I.root===el||el.contains(I.root))fn(I)})}
// public API
window.${P}Init=function(el){[].forEach.call((el||document).querySelectorAll('.'+P+'-root'),init)}; // call after injecting markup
window.${P}Play=function(el){each(play,el)};      // signature move (or calm highlight)
window.${P}Enter=function(el){each(enter,el)};    // replay entrance; call after changing the motion level
window.${P}Dbg=all;
window.${P}Init();
})();
`;

const fontLink = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Yuji+Syuku&display=swap" rel="stylesheet">';

function parts(c) {
  const P = c.prefix;
  return {
    html: `<div class="${P}-root" role="img" aria-label="${c.name}">\n${c.markup}\n<div class="${P}-sheen"></div>\n</div>`,
    css: baseCss(P) + c.css,
    js: runtime(P, c.hooks, c.auto || 1200),
  };
}

function page(c) {
  const p = parts(c);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${c.name} (${c.player}) - Train Poker</title>
${c.font ? fontLink : ''}
<style>
/* page chrome only (not part of the component) */
html,body{margin:0;height:100%;background:#15131a}
body{display:flex;align-items:center;justify-content:center}
.demo-wrap{width:min(92vw,calc(92vh*.75),450px)}
</style>

<!-- ============ ${c.name}: CSS (lift this block) ============ -->
<style id="${P_(c)}-css">${p.css}</style>
</head><body>
<div class="demo-wrap">
<!-- ============ ${c.name}: MARKUP (lift this block; put class "calm" or "still" on it or any ancestor) ============ -->
${p.html}
</div>

<!-- ============ ${c.name}: JS (lift this block; exposes window.${c.prefix}Play / ${c.prefix}Enter / ${c.prefix}Init) ============ -->
<script id="${P_(c)}-js">${p.js}</script>
</body></html>`;
}
const P_ = c => c.prefix;

module.exports = { parts, page, fontLink };
