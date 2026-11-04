// Every call the app makes to the accounts project (crews, settings, devices, profile, history, push...), as
// research api.call events: which function, its arguments, how long it took, how it ended, and a short answer.
// Secrets never go in: anything that looks like a code, token, ticket or push key is replaced by its length.
import { accountTrace, type CallTrace } from '@tp/account';
import { R } from './capture';

const SECRET = /code|token|ticket|secret|p256dh|auth|endpoint|sig|password|recovery|refresh|jwt|apikey/i;
const SECRET_FN = /recovery|device_code|ticket|token|login|backup/i;
const CREW_CODE_FN = /^(crew_preview|ask_to_join|join_crew|note_invitation)$/;

/** A short one-way fingerprint (FNV-1a), so the same secret can be matched across events without keeping it. */
const fnv = (x: string): string => { let h = 0x811c9dc5; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };

/** A copy with secret-looking values replaced by "[r:<length>]" (deep; strings, numbers and lists kept). With fp
 * (crew invite codes only, which are shared openly in a crew) a fingerprint is added, so a join can be matched to
 * the crew preview that named the crew. Recovery and device codes never get one. */
export function redact(v: unknown, fp = false, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => redact(x, fp, depth + 1));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = SECRET.test(k) ? (typeof x === 'string' ? (fp ? `[r:${x.length}:${fnv(x)}]` : `[r:${x.length}]`) : `[r:${typeof x}]`) : redact(x, fp, depth + 1);
    return out;
  }
  if (typeof v === 'string' && v.length > 300) return `${v.slice(0, 300)}…`;
  return v;
}

const parse = (s: string | null): unknown => { if (s === null) return null; try { return JSON.parse(s); } catch { return s.slice(0, 200); } };

export function installApiTrace(): void {
  accountTrace.on = R.guard((t: CallTrace) => {
    const m = /^\/rest\/v1\/rpc\/(\w+)$/.exec(t.path);
    const tbl = /^\/rest\/v1\/(\w+)$/.exec(t.path);
    const auth = /^\/auth\/v1\/(\w+)/.exec(t.path);
    const fn = m ? m[1]! : tbl ? `table:${tbl[1]}` : auth ? `auth:${auth[1]}` : t.path.slice(0, 60);
    const secretFn = SECRET_FN.test(fn) || !!auth;
    R.emit('api.call', {
      fn, method: t.method, status: t.status, ms: Math.round(t.ms), ok: t.status >= 200 && t.status < 300, err: t.error,
      args: secretFn && fn.startsWith('auth:') ? null : redact(parse(t.body), CREW_CODE_FN.test(fn)),
      result: secretFn ? (t.result ? `[r:${t.result.length}]` : null) : redact(parse(t.result)),
    });
  });
}
