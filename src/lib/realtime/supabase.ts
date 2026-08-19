import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../data/supabase';
import type { ConnectionState, RaceEvent, RacePlayer, RaceTransport } from './protocol';

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000];

/**
 * Supabase Realtime transport. `broadcast` carries the event union; `presence`
 * supplies connect/disconnect without a heartbeat of our own.
 */
export class SupabaseTransport implements RaceTransport {
  connection: ConnectionState = 'closed';

  private channel: RealtimeChannel | null = null;
  private handlers = new Set<(event: RaceEvent) => void>();
  private connectionHandlers = new Set<(state: ConnectionState) => void>();
  private code = '';
  private me: RacePlayer | null = null;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closing = false;

  async join(code: string, me: RacePlayer): Promise<void> {
    this.code = code.toUpperCase();
    this.me = me;
    this.closing = false;
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (!this.me) return;
    this.setConnection(this.attempt === 0 ? 'connecting' : 'reconnecting');

    const channel = supabase().channel(`race:${this.code}`, {
      config: { broadcast: { self: false }, presence: { key: this.me.userId } },
    });

    channel.on('broadcast', { event: 'race' }, ({ payload }) => {
      for (const handler of this.handlers) handler(payload as RaceEvent);
    });

    channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      for (const presence of leftPresences as Array<{ userId?: string }>) {
        if (presence.userId) {
          for (const handler of this.handlers) {
            handler({ t: 'PLAYER_LEFT', userId: presence.userId, at: Date.now() });
          }
        }
      }
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        this.attempt = 0;
        this.setConnection('open');
        await channel.track({ userId: this.me?.userId });
        this.send({ t: 'PLAYER_JOINED', player: this.me!, at: Date.now() });
        this.send({ t: 'STATE_REQUEST', from: this.me!.userId, at: Date.now() });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (!this.closing) this.scheduleRetry();
      }
    });

    this.channel = channel;
  }

  /** Exponential backoff with jitter, so a server blip does not stampede. */
  private scheduleRetry(): void {
    if (this.retryTimer !== null) return;
    this.setConnection('reconnecting');
    const base = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
    const delay = base + Math.random() * base * 0.3;
    this.attempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.channel?.unsubscribe();
      void this.connect();
    }, delay);
  }

  send(event: RaceEvent): void {
    void this.channel?.send({ type: 'broadcast', event: 'race', payload: event });
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
    this.closing = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    if (this.me) this.send({ t: 'PLAYER_LEFT', userId: this.me.userId, at: Date.now() });
    await this.channel?.unsubscribe();
    this.channel = null;
    this.setConnection('closed');
  }

  private setConnection(state: ConnectionState): void {
    this.connection = state;
    for (const handler of this.connectionHandlers) handler(state);
  }
}
