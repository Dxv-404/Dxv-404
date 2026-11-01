// Sound (synthesised with WebAudio, no files) and haptics.
const prefs = (() => { try { return JSON.parse(localStorage.getItem('tp-prefs') || '{}'); } catch { return {}; } })();
export const settings = {
  sound: prefs.sound ?? true,
  haptics: prefs.haptics ?? true,
  fourColor: prefs.fourColor ?? true,
  holdToPeek: prefs.holdToPeek ?? true,
};
export function saveSettings() { try { localStorage.setItem('tp-prefs', JSON.stringify(settings)); } catch {} }

let ctx = null;
let noiseBuf = null;
function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function unlockAudio() { ac(); }

function noise({ t = 0, dur = 0.06, freq = 3000, q = 1, gain = 0.4, type = 'bandpass' }) {
  const c = ac(); if (!c) return;
  const src = c.createBufferSource(); src.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  const at = c.currentTime + t;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(at, Math.random() * 0.2); src.stop(at + dur + 0.02);
}
function tone({ t = 0, dur = 0.12, freq = 880, gain = 0.15, type = 'sine', slide = 0 }) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(); o.type = type;
  const g = c.createGain();
  const at = c.currentTime + t;
  o.frequency.setValueAtTime(freq, at);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, at + dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g); g.connect(c.destination);
  o.start(at); o.stop(at + dur + 0.02);
}

export const sfx = {
  card() { if (!settings.sound) return; noise({ dur: 0.05, freq: 2400, q: 0.7, gain: 0.35 }); noise({ t: 0.012, dur: 0.035, freq: 5200, q: 2, gain: 0.15 }); },
  flip() { if (!settings.sound) return; noise({ dur: 0.07, freq: 1800, q: 0.6, gain: 0.3 }); },
  chip(n = 1) {
    if (!settings.sound) return;
    const k = Math.min(4, n);
    for (let i = 0; i < k; i++) {
      const t = i * 0.045 + Math.random() * 0.01;
      tone({ t, dur: 0.05, freq: 3600 + Math.random() * 900, gain: 0.07, type: 'triangle' });
      noise({ t, dur: 0.03, freq: 6000, q: 3, gain: 0.18 });
    }
  },
  check() { if (!settings.sound) return; noise({ dur: 0.05, freq: 500, q: 1.2, gain: 0.5, type: 'lowpass' }); noise({ t: 0.11, dur: 0.05, freq: 500, q: 1.2, gain: 0.45, type: 'lowpass' }); },
  fold() { if (!settings.sound) return; noise({ dur: 0.12, freq: 1400, q: 0.4, gain: 0.22 }); },
  turn() { if (!settings.sound) return; tone({ dur: 0.5, freq: 988, gain: 0.08 }); tone({ t: 0.09, dur: 0.6, freq: 1318, gain: 0.06 }); },
  win() { if (!settings.sound) return; [659, 784, 988, 1318].forEach((f, i) => tone({ t: i * 0.07, dur: 0.35, freq: f, gain: 0.06, type: 'triangle' })); },
  tick() { if (!settings.sound) return; tone({ dur: 0.04, freq: 1600, gain: 0.04, type: 'square' }); },
};

export function buzz(pattern) {
  if (!settings.haptics || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch {}
}

// Keep the screen on while playing.
let wakeLock = null;
export async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && document.body.dataset.playing) keepAwake(); });
