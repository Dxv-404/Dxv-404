// Profile, recovery code, crews and crew invite links. No sign-up: the first visit makes an account for
// this phone. The account code (Supabase client) is loaded only when one of these screens opens, so the
// game itself still starts instantly and works offline.
import { h, toast } from './ui.js';

let mod = null;
let acct = null;
// ask the browser not to clear this site's storage when the phone runs low on space (the key lives there)
const keepStorage = () => { try { navigator.storage?.persist?.(); } catch { /* not offered here */ } };
async function account() {
  if (!mod) mod = await import('@tp/account');
  if (!acct) acct = new mod.Account();
  return acct;
}
const CODE_KEY = 'tp-recovery-code';
// test hook: lets the end-to-end tests remove the accounts they made
window.__tpAccount = account;
const COLORS = ['#c9a227', '#2f7d5b', '#336699', '#8a2f27', '#6b4c9a', '#c2662d'];
const inviteLink = (code) => `${location.origin}${location.pathname}#/c/${code}`;
const share = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
const copy = (text, what = 'Copied') => navigator.clipboard?.writeText(text).then(() => toast(what), () => toast('Could not copy. Select it and copy by hand.'));

export function accountScreens({ screen, openSheet, home }) {
  const head = (title, back = home) => h('header', { class: 'page-head' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: back }, '‹'), h('h1', {}, title));
  const busy = (el, text = 'Loading…') => el.replaceChildren(h('p', { class: 'hint', role: 'status' }, text));
  const failed = (el, err, retry) => el.replaceChildren(
    h('p', { class: 'hint', role: 'alert' }, navigator.onLine === false ? 'This needs the internet. Games still work offline.' : `Something went wrong: ${err?.message || err}`),
    h('button', { class: 'btn ghost', onclick: retry }, 'Try again'));

  // ---------------- profile ----------------
  function profile() {
    screen((el) => {
      el.className = 'screen profile';
      const body = h('div', {});
      el.append(head('Profile'), body);
      load();
      async function load() {
        busy(body);
        try {
          const a = await account();
          if (!(await a.hasLogin())) return firstTime(body);
          await a.start(localStorage.getItem('tp-name') || 'Player');
          render(body, a);
        } catch (e) { failed(body, e, load); }
      }
    });
  }

  function firstTime(body) {
    const name = h('input', { type: 'text', maxlength: 20, placeholder: 'Your name', 'aria-label': 'Your name', autocomplete: 'nickname', 'data-testid': 'name' });
    body.replaceChildren(
      h('section', { class: 'block' }, h('h2', {}, 'Make your profile'),
        h('p', { class: 'hint' }, 'No sign-up, no email. Your games, crews and league live in the cloud; this phone holds the key.'),
        h('label', { class: 'field' }, h('span', {}, 'Name'), name),
        h('button', { class: 'btn primary', 'data-testid': 'make-profile', onclick: async (e) => {
          const n = name.value.trim();
          if (!n) return toast('Pick a name first.');
          e.target.disabled = true;
          try { localStorage.setItem('tp-name', n); const a = await account(); await a.start(n); keepStorage(); profile(); }
          catch (err) { e.target.disabled = false; toast(err.message); }
        } }, 'Make my profile')),
      h('section', { class: 'block' }, h('h2', {}, 'Played before on another phone?'),
        h('button', { class: 'btn secondary', 'data-testid': 'recover-open', onclick: () => recoverSheet() }, 'Recover old account', h('small', {}, 'With your 12-digit recovery code'))));
  }

  async function render(body, a) {
    const p = a.profile;
    const nameIn = h('input', { type: 'text', maxlength: 20, value: p.name, 'aria-label': 'Your name', 'data-testid': 'name',
      onchange: async (e) => { const n = e.target.value.trim(); if (!n) return; try { await a.rename(n); localStorage.setItem('tp-name', n); toast('Name saved'); } catch (err) { toast(err.message); } } });
    const codeBox = h('div', { class: 'block-inner' });
    const crewsBox = h('div', {});
    const phonesBox = h('div', {});
    body.replaceChildren(
      h('section', { class: 'block' }, h('label', { class: 'field' }, h('span', {}, 'Name'), nameIn)),
      h('section', { class: 'block' }, h('h2', {}, 'Recovery code'), codeBox),
      h('section', { class: 'block' }, h('h2', {}, 'Crews'), crewsBox,
        h('button', { class: 'btn secondary', 'data-testid': 'new-crew', onclick: () => newCrew() }, 'New crew')),
      h('section', { class: 'block' }, h('h2', {}, 'Phones on this account'), phonesBox),
      h('section', { class: 'block' }, h('h2', {}, 'This account'),
        h('button', { class: 'btn ghost', 'data-testid': 'recover-open', onclick: () => recoverSheet() }, 'Recover old account', h('small', {}, 'Make this phone an account you had before')),
        h('button', { class: 'btn ghost', onclick: async () => {
          if (!confirm('Log out every other phone on this account?')) return;
          try { const n = await a.logoutOtherPhones(); toast(n ? `${n} other phone${n === 1 ? '' : 's'} logged out` : 'No other phones were logged in'); } catch (err) { toast(err.message); }
        } }, 'Log out my other phones'),
        h('button', { class: 'btn danger', onclick: async () => {
          if (!confirm('Delete your account? Your name and picture go; your past results stay in your crews as "Former player".')) return;
          try { await a.deleteAccount(); localStorage.removeItem(CODE_KEY); toast('Account deleted'); home(); } catch (err) { toast(err.message); }
        } }, 'Delete my account')));
    drawCode(codeBox, a);
    drawCrews(crewsBox, a);
    drawPhones(phonesBox, a);
  }

  async function drawPhones(box, a) {
    busy(box);
    const when = (t) => { const d = (Date.now() - new Date(t).getTime()) / 864e5; return d < 1 ? 'today' : d < 2 ? 'yesterday' : `${Math.floor(d)} days ago`; };
    try {
      const list = await a.phones();
      box.replaceChildren(
        h('ul', { class: 'member-list', 'data-testid': 'phones' }, ...list.map((p, i) => h('li', {},
          h('div', { class: 'who' }, h('strong', {}, p.this_phone ? 'This phone' : `Phone ${i + 1}`), h('small', {}, `added ${when(p.added)}, last used ${when(p.last_seen)}`)),
          !p.this_phone && h('button', { class: 'btn small ghost', onclick: async () => {
            if (!confirm('Log this phone out? It will no longer be your account.')) return;
            try { await a.logoutPhone(p.phone); toast('Logged out'); drawPhones(box, a); } catch (err) { toast(err.message); }
          } }, 'Log out')))),
        list.length > 1 && h('p', { class: 'hint small' }, 'Don’t recognise a phone? Log it out, then make a new recovery code.'));
    } catch (err) { failed(box, err, () => drawPhones(box, a)); }
  }

  async function drawCode(box, a) {
    const local = localStorage.getItem(CODE_KEY);
    const show = (code) => box.replaceChildren(
      h('p', { class: 'recovery-code', 'data-testid': 'code', 'aria-label': `Recovery code ${code.split('').join(' ')}` }, mod.formatCode(code)),
      h('p', { class: 'hint' }, 'Keep it somewhere safe, like a message to yourself. Anyone with this code can become you.'),
      h('div', { class: 'two' },
        h('button', { class: 'btn ghost small', onclick: () => copy(code, 'Code copied') }, 'Copy'),
        h('a', { class: 'btn ghost small', href: share(`My Train Poker recovery code: ${mod.formatCode(code)}`), target: '_blank', rel: 'noopener' }, 'Send to myself on WhatsApp')),
      h('button', { class: 'btn ghost small', onclick: () => make(true) }, 'Make a new code'));
    const make = async (replace) => {
      if (replace && !confirm('Make a new code? The old code stops working.')) return;
      try { const code = await a.newRecoveryCode(); localStorage.setItem(CODE_KEY, code); show(code); } catch (err) { toast(err.message); }
    };
    if (local) return show(local);
    busy(box);
    let has = false;
    try { has = await a.hasRecoveryCode(); } catch { /* shown below as no code */ }
    box.replaceChildren(
      h('p', { class: 'hint' }, has ? 'This account has a code, made on another phone. Lost it? Make a new one; the old one stops working.' : 'If this phone is lost or wiped, the code brings everything back.'),
      h('button', { class: 'btn primary', 'data-testid': 'make-code', onclick: () => make(has) }, has ? 'Make a new code' : 'Show my recovery code'));
  }

  async function drawCrews(box, a) {
    busy(box);
    try {
      const crews = await a.crews();
      box.replaceChildren(crews.length
        ? h('ul', { class: 'crew-list', 'data-testid': 'crews' }, ...crews.map((c) => h('li', {},
          h('button', { class: 'crew-row', onclick: () => crewScreen(c.id) },
            h('span', { class: 'crew-dot', style: { background: c.color }, 'aria-hidden': 'true' }),
            h('strong', {}, c.name), h('small', {}, c.status === 'pending' ? 'waiting for approval' : c.role)))))
        : h('p', { class: 'hint' }, 'No crews yet. A crew keeps a league and history for a group of friends.'));
    } catch (err) { failed(box, err, () => drawCrews(box, a)); }
  }

  function recoverSheet() {
    const input = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 16, placeholder: '0000 0000 0000', 'aria-label': 'Recovery code', 'data-testid': 'recover-code' });
    const msg = h('p', { class: 'hint', role: 'alert', 'data-testid': 'recover-msg' });
    const go = h('button', { class: 'btn primary', 'data-testid': 'recover-go', onclick: async () => {
      const code = input.value.replace(/\D/g, '');
      if (code.length !== 12) { msg.textContent = 'The code has 12 digits.'; return; }
      go.disabled = true; msg.textContent = 'Checking…';
      try {
        const a = await account();
        let merge = true;
        if (await a.hasLogin()) {
          await a.start(localStorage.getItem('tp-name') || 'Player');
          const mine = await a.crews();
          if (mine.length) merge = confirm(`Add this phone's ${mine.length} crew${mine.length === 1 ? '' : 's'} to your old account?\n\nOK adds them. Cancel leaves them out.`);
        }
        const r = await a.recover(code, merge);
        if (!r.ok) { go.disabled = false; msg.textContent = r.reason === 'wrong' ? "That code doesn't match an account." : r.message; return; }
        localStorage.setItem('tp-name', r.profile.name);
        localStorage.setItem(CODE_KEY, code);
        keepStorage();
        s.close();
        toast(`Welcome back, ${r.profile.name}`);
        profile();
      } catch (err) { go.disabled = false; msg.textContent = err.message; }
    } }, 'Recover');
    const s = openSheet(h('div', { class: 'menu' }, h('h2', {}, 'Recover old account'),
      h('p', { class: 'hint' }, 'Type the 12-digit code from your old phone. This phone becomes that account: name, crews, history and trophies.'),
      input, go, msg,
      h('p', { class: 'hint small' }, 'Lost the code too? Open your crew’s invite link and tap “I’m already in this crew”.')), { label: 'Recover old account' });
    setTimeout(() => input.focus(), 300);
  }

  // ---------------- crews ----------------
  function newCrew() {
    let color = COLORS[0];
    const name = h('input', { type: 'text', maxlength: 40, placeholder: 'Crew name', 'aria-label': 'Crew name', 'data-testid': 'crew-name' });
    const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Colour' });
    const draw = () => swatches.replaceChildren(...COLORS.map((c) => h('button', { role: 'radio', 'aria-checked': c === color ? 'true' : 'false', 'aria-label': `Colour ${c}`, class: 'swatch' + (c === color ? ' on' : ''), style: { background: c }, onclick: () => { color = c; draw(); } })));
    draw();
    const s = openSheet(h('div', { class: 'menu' }, h('h2', {}, 'New crew'), name, swatches,
      h('button', { class: 'btn primary', 'data-testid': 'crew-create', onclick: async (e) => {
        if (!name.value.trim()) return toast('Give the crew a name.');
        e.target.disabled = true;
        try { const a = await account(); const c = await a.createCrew(name.value.trim(), color); s.close(); crewScreen(c.id); }
        catch (err) { e.target.disabled = false; toast(err.message); }
      } }, 'Make the crew')), { label: 'New crew' });
  }

  function crewScreen(id) {
    screen((el) => {
      el.className = 'screen crew';
      const body = h('div', {});
      el.append(head('Crew', profile), body);
      load();
      async function load() {
        busy(body);
        try {
          const a = await account();
          const crew = (await a.crews()).find((c) => c.id === id);
          if (!crew) return body.replaceChildren(h('p', { class: 'hint' }, 'You are not in this crew any more.'));
          const admin = crew.role !== 'member' && crew.status === 'active';
          const members = crew.status === 'active' ? await a.members(id) : [];
          const rescues = admin ? await a.pendingRescues(id) : [];
          const me = a.profile.id;
          const names = new Map(members.map((m) => [m.account_id, m.name]));
          const logBox = h('section', { class: 'block', 'data-testid': 'crew-log' }, h('h3', {}, 'Crew log'));
          if (crew.status === 'active') a.crewLog(id).then((log) => {
            const say = (e) => {
              const who = (k) => names.get(e.detail[k]) || 'a player';
              switch (e.what) {
                case 'rescue_requested': return `A new phone asked to be ${who('for')}`;
                case 'rescue_approved': return `${e.actor_name || 'An admin'} said yes: a new phone is now ${who('for')}`;
                case 'rescue_denied': return `${e.actor_name || 'An admin'} said no to a new phone asking to be ${who('for')}`;
                case 'member_removed': return `${e.actor_name || 'An admin'} removed ${who('account')}`;
                case 'member_approved': return `${e.actor_name || 'An admin'} let ${who('account')} in`;
                case 'member_refused': return `${e.actor_name || 'An admin'} said no to someone asking to join`;
                case 'role_changed': return `${who('account')} is now ${e.detail.role}`;
                case 'ownership_passed': return `${who('to')} now owns the crew`;
                default: return e.what;
              }
            };
            logBox.append(log.length
              ? h('ul', { class: 'log-list' }, ...log.map((e) => h('li', {}, h('span', {}, say(e)), h('small', {}, new Date(e.at).toLocaleDateString()))))
              : h('p', { class: 'hint small' }, 'Nothing yet. Rescues, removals and role changes show here.'));
          }).catch(() => logBox.append(h('p', { class: 'hint small' }, 'Could not load the log.')));
          const memberRow = (m) => h('li', {},
            h('div', { class: 'who' }, h('strong', {}, m.name), h('small', {}, m.status === 'pending' ? 'wants to join' : m.role)),
            admin && m.status === 'pending' && h('div', { class: 'row-actions' },
              h('button', { class: 'btn small primary', onclick: () => act(() => a.approveMember(id, m.account_id, true)) }, 'Let in'),
              h('button', { class: 'btn small ghost', onclick: () => act(() => a.approveMember(id, m.account_id, false)) }, 'No')),
            admin && m.status === 'active' && m.account_id !== me && m.role !== 'owner' && h('button', { class: 'btn small ghost', 'aria-label': `Options for ${m.name}`, onclick: () => memberSheet(a, crew, m, load) }, '•••'));
          const act = async (fn) => { try { await fn(); load(); } catch (err) { toast(err.message); } };
          body.replaceChildren(
            h('div', { class: 'crew-title' }, h('span', { class: 'crew-dot big', style: { background: crew.color }, 'aria-hidden': 'true' }), h('h2', { 'data-testid': 'crew-title' }, crew.name)),
            crew.status === 'pending' && h('p', { class: 'hint', role: 'status' }, 'An admin will let you in soon.'),
            rescues.length > 0 && h('section', { class: 'block', 'data-testid': 'rescues' }, ...rescues.map((r) => r.target_account === me
              // someone says they are you: only you can tell, so you can refuse; approving needs another admin
              ? h('div', { class: 'rescue' },
                h('p', {}, 'A new phone says it is you.'),
                h('p', { class: 'hint small' }, 'If you did not ask for this, refuse it. Another admin would have to approve it.'),
                h('button', { class: 'btn small primary', 'data-testid': 'rescue-not-me', onclick: () => act(() => a.decideRescue(r.id, false)) }, 'That’s not me'))
              : h('div', { class: 'rescue' },
                h('p', {}, `Is this ${r.target_name}'s new phone?`),
                h('p', { class: 'hint small' }, 'Say yes only if they told you so. The new phone becomes their account, with everything on it.'),
                h('div', { class: 'two' },
                  h('button', { class: 'btn small primary', 'data-testid': 'rescue-yes', onclick: () => act(() => a.decideRescue(r.id, true)) }, `Yes, it's ${r.target_name}`),
                  h('button', { class: 'btn small ghost', onclick: () => act(() => a.decideRescue(r.id, false)) }, 'No'))))),
            members.length > 0 && h('section', { class: 'block' }, h('h3', {}, `${members.filter((m) => m.status === 'active').length} members`),
              h('ul', { class: 'member-list', 'data-testid': 'members' }, ...members.map(memberRow))),
            admin && h('section', { class: 'block' }, h('h3', {}, 'Invite friends'),
              h('button', { class: 'btn secondary', 'data-testid': 'invite', onclick: async (e) => {
                e.target.disabled = true;
                try {
                  const code = await a.createInvite(id);
                  const link = inviteLink(code);
                  e.target.replaceWith(h('div', { class: 'invite' },
                    h('p', { class: 'invite-link', 'data-testid': 'invite-link' }, link),
                    h('div', { class: 'two' },
                      h('button', { class: 'btn ghost small', onclick: () => copy(link, 'Link copied') }, 'Copy link'),
                      h('a', { class: 'btn ghost small', href: share(`Join our poker crew "${crew.name}": ${link}`), target: '_blank', rel: 'noopener' }, 'Send on WhatsApp')),
                    h('p', { class: 'hint small' }, 'The link works for 7 days.')));
                } catch (err) { e.target.disabled = false; toast(err.message); }
              } }, 'Make an invite link'),
              h('label', { class: 'switch-row' }, h('span', {}, 'Approve new members', h('small', {}, 'An admin lets each new member in')),
                h('input', { type: 'checkbox', role: 'switch', checked: crew.require_approval ? true : null, onchange: (e) => act(() => a.updateCrew(id, { requireApproval: e.target.checked })) }))),
            crew.status === 'active' && logBox,
            h('section', { class: 'block' }, h('button', { class: 'btn danger', onclick: () => {
              if (!confirm(crew.role === 'owner' ? 'Leave the crew? The longest-serving admin becomes the owner.' : 'Leave the crew?')) return;
              act(async () => { await a.leaveCrew(id); profile(); });
            } }, 'Leave crew')));
        } catch (err) { failed(body, err, load); }
      }
    });
  }

  function memberSheet(a, crew, m, reload) {
    const run = async (fn, done) => { try { await fn(); s.close(); toast(done); reload(); } catch (err) { toast(err.message); } };
    const s = openSheet(h('div', { class: 'menu' }, h('h2', {}, m.name),
      crew.role === 'owner' && (m.role === 'admin'
        ? h('button', { class: 'btn ghost', onclick: () => run(() => a.setRole(crew.id, m.account_id, 'member'), 'No longer an admin') }, 'Remove as admin')
        : h('button', { class: 'btn ghost', onclick: () => run(() => a.setRole(crew.id, m.account_id, 'admin'), 'Made an admin') }, 'Make admin')),
      crew.role === 'owner' && h('button', { class: 'btn ghost', onclick: () => { if (confirm(`Make ${m.name} the owner? You become an admin.`)) run(() => a.setRole(crew.id, m.account_id, 'owner'), 'Ownership handed over'); } }, 'Make owner'),
      h('button', { class: 'btn danger', onclick: () => { if (confirm(`Remove ${m.name} from the crew?`)) run(() => a.removeMember(crew.id, m.account_id), 'Removed'); } }, 'Remove from crew')), { label: m.name });
  }

  // ---------------- invite links ----------------
  function invite(code) {
    screen((el) => {
      el.className = 'screen invite-page';
      const body = h('div', {});
      el.append(head('Crew invite'), body);
      load();
      async function load() {
        busy(body);
        try {
          const a = await account();
          const info = await a.inviteInfo(code);
          if (!info) return body.replaceChildren(h('p', { class: 'hint', role: 'alert' }, 'This invite has expired. Ask for a new link.'));
          const signedIn = await a.hasLogin();
          const nameIn = !signedIn && h('label', { class: 'field' }, h('span', {}, 'Your name'), h('input', { type: 'text', maxlength: 20, 'aria-label': 'Your name', 'data-testid': 'name', value: localStorage.getItem('tp-name') || '' }));
          body.replaceChildren(
            h('div', { class: 'crew-title' }, h('span', { class: 'crew-dot big', style: { background: info.color }, 'aria-hidden': 'true' }), h('h2', { 'data-testid': 'crew-title' }, info.name)),
            h('p', { class: 'hint' }, `${info.members.length} member${info.members.length === 1 ? '' : 's'}: ${info.members.map((m) => m.name).join(', ')}`),
            nameIn,
            h('button', { class: 'btn primary', 'data-testid': 'join', onclick: async (e) => {
              const n = nameIn ? nameIn.querySelector('input').value.trim() : localStorage.getItem('tp-name') || 'Player';
              if (!n) return toast('Pick a name first.');
              e.target.disabled = true;
              try {
                localStorage.setItem('tp-name', n);
                await a.start(n);
                const st = await a.joinCrew(code);
                history.replaceState(null, '', location.pathname);
                toast(st === 'pending' ? 'Asked to join. An admin will let you in.' : `You're in ${info.name}`);
                crewScreen(info.crew);
              } catch (err) { e.target.disabled = false; toast(err.message); }
            } }, 'Join the crew'),
            h('button', { class: 'btn ghost', 'data-testid': 'already-in', onclick: () => rescuePick(a, code, info) }, 'I’m already in this crew', h('small', {}, 'New phone, lost code: a crew admin brings your account back')));
        } catch (err) { failed(body, err, load); }
      }
    });
  }

  function rescuePick(a, code, info) {
    const s = openSheet(h('div', { class: 'menu' }, h('h2', {}, 'Which one is you?'),
      h('ul', { class: 'member-list' }, ...info.members.map((m) => h('li', {}, h('button', { class: 'btn ghost', 'data-testid': `rescue-${m.name}`, onclick: async () => {
        try { const req = await a.requestRescue(code, m.id); s.close(); waitForRescue(a, m, req); } catch (err) { toast(err.message); }
      } }, m.name))))), { label: 'Pick your name' });
  }

  function waitForRescue(a, target, requestId) {
    screen((el) => {
      el.className = 'screen';
      const status = h('p', { class: 'hint', role: 'status', 'data-testid': 'rescue-status' }, `Asked the crew's admins: "Is this ${target.name}'s new phone?" Leave this open; it moves on by itself.`);
      el.append(head('Waiting for the crew'), status);
      let stop = false;
      const poll = async () => {
        if (stop) return;
        try {
          const st = await a.rescueStatus(requestId);
          if (st === 'denied') {
            status.textContent = `The crew said this isn't ${target.name}'s phone. If it is, ask them in your group, then try again from the link.`;
            return;
          }
          const p = await a.refresh();
          if (p && p.id === target.id) {
            localStorage.setItem('tp-name', p.name);
            history.replaceState(null, '', location.pathname);
            toast(`Welcome back, ${p.name}`);
            return profile();
          }
        } catch { /* keep waiting */ }
        setTimeout(poll, 4000);
      };
      poll();
      return () => { stop = true; };
    });
  }

  /** Called on start: open the screen a link points at (#/c/CODE = crew invite). Returns true if it did. */
  function route() {
    const m = /^#\/c\/([A-Za-z0-9]{6,16})$/.exec(location.hash);
    if (m) { invite(m[1].toUpperCase()); return true; }
    return false;
  }

  return { profile, invite, route };
}
