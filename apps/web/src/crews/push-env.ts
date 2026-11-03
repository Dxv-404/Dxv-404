// Whether to offer turning notifications on, and how (crews/push-prompt.ts). Pure, so it is unit tested.

export type PushPromptKind = 'enable' | 'ios-install';
export interface PushEnv {
  /** "Not now" was tapped before on this phone */
  dismissed: boolean;
  /** this browser can do web push (service worker, PushManager, Notification) */
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  /** this phone already has a push subscription */
  subscribed: boolean;
  ios: boolean;
  /** opened from the Home Screen icon (display-mode standalone) */
  standalone: boolean;
}

/** What to show: help adding the app to the Home Screen (iPhone, in Safari), the one-tap switch, or nothing. */
export function pushPromptKind(e: PushEnv): PushPromptKind | null {
  if (e.dismissed) return null;
  if (e.ios && !e.standalone) return 'ios-install';
  if (!e.supported || e.permission === 'denied') return null; // blocked: only the browser's settings can undo it
  if (e.permission === 'granted' && e.subscribed) return null; // already on
  return 'enable';
}

/** iPhone, iPod or iPad (an iPad asks for desktop pages and says Macintosh, but has a touch screen). */
export const isIos = (ua: string, touchPoints = 0): boolean => /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
