import { useToasts } from '@/stores/toast';

const TONE_CLASS = {
  info: 'border-rule-hi text-paper',
  success: 'border-good/40 text-good',
  error: 'border-fault/50 text-fault',
} as const;

/**
 * Toasts animate with eight lines of CSS. This used to pull in a full animation
 * runtime for one fade, which cost every page ~124 kB to render a rectangle.
 */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      <style>{TOAST_CSS}</style>
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`toast pointer-events-auto border bg-slab px-4 py-3 text-left text-sm ${TONE_CLASS[t.tone]}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

const TOAST_CSS = `
.toast { animation: toast-in 180ms var(--ease-out-quint) both; }
@keyframes toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .toast { animation: none; }
}
`;
