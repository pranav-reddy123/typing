import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TypingEngine, type EngineStatus, type LiveMetrics } from '@/lib/typing/engine';
import type { TestConfig, TestResult } from '@/lib/typing/types';
import { SignalStrip } from '@/components/chart/SignalStrip';
import { cn } from '@/components/ui';

/** Ascender-to-baseline as a fraction of the full character cell. */
const CARET_HEIGHT_RATIO = 0.82;

const STATE_CLASS = {
  pending: 'c-pending',
  correct: 'c-correct',
  incorrect: 'c-incorrect',
  extra: 'c-extra',
} as const;

export interface TypingSurfaceProps {
  config: TestConfig;
  /** Changing this builds a fresh test. */
  nonce: number;
  seed?: string;
  onFinish: (result: TestResult) => void;
  /** Race mode: throttled progress reports. Never called per keystroke. */
  onProgress?: (m: LiveMetrics) => void;
  /** Race mode: input is locked until the countdown reaches zero. */
  locked?: boolean;
  autoFocus?: boolean;
  /** Increment to end the test early — zen mode and race timeouts use this. */
  finishSignal?: number;
}

/**
 * The typing surface.
 *
 * React renders this component when the test is created and when its status
 * changes — four or five times for a whole test. Every keystroke is handled
 * outside React: the engine mutates its own fields, and this component writes
 * class names on cached span nodes and moves the caret with a transform.
 */
