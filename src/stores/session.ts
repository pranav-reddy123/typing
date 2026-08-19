import { create } from 'zustand';
import { data, initProvider } from '@/lib/data';
import type { User } from '@/lib/data/types';

interface SessionState {
  user: User | null;
  status: 'booting' | 'ready';
  claimedTests: number;
  boot: () => Promise<void>;
  signIn: (identifier: string, password: string) => Promise<string | null>;
  signUp: (email: string, username: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  status: 'booting',
  claimedTests: 0,

  async boot() {
    await initProvider();
    const user = await data().getSession();
    set({ user, status: 'ready' });
  },

  async signIn(identifier, password) {
    const { user, error } = await data().signIn(identifier, password);
    if (error) return error;
    set({ user });
    return null;
  },

  async signUp(email, username, password) {
    const { user, error } = await data().signUp(email, username, password);
    if (error) return error;
    set({ user });
    return null;
  },

  async signOut() {
    await data().signOut();
    set({ user: null });
  },

  setUser(user) {
    set({ user });
  },
}));
