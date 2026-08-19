/**
 * The mark is a square wave — the literal shape of a signal at a fixed baud
 * rate, which is what the product measures.
 */
export function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M2 23 H10 V9 H21 V23 H30"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="sr-only">Baud</span>
      <span aria-hidden className="flex items-center gap-2">
        <Logo size={18} className="text-signal" />
        <span className="font-display text-base font-semibold tracking-[-0.06em] text-paper">
          baud
        </span>
      </span>
    </span>
  );
}