export function TypingSurface({
  config,
  nonce,
  seed,
  onFinish,
  onProgress,
  locked = false,
  autoFocus = true,
  finishSignal = 0,
}: TypingSurfaceProps) {
  const engine = useMemo(
    () => new TypingEngine(config, seed),
    // A new engine per configuration change or explicit restart — that is the
    // only thing that should ever rebuild the surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, nonce, seed],
  );

  const [status, setStatus] = useState<EngineStatus>('idle');
  const [focused, setFocused] = useState(false);

  const wordsRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wordNodes = useRef<HTMLElement[]>([]);
  const lastKeyTime = useRef(0);
  const lineOffset = useRef(0);
  /** Painted-vs-offset correction for a character cell. Constant per font. */
  const cellMetrics = useRef({ dy: 0, height: 0, line: 0 });

  /* ---- build the DOM once, outside React's reconciler ---------------- */

  /** Appends spans for `engine.words[from..]` without touching existing nodes. */
  const appendWords = useCallback(
    (from: number) => {
      const host = wordsRef.current;
      if (!host) return;
      const fragment = document.createDocumentFragment();

      for (let w = from; w < engine.words.length; w++) {
        const word = document.createElement('span');
        word.className = 'word';
        for (const char of engine.words[w]) {
          const span = document.createElement('span');
          span.className = 'c-pending';
          span.textContent = char;
          word.appendChild(span);
        }
        wordNodes.current.push(word);
        fragment.appendChild(word);
      }
      host.appendChild(fragment);
    },
    [engine],
  );

  const build = useCallback(() => {
    const host = wordsRef.current;
    if (!host) return;
    host.textContent = '';
    wordNodes.current = [];
    appendWords(0);
    lineOffset.current = 0;
    if (trackRef.current) trackRef.current.style.transform = 'translateY(0px)';
  }, [appendWords]);

  /** Repaint exactly the words that changed. At most two per keystroke. */
  const paint = useCallback(
    (indices: number[]) => {
      for (const index of indices) {
        const node = wordNodes.current[index];
        if (!node) continue;
        const states = engine.charStates(index);
        const input = engine.inputs[index] ?? '';

        while (node.childNodes.length < states.length) {
          const extra = document.createElement('span');
          node.appendChild(extra);
        }
        while (node.childNodes.length > states.length) {
          node.removeChild(node.lastChild as ChildNode);
        }

        for (let i = 0; i < states.length; i++) {
          const span = node.childNodes[i] as HTMLElement;
          const nextClass = STATE_CLASS[states[i]];
          if (span.className !== nextClass) span.className = nextClass;
          const expected = engine.words[index]?.[i];
          const text = expected ?? input[i] ?? '';
          if (span.textContent !== text) span.textContent = text;
        }
        node.classList.toggle('word-done', index < engine.wordIndex);
      }
      moveCaret();
    },
    // moveCaret is stable within this component instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine],
  );

  const moveCaret = useCallback(() => {
    const caret = caretRef.current;
    const track = trackRef.current;
    const word = wordNodes.current[engine.wordIndex];
    if (!caret || !track || !word) return;

    const charIndex = engine.currentInput.length;
    const target = word.childNodes[Math.min(charIndex, word.childNodes.length - 1)] as
      | HTMLElement
      | undefined;

    // `offsetTop`/`offsetHeight` on an inline box report a different box than
    // the one that gets painted — 26px against a 29px rect — which is what put
    // the caret off the text. The correction is constant for a given font and
    // size, so it is measured once (see `calibrate`) rather than per keystroke:
    // a getBoundingClientRect on every character cost 3x the keystroke budget.
    const cell = cellMetrics.current;
    const node = target ?? word;
    const atWordEnd = Boolean(target) && charIndex >= word.childNodes.length;

    const x = atWordEnd ? node.offsetLeft + node.offsetWidth : node.offsetLeft;
    const y = node.offsetTop + cell.dy;

    // The cell runs from the ascender to the descender; the caret should run
    // from the ascender to the baseline, or it hangs below lowercase text.
    caret.style.height = `${(cell.height * CARET_HEIGHT_RATIO).toFixed(1)}px`;
    caret.style.transform = `translate3d(${x}px, ${y.toFixed(1)}px, 0)`;

    // Keep the active line as the second of three: the reader always has one
    // line of context behind and one ahead. Scrolling the track moves the caret
    // with the text, which is the whole reason the caret lives inside it.
    const lineHeight = cell.line || word.offsetHeight;
    const desired = Math.max(0, Math.round(word.offsetTop / lineHeight) - 1) * lineHeight;
    if (desired !== lineOffset.current) {
      lineOffset.current = desired;
      track.style.transform = `translateY(${-desired}px)`;
    }
  }, [engine]);

  /**
   * Measure the one character cell we need, once. Re-run whenever the metrics
   * can actually change: a rebuild, a font swap, or a resize.
   */
  const calibrate = useCallback(() => {
    const track = trackRef.current;
    const first = wordNodes.current[0]?.firstChild as HTMLElement | undefined;
    if (!track || !first) return;
    const trackRect = track.getBoundingClientRect();
    const cellRect = first.getBoundingClientRect();
    cellMetrics.current = {
      dy: cellRect.top - trackRect.top - first.offsetTop,
      height: cellRect.height,
      line: wordNodes.current[0].offsetHeight,
    };
  }, []);

  useLayoutEffect(() => {
    build();
    calibrate();
    paint([0]);
    setStatus('idle');
  }, [build, calibrate, paint]);

  /* ---- engine wiring -------------------------------------------------- */

  const metricRefs = {
    wpm: useRef<HTMLSpanElement>(null),
    accuracy: useRef<HTMLSpanElement>(null),
    errors: useRef<HTMLSpanElement>(null),
    counter: useRef<HTMLSpanElement>(null),
    bar: useRef<HTMLDivElement>(null),
  };

  // The callbacks are held in refs so the subscription below depends only on the
  // engine. It used to list them directly, and its cleanup calls
  // `engine.destroy()` — so any parent that passed a fresh callback identity per
  // render (the race room does, four times a second) destroyed the engine's
  // ticker mid-test. `start()` then refused to restart it, because the status
  // was still `running`, and live WPM stayed frozen at zero for the rest of the
  // test. The engine outlives renders; only its inputs change.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const modeRef = useRef(config.mode);
  modeRef.current = config.mode;

  useEffect(() => {
    engine.on({
      onStructure: () => {
        // Append only. This fires every ~40 words in time mode; rebuilding the
        // whole passage here cost 17 ms — a dropped frame, mid-test, reliably.
        appendWords(wordNodes.current.length);
      },
      onStatus: setStatus,
      onFinish: (result) => onFinishRef.current(result),
      onTick: (m) => {
        // Text nodes only — no React, no reconciliation, ~10 Hz.
        if (metricRefs.wpm.current) metricRefs.wpm.current.textContent = String(Math.round(m.wpm));
        if (metricRefs.accuracy.current) {
          metricRefs.accuracy.current.textContent = `${m.accuracy.toFixed(0)}%`;
        }
        if (metricRefs.errors.current) metricRefs.errors.current.textContent = String(m.errors);
        if (metricRefs.counter.current) {
          metricRefs.counter.current.textContent =
            modeRef.current === 'time'
              ? String(Math.ceil(m.remaining))
              : `${Math.min(m.wordIndex, engine.words.length)}/${engine.words.length}`;
        }
        if (metricRefs.bar.current) {
          metricRefs.bar.current.style.transform = `scaleX(${m.progress})`;
        }
        onProgressRef.current?.(m);
      },
    });
    return () => engine.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, appendWords]);

  /* ---- input ---------------------------------------------------------- */

  const handleChar = useCallback(
    (char: string) => {
      if (locked || engine.status === 'finished') return;
      paint(engine.input(char));
    },
    [engine, locked, paint],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Backspace') {
        event.preventDefault();
        if (!locked) paint(engine.backspace(event.ctrlKey || event.altKey || event.metaKey));
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key.length === 1) {
        event.preventDefault();
        lastKeyTime.current = event.timeStamp;
        handleChar(event.key);
      }
    },
    [engine, handleChar, locked, paint],
  );

  /**
   * Mobile keyboards report `key: 'Unidentified'` on keydown, so characters
   * arrive through beforeinput instead. The timestamp check stops a desktop
   * keystroke being counted twice.
   */
  const onBeforeInput = useCallback(
    (event: React.FormEvent<HTMLInputElement> & { data?: string; timeStamp: number }) => {
      event.preventDefault();
      if (event.timeStamp - lastKeyTime.current < 40) return;
      const data = event.data;
      if (!data) return;
      for (const char of data) handleChar(char);
    },
    [handleChar],
  );

  useEffect(() => {
    if (finishSignal > 0 && engine.status !== 'finished') engine.finish();
  }, [finishSignal, engine]);

  const focus = useCallback(() => inputRef.current?.focus(), []);

  useEffect(() => {
    if (autoFocus) focus();
  }, [autoFocus, focus, engine]);

  useEffect(() => {
    const recalibrate = () => {
      calibrate();
      moveCaret();
    };
    window.addEventListener('resize', recalibrate);

    // The first paint measures the fallback font. When JetBrains Mono swaps in,
    // every character box changes size, so the cell has to be measured again or
    // the caret keeps the fallback's metrics for the whole test.
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) recalibrate();
    });

    return () => {
      cancelled = true;
      window.removeEventListener('resize', recalibrate);
    };
  }, [calibrate, moveCaret]);

  const showOverlay = !focused && status !== 'finished';

  return (
    <div className="w-full">
      <style>{SURFACE_CSS}</style>

      {/* Live meters. Values are written straight to these nodes. */}
      <div className="mb-6 flex items-end justify-between gap-6">
        <div className="flex items-baseline gap-2">
          <span
            ref={metricRefs.counter}
            className="font-display text-3xl leading-none tracking-[-0.05em] text-signal tabular-nums"
          >
            {config.mode === 'time' ? config.target : `0/${engine.words.length}`}
          </span>
          <span className="text-tick text-mute">{config.mode === 'time' ? 'sec left' : 'words'}</span>
        </div>

        <dl className="flex items-baseline gap-5 sm:gap-7">
          <Meter label="wpm" nodeRef={metricRefs.wpm} initial="0" />
          <Meter label="acc" nodeRef={metricRefs.accuracy} initial="100%" />
          <Meter label="err" nodeRef={metricRefs.errors} initial="0" tone="fault" />
        </dl>
      </div>

      <div className="mb-5 h-px w-full bg-rule">
        <div
          ref={metricRefs.bar}
          className="h-px origin-left bg-signal transition-transform duration-200 ease-linear"
          style={{ transform: 'scaleX(0)' }}
        />
      </div>

      <div className="relative">
        <div
          className={cn('typing-viewport relative overflow-hidden', showOverlay && 'blur-[3px]')}
          onClick={focus}
        >
          {/* The track carries both the words and the caret, so the caret shares
              their coordinate space and scrolls with them when a line wraps. */}
          <div ref={trackRef} className="typing-track will-change-transform">
            <div ref={wordsRef} className="typing-words" aria-hidden />
            <div
              ref={caretRef}
              className={cn('caret', status === 'running' ? 'caret-steady' : 'caret-blink')}
              aria-hidden
            />
          </div>
        </div>

        {showOverlay && (
          <button
            type="button"
            onClick={focus}
            className="absolute inset-0 flex items-center justify-center text-sm text-mute"
          >
            Click or press any key to focus
          </button>
        )}

        <label className="sr-only" htmlFor="typing-input">
          Typing input. Type the words shown above. Press Tab then Enter to restart.
        </label>
        <input
          id="typing-input"
          ref={inputRef}
          type="text"
          value=""
          onChange={() => undefined}
          onKeyDown={onKeyDown}
          onBeforeInput={onBeforeInput}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-describedby="typing-live"
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
        />
      </div>

      <p id="typing-live" className="sr-only" role="status" aria-live="polite">
        {status === 'finished' ? 'Test complete. Results are shown below.' : ''}
      </p>

      <div className="mt-6">
        <SignalStrip engine={engine} height={44} />
      </div>
    </div>
  );
}

