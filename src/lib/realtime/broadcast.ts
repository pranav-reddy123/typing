import type { ConnectionState, RaceEvent, RacePlayer, RaceTransport } from './protocol';

/**
 * Cross-context realtime over `BroadcastChannel`.
 *
 * This is not a simulation of multiplayer. Two independent browser windows —
 * separate React trees, separate stores, separate engines — exchange the same
 * event union in the same order over a real message bus. The Supabase transport
 * swaps in behind the identical interface without touching the reducer or the UI.
 *
 * A `localStorage` mirror of the last snapshot lets a window that opens late
 * recover state even if no peer is currently listening.
 */
export class BroadcastTransport implements RaceTransport {
  connection: ConnectionState = 'closed';

  private channel: BroadcastChannel | null = null;
  private handlers = new Set<(event: RaceEvent) => void>();
  private connectionHandlers = new Set<(state: ConnectionState) => void>();
  private code = '';
  private me: RacePlayer | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  async join(code: string, me: RacePlayer): Promise<void> {
    this.code = code.toUpperCase();
    this.me = me;
    this.setConnection('connecting');

    this.channel = new BroadcastChannel(`baud:race:${this.code}`);
    this.channel.onmessage = (msg: MessageEvent<RaceEvent>) => {
      for (const handler of this.handlers) handler(msg.data);
    };
    this.channel.onmessageerror = () => this.setConnection('reconnecting');

    this.setConnection('open');
    this.send({ t: 'PLAYER_JOINED', player: me, at: Date.now() });
    this.send({ t: 'STATE_REQUEST', from: me.userId, at: Date.now() });

    // Announce liveness so peers can mark a silent player disconnected.
    this.heartbeat = setInterval(() => {
      if (!this.me) return;
      this.send({
        t: 'PLAYER_PROGRESS',
        userId: this.me.userId,
        progress: this.me.progress,
        wpm: this.me.wpm,
        accuracy: this.me.accuracy,
        at: Date.now(),
      });
    }, 5000);

    window.addEventListener('pagehide', this.handleUnload);
  }

  send(event: RaceEvent): void {
    if (!this.channel) return;
    try {
      this.channel.postMessage(event);
    } catch {
      // The channel closes when the document is discarded; treat as a drop and
      // let the reconnect path handle it rather than throwing into a keystroke.
      this.setConnection('reconnecting');
      return;
    }
    if (event.t === 'STATE_SNAPSHOT') {
      localStorage.setItem(`baud:race-snapshot:${this.code}`, JSON.stringify(event.state));
    }
    if (event.t === 'PLAYER_PROGRESS' && this.me && event.userId === this.me.userId) {
      this.me.progress = event.progress;
      this.me.wpm = event.wpm;
      this.me.accuracy = event.accuracy;
    }
  }

  /** Last snapshot written by any peer — the late-join fallback. */
  cachedSnapshot(): unknown | null {
    const raw = localStorage.getItem(`baud:race-snapshot:${this.code}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  subscribe(handler: (event: RaceEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onConnection(handler: (state: ConnectionState) => void): () => void {
    this.connectionHandlers.add(handler);
    handler(this.connection);
    return () => this.connectionHandlers.delete(handler);
  }

  async leave(): Promise<void> {
    if (this.me) this.send({ t: 'PLAYER_LEFT', userId: this.me.userId, at: Date.now() });
    window.removeEventListener('pagehide', this.handleUnload);
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.channel?.close();
    this.channel = null;
    this.setConnection('closed');
  }

  private handleUnload = (): void => {
    if (this.me && this.channel) {
      this.channel.postMessage({ t: 'PLAYER_LEFT', userId: this.me.userId, at: Date.now() });
    }
  };

  private setConnection(state: ConnectionState): void {
    this.connection = state;
    for (const handler of this.connectionHandlers) handler(state);
  }
}
