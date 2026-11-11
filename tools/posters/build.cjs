// node tools/posters/build.cjs
// Writes the animated character posters the profile card shows (apps/web/public/tp/posters/<avatar id>.html).
// Each is one self-contained page (inline SVG, CSS and a little script, all drawn in code) shown in a frame on
// the card, so its ids and styles cannot clash with the app's. The motion level comes in the address:
// poster.html#calm or #still (nothing: full). A tap plays the character's move and tells the app (postMessage).
const fs = require('fs'); const path = require('path');
const { parts } = require('./src/common.cjs');
const OUT = path.join(__dirname, '../../apps/web/public/tp/posters');
const IDS = { sensei: 'ink-sensei', gambler: 'classic-gambler', knight: 'pixel-knight', peacock: 'velvet-peacock-plume', tiger: 'ink-ink-tiger', roller: 'velvet-high-roller' };
fs.mkdirSync(OUT, { recursive: true });
for (const [file, id] of Object.entries(IDS)) {
  const c = require('./src/' + file + '.cjs');
  const p = parts(c);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${c.name}</title>
<script>(function(){var h=location.hash.slice(1);if(h==='calm'||h==='still')document.documentElement.classList.add(h)})()</script>
<style>
@font-face{font-family:'Yuji Syuku';src:url(/tp/fonts/yujisyuku-regular.woff2) format('woff2');font-weight:400;font-style:normal;font-display:block}
html,body{margin:0;height:100%;background:transparent;overflow:hidden}
</style>
<style id="${c.prefix}-css">${p.css}</style>
</head><body>
${p.html}
<script id="${c.prefix}-js">${p.js}</script>
<script>
// a tap plays the move (the poster does that itself); the app is told, for its records
document.addEventListener('click',function(){try{parent.postMessage({t:'tp-poster',id:${JSON.stringify(id)},what:'play'},location.origin)}catch(e){}});
// the app can ask for the move too (the card's own tap target, a key press)
addEventListener('message',function(e){if(e.origin===location.origin&&e.data&&e.data.t==='tp-poster-play'&&window.${c.prefix}Play)window.${c.prefix}Play()});
</script>
</body></html>
`;
  fs.writeFileSync(path.join(OUT, id + '.html'), html);
  console.log(id + '.html', (html.length / 1024).toFixed(0) + ' KB');
}
