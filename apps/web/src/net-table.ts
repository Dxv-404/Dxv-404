// A live table over the network (an online table server, or the offline host phone), shaped for the
// table screen: the screen gets the engine's view of this seat plus the few things a screen needs that the
// server keeps (am I the host, how long the player to act has left, final standings), and calls simple
// methods for the buttons. All the hard parts (resending taps, numbering, reconnecting) are TableClient's.
import type { Action, GameEvent, View } from '@tp/engine';
import type { TableClient, ClientOptions, Status } from '@tp/table';

export type ScreenView = View & {
  isHost: boolean; hostId: string | null;
  /** ms the player to act has left, and their whole allowance (0 = no timer). */
  turnLeft: number; turnTotal: number;
  /** Non-zero while the next hand will be dealt by itself. */
  nextIn: number;
  standings?: { id: string; name: string; stack: number; buyins: number; net: number; won: number; biggest: number }[];
};
type Callbacks = Pick<ClientOptions, 'onView' | 'onStatus' | 'onError' | 'onReact' | 'onNotice' | 'onAck' | 'onSeatElsewhere' | 'onSeatMoved'>;
/** Which of the player's devices has the seat (see onSeat). */
export interface SeatDevice { kind: 'phone' | 'tablet' | 'laptop'; name: string | null }

export class NetTable {
  readonly client: TableClient;
  readonly me: string;
  view: ScreenView | null = null;
  status: Status = 'connecting';
  private views = new Set<(events: GameEvent[], v: ScreenView) => void>();
  private statuses = new Set<(s: Status) => void>();
  private errors = new Set<(code: string, message: string) => void>();
  private notices = new Set<(text: string) => void>();
  private reacts = new Set<(from: string, reaction: string) => void>();
  private seats = new Set<(what: 'elsewhere' | 'moved', device: SeatDevice) => void>();

  constructor(o: { me: string; makeClient(cb: Callbacks): TableClient }) {
    this.me = o.me;
    this.client = o.makeClient({
      onView: (v, events) => {
        this.view = this.shape(v);
        for (const fn of this.views) fn(events, this.view);
      },
      onStatus: (s) => { this.status = s; for (const fn of this.statuses) fn(s); },
      onError: (code, m) => { for (const fn of this.errors) fn(code, m); },
      onNotice: (t) => { for (const fn of this.notices) fn(t); },
      onReact: (f, r) => { for (const fn of this.reacts) fn(f, r); },
      onAck: (_id, ok, error) => { if (!ok && error) for (const fn of this.errors) fn('refused', error); },
      onSeatElsewhere: (d) => { for (const fn of this.seats) fn('elsewhere', d); },
      onSeatMoved: (d) => { for (const fn of this.seats) fn('moved', d); },
    });
    // the table pushes "Your turn" only while the app is not on screen
    if (typeof document !== 'undefined') {
      this.onVis = () => this.client.background(document.visibilityState === 'hidden');
      document.addEventListener('visibilitychange', this.onVis);
      this.onVis();
    }
  }
  private onVis: (() => void) | null = null;

  private shape(v: View): ScreenView {
    const hostId = this.client.host;
    const h = v.hand;
    const turnTotal = h?.toAct ? (v.cfg.turnTime || 0) * 1000 : 0;
    const left = h?.deadline ? Math.max(0, h.deadline - this.client.serverNow()) : 0;
    const out: ScreenView = {
      // (a device that only watches the host's seat, from another of the host's devices, does not host)
      ...v, isHost: hostId === this.me && this.client.you === this.me, hostId,
      turnTotal: turnTotal ? Math.max(turnTotal, left) : 0, turnLeft: left,
      nextIn: v.phase === 'between' && !v.paused && v.handNo > 0 ? 1 : 0,
    };
    if (v.phase === 'ended') {
      out.standings = v.players.map((p) => ({ id: p.id, name: p.name, stack: p.stack, buyins: p.buyins, net: p.stack - p.buyins, won: 0, biggest: 0 }))
        .sort((a, b) => b.net - a.net);
    }
    return out;
  }

  subscribe(fn: (events: GameEvent[], v: ScreenView) => void): () => void { this.views.add(fn); return () => this.views.delete(fn); }
  onStatus(fn: (s: Status) => void): () => void { this.statuses.add(fn); return () => this.statuses.delete(fn); }
  onError(fn: (code: string, message: string) => void): () => void { this.errors.add(fn); return () => this.errors.delete(fn); }
  onNotice(fn: (text: string) => void): () => void { this.notices.add(fn); return () => this.notices.delete(fn); }
  onReact(fn: (from: string, reaction: string) => void): () => void { this.reacts.add(fn); return () => this.reacts.delete(fn); }
  /** One seat per player: 'elsewhere' = this device watches because another of the player's devices has the seat; 'moved' = the seat just moved away. */
  onSeat(fn: (what: 'elsewhere' | 'moved', device: SeatDevice) => void): () => void { this.seats.add(fn); return () => this.seats.delete(fn); }
  /** Is this device playing the seat (not watching)? */
  get seated(): boolean { return this.client.you === this.me; }
  /** "Move seat here". */
  moveSeat(): void { this.client.moveSeat(); }

  // ---------------- buttons ----------------
  get isHost(): boolean { return this.client.host === this.me && this.client.you === this.me; }
  act(a: Action): void { this.client.act(a); }
  show(): void { if (this.view) this.client.send({ t: 'show', handNo: this.view.handNo }); }
  rebuy(): void { this.client.send({ t: 'rebuy' }); }
  sitOut(out: boolean): void { this.client.send({ t: 'sit', out }); }
  vote(yes: boolean): void { if (this.view) this.client.send({ t: 'vote', handNo: this.view.handNo, yes }); }
  straddle(on: boolean): void { this.client.send({ t: 'straddle', on }); }
  dealNow(): void { this.client.send({ t: 'host', cmd: this.view?.paused ? 'resume' : 'deal' }); }
  host(cmd: 'pause' | 'resume' | 'undo' | 'end' | 'deal' | 'move' | 'remove' | 'setBlinds', extra: { pid?: string; dir?: number; sb?: number; bb?: number; ante?: number } = {}): void {
    this.client.send({ t: 'host', cmd, ...extra });
  }
  react(reaction: string): void { this.client.react(reaction as never); }
  close(): void { if (this.onVis) document.removeEventListener('visibilitychange', this.onVis); this.client.close(); }
}
