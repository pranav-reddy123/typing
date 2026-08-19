import { hasRemote } from '../data';
import { BroadcastTransport } from './broadcast';
import type { RaceTransport } from './protocol';

/**
 * One place decides the transport. The reducer, the race store and every race
 * component are written against `RaceTransport` and never learn which is live.
 */
export async function createTransport(): Promise<RaceTransport> {
  if (hasRemote) {
    const { SupabaseTransport } = await import('./supabase');
    return new SupabaseTransport();
  }
  return new BroadcastTransport();
}

export * from './protocol';
