import clsx from 'clsx';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';

export const cn = clsx;

/* ------------------------------------------------------------------ Button */

type ButtonVariant = 'primary' | 'ghost' | 'quiet' | 'danger';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 h-10 ' +
  'text-sm font-medium whitespace-nowrap transition-colors duration-[var(--t-fast)] ' +
  'disabled:opacity-40 disabled:pointer-events-none';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-signal text-ink hover:bg-[#ffb443] font-semibold',
  ghost: 'border border-rule text-paper hover:border-rule-hi hover:bg-slab',
  quiet: 'text-mute hover:text-paper',
  danger: 'border border-fault/40 text-fault hover:bg-fault/10',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  small?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'ghost', small, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], small && 'h-8 px-3 text-xs', className)}
      {...props}
    />
  );
});

export function LinkButton({
  to,
  variant = 'ghost',
  small,
  className,
  children,
}: {
  to: string;
  variant?: ButtonVariant;
  small?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], small && 'h-8 px-3 text-xs', className)}
    >
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------- Band */

/**
 * The product's core structural device: a hairline-separated band with its name
 * in the left gutter. Used instead of cards nearly everywhere.
 */
export function Band({
  label,
  children,
  action,
  className,
  id,
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn('border-t border-rule py-8 md:py-10 lg:grid lg:grid-cols-[var(--gutter)_1fr] lg:gap-8', className)}
    >
      <div className="mb-4 flex items-baseline justify-between gap-4 lg:mb-0 lg:block">
        <h2 className="gutter-label lg:sticky lg:top-24">{label}</h2>
        {action ? <div className="lg:hidden">{action}</div> : null}
      </div>
      <div className="min-w-0">
        {action ? <div className="mb-5 hidden justify-end lg:flex">{action}</div> : null}
        {children}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- Stat */

export function Stat({
  label,
  value,
  unit,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  unit?: string;
  detail?: string;
  tone?: 'default' | 'signal';
}) {
  return (
    <div className="min-w-0">
      <div className="gutter-label mb-1.5">{label}</div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            'font-display text-2xl leading-none tracking-[-0.04em] tabular-nums',
            tone === 'signal' ? 'text-signal' : 'text-paper',
          )}
        >
          {value}
        </span>
        {unit ? <span className="text-tick text-mute">{unit}</span> : null}
      </div>
      {detail ? <div className="mt-1.5 text-tick text-mute">{detail}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- Segmented */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-[var(--radius-tag)] px-2.5 py-1 text-xs transition-colors duration-[var(--t-fast)]',
              active ? 'bg-slab-hi text-signal' : 'text-mute hover:text-paper',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Toggle */

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex items-center gap-2 text-xs transition-colors duration-[var(--t-fast)]',
        checked ? 'text-signal' : 'text-mute hover:text-paper',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block h-3 w-3 rounded-[1px] border transition-colors duration-[var(--t-fast)]',
          checked ? 'border-signal bg-signal' : 'border-rule-hi',
        )}
      />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------- Field */

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, className, id, ...props },
  ref,
) {
  const generated = useId();
  const fieldId = id ?? generated;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;

  return (
    <div className="min-w-0">
      <label htmlFor={fieldId} className="gutter-label mb-2 block">
        {label}
      </label>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-10 w-full rounded-[var(--radius-control)] border bg-slab px-3 font-mono text-sm text-paper',
          'placeholder:text-mute transition-colors duration-[var(--t-fast)]',
          error ? 'border-fault' : 'border-rule focus:border-rule-hi',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={`${fieldId}-error`} className="mt-2 text-tick text-fault">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mt-2 text-tick text-mute">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/* ------------------------------------------------------- states: empty etc */

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-rule px-6 py-10 text-center">
      <p className="font-display text-base tracking-[-0.02em] text-paper">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-mute">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="border border-fault/30 bg-fault/5 px-5 py-4">
      <p className="text-sm text-paper">{message}</p>
      {onRetry ? (
        <Button small className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-[var(--radius-tag)] bg-slab-hi', className)}
    />
  );
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Avatar */

/**
 * Deterministic avatar from the profile's seed — no uploads, no storage, no
 * moderation surface. Four-band signal glyph, hue derived from the seed.
 */
export function Avatar({ seed, size = 32, username }: { seed: string; size?: number; username?: string }) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const bars = [0, 1, 2, 3].map((i) => 0.25 + (((hash >> (i * 3)) & 7) / 7) * 0.7);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label={username ? `${username}'s avatar` : 'Avatar'}
      className="shrink-0 rounded-[3px]"
    >
      <rect width="32" height="32" fill={`hsl(${hue} 22% 12%)`} />
      {bars.map((h, i) => (
        <rect
          key={i}
          x={4 + i * 7}
          y={28 - h * 22}
          width="5"
          height={h * 22}
          fill={`hsl(${hue} 70% ${45 + i * 5}%)`}
        />
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------- Tag */

export function Tag({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'signal' | 'fault' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--radius-tag)] px-1.5 py-0.5 font-mono text-micro uppercase tracking-[0.08em]',
        tone === 'signal' && 'bg-signal/12 text-signal',
        tone === 'fault' && 'bg-fault/12 text-fault',
        tone === 'default' && 'bg-slab-hi text-mute',
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Dialog */

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input, a')?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusables = ref.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink/80 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md border border-rule bg-slab p-6 sm:rounded-[var(--radius-control)]"
      >
        <h2 className="font-display text-lg tracking-[-0.03em]">{title}</h2>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
