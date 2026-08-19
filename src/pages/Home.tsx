import { useEffect } from 'react';
import { HeroTyper } from '@/components/typing/HeroTyper';
import { Logo } from '@/components/brand/Logo';
import { LinkButton } from '@/components/ui';
import { useDocumentTitle, useReducedMotion } from '@/hooks';

export default function Home() {
  useDocumentTitle('Baud — Type faster. Think faster.');
  const reduced = useReducedMotion();

  /* Lenis is worth its 3 kB on exactly this page: the marketing scroll. */
  useEffect(() => {
    if (reduced) return;
    let lenis: { destroy: () => void; raf: (t: number) => void } | null = null;
    let frame = 0;
    let cancelled = false;

    void import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      lenis = new Lenis({ duration: 0.9, wheelMultiplier: 1 });
      const loop = (time: number) => {
        lenis?.raf(time);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      lenis?.destroy();
    };
  }, [reduced]);

  return (
    <div>
      <section className="measure px-4 pb-16 pt-14 sm:px-6 md:pt-20">
        <p className="gutter-label mb-8 flex items-center gap-2">
          <Logo size={14} className="text-signal" />
          Baud — signalling rate, measured
        </p>

        <HeroTyper />

        <p className="mt-10 max-w-xl text-base text-dim">
          A competitive typing platform built to measure, understand, and improve the way you type.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton to="/practice" variant="primary">
            Start typing
          </LinkButton>
          <LinkButton to="/race">Race a friend</LinkButton>
        </div>
      </section>

      <Feature
        label="Measure"
        title="Six numbers, defined once."
        body="Net WPM counts only the characters that were right when you submitted them. Raw counts every keystroke. Consistency is the coefficient of variation of your per-second pace, so bursting and stalling shows up even when your average looks fine. The formulas live in one file and no screen recomputes them."
        rows={[
          ['Net WPM', 'correct characters ÷ 5 ÷ minutes'],
          ['Raw WPM', 'every keystroke ÷ 5 ÷ minutes'],
          ['Accuracy', 'correct keystrokes ÷ all keystrokes'],
          ['Consistency', '100 × (1 − σ/μ) of per-second pace'],
        ]}
      />

      <Feature
        label="Analyse"
        title="Your keyboard, coloured by where you actually fail."
        body="Baud records which character you typed when a different one was expected — never what you wrote. That single aggregate powers the keyboard heatmap, the confusion table, and every insight on the dashboard. Nothing is illustrative: if you have not typed enough for a claim to hold, Baud says so instead of inventing one."
        rows={[
          ['Weakest keys', 'ranked once a key has 20+ attempts'],
          ['Confusion pairs', 'the exact substitutions you make'],
          ['By duration', 'where your accuracy actually peaks'],
          ['Trend', 'month over month, with a significance guard'],
        ]}
      />

      <Feature
        label="Race"
        title="One code. Four characters. Everyone starts on the same tick."
        body="Create a private race, share a code like RACE-8K2F, and every player derives the same passage from the same seed — the text is never transmitted, so nobody can be handed an easier one. The countdown is an absolute timestamp, not a local counter, so a player on a slow connection still starts within a frame of everyone else."
        rows={[
          ['Live progress', 'each player, updated four times a second'],
          ['Disconnects', 'shown, not silently dropped'],
          ['Late joins', 'allowed in the lobby, refused mid-race'],
          ['Placement', 'from finish timestamps, not client claims'],
        ]}
      />

      <section className="measure border-t border-rule px-4 py-20 sm:px-6 lg:grid lg:grid-cols-[var(--gutter)_1fr] lg:gap-8">
        <p className="gutter-label mb-5 lg:mb-0">Start</p>
        <div>
        <h2 className="max-w-2xl font-display text-[clamp(1.5rem,3.6vw,2.4rem)] leading-[1.15] tracking-[-0.05em]">
          Take one test. It costs you fifteen seconds.
        </h2>
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton to="/practice" variant="primary">
            Start typing
          </LinkButton>
          <LinkButton to="/signup">Create an account</LinkButton>
        </div>
        <p className="mt-4 text-tick text-mute">
          You can type without an account. Sign up later and the tests you already took move with you.
        </p>
        </div>
      </section>
    </div>
  );
}

function Feature({
  label,
  title,
  body,
  rows,
}: {
  label: string;
  title: string;
  body: string;
  rows: Array<[string, string]>;
}) {
  // No scroll reveal here, deliberately. These are three dense text bands; a
  // fade-in adds nothing and introduces a real failure mode — content gated on
  // an IntersectionObserver callback is invisible whenever that callback does
  // not fire (deep links, print, capture, reduced-motion edge cases). The
  // motion budget is spent on the hero and the results screen instead.
  return (
    <section className="measure border-t border-rule px-4 py-16 sm:px-6 lg:grid lg:grid-cols-[var(--gutter)_1fr] lg:gap-8">
      <p className="gutter-label mb-5 lg:mb-0">{label}</p>

      <div>
        <h2 className="max-w-2xl font-display text-[clamp(1.35rem,3.2vw,2rem)] leading-[1.2] tracking-[-0.045em]">
          {title}
        </h2>
        <p className="mt-5 max-w-2xl text-sm leading-[1.7] text-dim">{body}</p>

        <dl className="mt-8 max-w-2xl">
          {rows.map(([term, definition]) => (
            <div
              key={term}
              className="grid grid-cols-1 gap-1 border-t border-rule py-3 sm:grid-cols-[13rem_1fr] sm:gap-4"
            >
              <dt className="font-mono text-xs text-paper">{term}</dt>
              <dd className="font-mono text-xs text-mute">{definition}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
