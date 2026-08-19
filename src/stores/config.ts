import { create } from 'zustand';
import { data } from '@/lib/data';
import { DEFAULT_CONFIG, type TestConfig } from '@/lib/typing/types';

const KEY = 'baud:config';

/**
 * Read synchronously at module load: a reload must never briefly show a mode the
 * user did not choose.
 */
function readInitial(): TestConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<TestConfig>) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

interface ConfigState {
  config: TestConfig;
  /** Bumped to force a fresh test without changing configuration. */
  nonce: number;
  update: (patch: Partial<TestConfig>) => void;
  restart: () => void;
}

export const useConfig = create<ConfigState>((set, get) => ({
  config: readInitial(),
  nonce: 0,

  update(patch) {
    const config = { ...get().config, ...patch };
    set({ config, nonce: get().nonce + 1 });
    localStorage.setItem(KEY, JSON.stringify(config));
    void data().setConfig(config);
  },

  restart() {
    set({ nonce: get().nonce + 1 });
  },
}));
