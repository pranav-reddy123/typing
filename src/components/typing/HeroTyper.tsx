import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TypingEngine } from '@/lib/typing/engine';
import { SignalStrip } from '@/components/chart/SignalStrip';
import { DEFAULT_CONFIG } from '@/lib/typing/types';
import { cn } from '@/components/ui';

const HEADLINE = 'Type faster. Think faster.';

const STATE_CLASS = {
  pending: 'text-dim',
  correct: 'text-paper',
  incorrect: 'text-fault underline underline-offset-[6px]',
  extra: 'text-fault opacity-60',
} as const;

/**
 * The hero is the product.
 *
 * The headline is not a picture of a typing test — it is one. Start typing it
 * and the characters resolve, the caret tracks, and the Signal Strip draws your
 * pace underneath. Finishing it reports your speed and hands you the real thing.
 */
export function HeroTyper({ onFinish }: { onFinish?: (wpm: number, accuracy: number) => void }) {
  const [nonce, setNonce] = useState(0);
  const engine = useMemo(
    () => new TypingEngine({ ...DEFAULT_CONFIG, mode: 'custom', customText: HEADLINE }),
    [nonce],
  );

  const [done, setDone] = useState<{ wpm: number; accuracy: number } | null>(null);
  const [focused, setFocused] = useState(false);
  const [, forceRender] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const wordsRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLDivElement>(null);
  const wordNodes = useRef<HTMLElement[]>([]);
  const lastKeyTime = useRef(0);

  const build = useCallback(() => {
    const host = wordsRef.current;
    if (!host) return;
    host.textContent = '';
    wordNodes.current = [];
    for (const word of engine.words) {
      const el = document.createElement('span');
      el.className = 'whitespace-nowrap';
      for (const char of word) {
        const span = document.createElement('span');
        span.className = STATE_CLASS.pending;
        span.textContent = char;
        el.appendChild(span);
      }
      wordNodes.current.push(el);
      host.appendChild(el);
    }
  }, [engine]);

  const moveCaret = useCallback(() => {
    const caret = caretRef.current;
    const host = wordsRef.current;
    const word = wordNodes.current[engine.wordIndex];
    if (!caret || !host || !word) return;
    const i = engine.currentInput.length;
    const target = word.childNodes[Math.min(i, word.childNodes.length - 1)] as HTMLElement | undefined;
    if (!target) return;

    // Rects, not offset* — those report a different box on inline elements.
    const hostRect = host.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    const x = (i >= word.childNodes.length ? box.right : box.left) - hostRect.left;
    caret.style.transform = `translate3d(${(x).toFixed(1)}px, ${(box.top - hostRect.top).toFixed(1)}px, 0)`;
    caret.style.height = `${(box.height * 0.82).toFixed(1)}px`;
  }, [engine]);

  const paint = useCallback(
    (indices: number[]) => {
      for (const index of indices) {
        const node = wordNodes.current[index];
        if (!node) continue;
        const states = engine.charStates(index);
        while (node.childNodes.length < states.length) node.appendChild(document.createElement('span'));
        while (node.childNodes.length > states.length) node.removeChild(node.lastChild as ChildNode);
        for (let i = 0; i < states.length; i++) {
          const span = node.childNodes[i] as HTMLElement;
          span.className = STATE_CLASS[states[i]];
          const text = engine.words[index]?.[i] ?? engine.inputs[index]?.[i] ?? '';
          if (span.textContent !== text) span.textContent = text;
        }
      }
      moveCaret();
    },
    [engine, moveCaret],
  );

  useLayoutEffect(() => {
    build();
    paint([0]);
    setDone(null);
  }, [build, paint]);

  // Re-measure once the display face loads; the first paint sees the fallback.
  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) moveCaret();
    });
    return () => {
      cancelled = true;
    };
  }, [moveCaret]);

  useEffect(() => {
    engine.on({
      onFinish: (result) => {
        setDone({ wpm: result.wpm, accuracy: result.accuracy });
        onFinish?.(result.wpm, result.accuracy);
      },
      onTick: () => forceRender((n) => n + 1),
    });
    return () => engine.destroy();
  }, [engine, onFinish]);

  const handleChar = (char: string) => {
    if (engine.status === 'finished') return;
    paint(engine.input(char));
  };

  return (
    <div className="relative">
      <h1 className="sr-only">{HEADLINE}</h1>

      <div
        className="relative cursor-text"
        onClick={() => inputRef.current?.focus()}
        aria-hidden
      >
        <div
          ref={wordsRef}
          className="flex flex-wrap gap-x-[0.4ch] font-display text-[clamp(1.85rem,6.2vw,4rem)] font-medium leading-[1.15] tracking-[-0.055em]"
        />
        <div
          ref={caretRef}
          className={cn(
            'pointer-events-none absolute left-0 top-0 w-[3px] bg-signal',
            engine.status === 'running' ? '' : 'animate-[caret_1.05s_steps(1)_infinite]',
          )}
          style={{ transition: 'transform 70ms linear' }}
        />
      </div>

      <input
        ref={inputRef}
        type="text"
        value=""
        onChange={() => undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === 'Backspace') {
            event.preventDefault();
            paint(engine.backspace(event.ctrlKey || event.metaKey));
            return;
          }
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          if (event.key.length === 1) {
            event.preventDefault();
            lastKeyTime.current = event.timeStamp;
            handleChar(event.key);
          }
        }}
        onBeforeInput={(event) => {
          event.preventDefault();
          const native = event as unknown as { data?: string; timeStamp: number };
          if (native.timeStamp - lastKeyTime.current < 40) return;
          for (const char of native.data ?? '') handleChar(char);
        }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Type the headline to try Baud"
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />

      <div className="mt-6 max-w-lg">
        <SignalStrip engine={engine} height={36} />
      </div>

      <p className="mt-3 h-5 font-mono text-tick text-mute" role="status" aria-live="polite">
        {done ? (
          <span className="text-signal">
            {Math.round(done.wpm)} wpm · {done.accuracy.toFixed(0)}% accuracy —{' '}
            <button type="button" className="underline hover:text-paper" onClick={() => setNonce((n) => n + 1)}>
              again
            </button>
          </span>
        ) : engine.status === 'running' ? (
          `${Math.round(engine.metrics().wpm)} wpm`
        ) : focused ? (
          'Start typing the line above.'
        ) : (
          'Click the headline and type it.'
        )}
      </p>

      <style>{'@keyframes caret { 0%,45% { opacity: 1 } 50%,95% { opacity: 0.15 } }'}</style>
    </div>
  );
}
