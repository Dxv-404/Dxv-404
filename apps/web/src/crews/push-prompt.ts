// "Turn on notifications?": a friendly card right after you join or make a crew, so you hear when a crew table
// starts. Shown only while notifications are off on this phone and you have not said "Not now" before. On an
// iPhone, web push works only for an app added to the Home Screen: there the card shows how to do that instead.
import type { Account } from '@tp/account';
import { enablePush, pushSupported } from '../more-screens';
import { cwToast } from './kit';
import { isIos, pushPromptKind, type PushEnv } from './push-env';
import { R } from '../research/capture';

export { isIos, pushPromptKind };

const KEY = 'tp-push-prompt-off';
export function promptDismissed(): boolean { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }
export function dismissPrompt(): void { try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked: it may ask again */ } }

async function envNow(): Promise<PushEnv> {
  const supported = pushSupported();
  let subscribed = false;
  if (supported) {
    try { subscribed = !!(await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()); } catch { /* none */ }
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    dismissed: promptDismissed(), supported, subscribed,
    permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    ios: isIos(navigator.userAgent, navigator.maxTouchPoints || 0),
    standalone: nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches),
  };
}

const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';

/**
 * Puts the card into `host` before `before` (or at the end) if it applies to this phone; `done` runs once it is
 * answered (turned on or Not now). `account` gives the signed-in account when "Turn on" is tapped.
 */
export async function mountPushPrompt(host: HTMLElement, before: Node | null, account: () => Promise<Account | null>, done: () => void = () => undefined): Promise<HTMLElement | null> {
  const kind = pushPromptKind(await envNow());
  if (!kind || !host.isConnected) return null;
  const card = document.createElement('section');
  card.className = 'pnl pushp';
  card.dataset.testid = 'push-prompt';
  card.setAttribute('aria-label', 'Notifications');
  const head = `<h2 class="ttl"><span class="acc pbell">${BELL}</span>${kind === 'enable' ? 'Know when your crew plays' : 'Get told when your crew plays'}</h2>`;
  card.innerHTML = kind === 'enable'
    ? `${head}<p class="mut">Turn on notifications and this phone buzzes when a crew table starts. One tap takes you to the table.</p>`
      + `<div class="two"><button class="bb g" data-p="later" data-testid="push-later">Not now</button><button class="bb p" data-p="on" data-testid="push-on">Turn on</button></div>`
    : `${head}<p class="mut">On iPhone, notifications work once Train Poker is on your Home Screen:</p>`
      + `<ol class="psteps" data-testid="push-ios-steps"><li>Tap <b>Share</b> at the bottom of Safari</li><li>Tap <b>Add to Home Screen</b></li><li>Open Train Poker from the new icon</li><li>Turn on notifications in <b>Settings</b></li></ol>`
      + `<button class="bb g" data-p="later" data-testid="push-later">Got it</button>`;
  const shownAt = performance.now();
  R.emit('push.prompt', { kind: 'shown', card: kind, permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission });
  const close = (): void => { card.remove(); done(); };
  card.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('[data-p]') as HTMLButtonElement | null;
    if (!b) return;
    if (b.dataset.p === 'later') { R.emit('push.prompt', { kind: 'dismissed', card: kind, ms: Math.round(performance.now() - shownAt) }); dismissPrompt(); close(); return; }
    b.disabled = true;
    try {
      const a = await account();
      const ok = !!(a && (await enablePush(a)));
      R.emit('push.prompt', { kind: ok ? 'accepted' : 'not-enabled', card: kind, ms: Math.round(performance.now() - shownAt), permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission });
      if (ok) { cwToast('Notifications on'); close(); return; }
    } catch (err) { R.emit('push.prompt', { kind: 'failed', card: kind, err: String((err as Error)?.message ?? err).slice(0, 120) }); cwToast((err as Error).message || 'Could not turn them on', 'x'); }
    b.disabled = false;
    // blocked in the browser: nothing one tap can do any more
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') close();
  });
  host.insertBefore(card, before && before.parentNode === host ? before : null);
  return card;
}
