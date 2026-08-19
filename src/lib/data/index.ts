import { LocalProvider } from './local';
import type { DataProvider } from './types';

/**
 * Provider selection happens exactly once, here. Nothing else in the app knows
 * or cares which implementation is active.
 *
 * With `VITE_SUPABASE_URL` set, the Supabase provider is loaded and every read
 * and write goes to Postgres under row-level security. Without it, the app runs
 * fully against IndexedDB — the same interface, the same records, no network.
 */
export const hasRemote = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

let instance: DataProvider | null = null;

export function data(): DataProvider {
  if (!instance) instance = new LocalProvider();
  return instance;
}

export function setProvider(provider: DataProvider): void {
  instance = provider;
}

/**
 * Called once at boot. Swaps in the remote provider when credentials exist,
 * keeping the Supabase client out of the initial bundle otherwise.
 */
export async function initProvider(): Promise<DataProvider> {
  if (hasRemote) {
    const { SupabaseProvider } = await import('./supabase');
    instance = new SupabaseProvider();
  }
  return data();
}

export type { DataProvider } from './types';
