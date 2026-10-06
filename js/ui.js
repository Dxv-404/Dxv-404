// Small DOM helpers shared by screens.
import { settings } from './fx.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv); }
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_NAME = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_TXT = { T: '10' };
const RANK_WORD = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: 'Ten' };

export function cardLabel(code) {
  if (!code) return 'Face-down card';
  const r = code[0];
  return `${RANK_WORD[r] || r} of ${SUIT_NAME[code[1]]}`;
}

// A card element. code like "As" or null for face-down.
export function cardEl(code, { size = 'md', down = !code } = {}) {
  const el = h('div', { class: `card card-${size}` + (down ? ' down' : ''), role: 'img', 'aria-label': down ? 'Face-down card' : cardLabel(code) });
  const inner = h('div', { class: 'card-inner' });
  const front = h('div', { class: 'face front' });
  const back = h('div', { class: 'face back' });
  inner.append(front, back);
  el.append(inner);
  if (code) setCardFace(el, code);
  return el;
}

export function setCardFace(el, code) {
  const front = el.querySelector('.front');
  if (!code) { front.innerHTML = ''; el.dataset.c = ''; return; }
  if (el.dataset.c === code) return;
  el.dataset.c = code;
  const r = code[0], s = code[1];
  el.dataset.suit = s;
  el.classList.toggle('four', settings.fourColor);
  front.innerHTML = '';
  const rank = RANK_TXT[r] || r;
  front.append(
    h('span', { class: 'corner' }, h('b', {}, rank), h('i', {}, SUIT[s])),
    h('span', { class: 'pip' }, SUIT[s]),
  );
  el.setAttribute('aria-label', cardLabel(code));
}

export function flipUp(el, code, animate = true) {
  setCardFace(el, code);
  if (!el.classList.contains('down')) return;
  if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.classList.remove('down'); return; }
  el.classList.add('flipping');
  requestAnimationFrame(() => el.classList.remove('down'));
  setTimeout(() => el.classList.remove('flipping'), 500);
}

export function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0][0].toUpperCase() + (parts[0][1] || '').toLowerCase();
}

// stable hue per name for avatars
export function hueFor(name) {
  let x = 0;
  for (const ch of String(name)) x = (x * 31 + ch.charCodeAt(0)) % 360;
  return x;
}

// chip stack visual for an amount relative to the big blind
export function chipStack(amount, bb) {
  const el = h('div', { class: 'chips' });
  const units = Math.max(1, Math.round(amount / Math.max(1, bb)));
  const n = Math.min(5, 1 + Math.floor(Math.log2(units + 1)));
  const colors = ['c1', 'c2', 'c3', 'c4'];
  for (let i = 0; i < n; i++) {
    const tier = Math.min(3, Math.floor(Math.log10(units + 1) + i / 2));
    el.append(h('i', { class: `chip ${colors[tier]}`, style: { '--i': i } }));
  }
  return el;
}

export function toast(msg, ms = 2600) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms);
}

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Animate an element from another element's (or rect's) position to where it sits now.
export function flyFrom(el, from, { dur = 420, rotate = 0, scale = 0.7, delay = 0, easing = 'cubic-bezier(.2,.75,.25,1)', opacityFrom = 1 } = {}) {
  if (reduceMotion()) return Promise.resolve();
  const a = from.getBoundingClientRect ? from.getBoundingClientRect() : from;
  const b = el.getBoundingClientRect();
  const dx = a.left + a.width / 2 - (b.left + b.width / 2);
  const dy = a.top + a.height / 2 - (b.top + b.height / 2);
  const anim = el.animate([
    { transform: `translate(${dx}px, ${dy}px) rotate(${rotate}deg) scale(${scale})`, opacity: opacityFrom },
    { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
  ], { duration: dur, easing, delay, fill: 'backwards' });
  return anim.finished.catch(() => {});
}

// Animate a temporary element from one place to another, then remove it.
export function flyTo(el, to, { dur = 420, easing = 'cubic-bezier(.45,.05,.3,1)', delay = 0, scaleTo = 1, fade = false } = {}) {
  const a = el.getBoundingClientRect();
  const b = to.getBoundingClientRect ? to.getBoundingClientRect() : to;
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  if (reduceMotion()) { el.remove(); return Promise.resolve(); }
  const anim = el.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx}px, ${dy}px) scale(${scaleTo})`, opacity: fade ? 0 : 1 },
  ], { duration: dur, easing, delay, fill: 'forwards' });
  return anim.finished.catch(() => {}).then(() => el.remove());
}

// Count a number up/down inside an element.
export function countTo(el, to, ms = 500) {
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  if (reduceMotion() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1 && el.dataset.v == to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
