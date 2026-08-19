import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  tone: 'info' | 'error' | 'success';
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: Toast['tone']) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],

  push(message, tone = 'info') {
    const id = crypto.randomUUID();
    set({ toasts: [...get().toasts, { id, message, tone }] });
    setTimeout(() => get().dismiss(id), tone === 'error' ? 6000 : 3500);
  },

  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = {
  info: (message: string) => useToasts.getState().push(message, 'info'),
  error: (message: string) => useToasts.getState().push(message, 'error'),
  success: (message: string) => useToasts.getState().push(message, 'success'),
};