function Meter({
  label,
  nodeRef,
  initial,
  tone,
}: {
  label: string;
  nodeRef: React.RefObject<HTMLSpanElement | null>;
  initial: string;
  tone?: 'fault';
}) {
  return (
    <div className="text-right">
      <dt className="gutter-label">{label}</dt>
      <dd
        className={cn(
          'font-display text-lg leading-none tracking-[-0.04em] tabular-nums',
          tone === 'fault' ? 'text-mute' : 'text-paper',
        )}
      >
        <span ref={nodeRef}>{initial}</span>
      </dd>
    </div>
  );
}

/**
 * Scoped to the surface and injected once. These rules are hit on every
 * keystroke, so they stay flat: no descendant selectors deeper than two levels,
 * no transitions on the character spans.
 */
const SURFACE_CSS = `
.typing-viewport {
  height: calc(3 * var(--line));
  --line: 2.9rem;
  font-family: var(--font-mono);
  font-size: 1.375rem;
  line-height: var(--line);
  letter-spacing: 0.01em;
  max-width: 62ch;
  transition: filter var(--t-base) var(--ease-out-quint);
}
@media (max-width: 640px) {
  .typing-viewport { --line: 2.35rem; font-size: 1.125rem; }
}
.typing-track {
  position: relative;
  transition: transform 140ms var(--ease-io);
}
.typing-words {
  display: flex;
  flex-wrap: wrap;
  gap: 0 0.55ch;
}
.typing-words .word { white-space: nowrap; }
.typing-words .c-pending   { color: var(--color-mute); }
.typing-words .c-correct   { color: var(--color-paper); }
.typing-words .c-incorrect { color: var(--color-fault); text-decoration: underline; text-underline-offset: 4px; }
.typing-words .c-extra     { color: var(--color-fault); opacity: 0.55; }
.caret {
  position: absolute;
  top: 0;
  left: 0;
  width: 2px;
  background: var(--color-signal);
  will-change: transform;
  transition: transform 70ms linear;
}
.caret-blink { animation: caret-blink 1.05s steps(1) infinite; }
@keyframes caret-blink { 0%, 45% { opacity: 1 } 50%, 95% { opacity: 0.15 } }
@media (prefers-reduced-motion: reduce) {
  .caret { transition: none; }
  .caret-blink { animation: none; }
  .typing-track { transition: none; }
}
`;
