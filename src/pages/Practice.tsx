import { useCallback, useEffect, useRef, useState } from 'react';
import { TypingSurface } from '@/components/typing/TypingSurface';
import { ConfigBar } from '@/components/typing/ConfigBar';
import { Results } from '@/components/typing/Results';
import { Button, Field } from '@/components/ui';
import { useConfig } from '@/stores/config';
import { useSession } from '@/stores/session';
import { data } from '@/lib/data';
import { evaluateAchievements } from '@/lib/achievements/catalog';
import { ACHIEVEMENT_BY_KEY } from '@/lib/achievements/catalog';
import { toast } from '@/stores/toast';
import { useDocumentTitle } from '@/hooks';
import type { TestResult } from '@/lib/typing/types';
import { isScoreable } from '@/lib/typing/metrics';

export default function Practice() {
  useDocumentTitle('Baud — typing test');

  const config = useConfig((s) => s.config);
  const nonce = useConfig((s) => s.nonce);
  const update = useConfig((s) => s.update);
  const restart = useConfig((s) => s.restart);
  const user = useSession((s) => s.user);

  const [result, setResult] = useState<TestResult | null>(null);
  const [averageWpm, setAverageWpm] = useState<number | null>(null);
  const [personalBest, setPersonalBest] = useState(false);
  const [finishSignal, setFinishSignal] = useState(0);
  const retrySeed = useRef<string | undefined>(undefined);

  const handleFinish = useCallback(
    async (finished: TestResult) => {
      setResult(finished);

      try {
        const previous = user ? await data().listTests(user.id, 500) : [];
        const scoreable = previous.filter(isScoreable);
        setAverageWpm(
          scoreable.length > 0
            ? scoreable.reduce((s, t) => s + t.wpm, 0) / scoreable.length
            : null,
        );
        setPersonalBest(
          isScoreable(finished) &&
            scoreable.every((t) => t.wpm < finished.wpm) &&
            scoreable.length > 0,
        );

        const saved = await data().saveTest(finished);

        if (user) {
          const all = [saved, ...previous];
          const stats = await data().getProfileStats(user.id);
          const earned = evaluateAchievements(all, stats);
          const already = new Set((await data().listAchievements(user.id)).map((a) => a.key));
          const fresh = earned.filter((key) => !already.has(key));
          if (fresh.length > 0) {
            await data().grantAchievements(user.id, fresh);
            const title = ACHIEVEMENT_BY_KEY.get(fresh[0])?.title ?? fresh[0];
            toast.success(
              fresh.length === 1 ? `Achievement: ${title}` : `${fresh.length} new achievements`,
            );
          }
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'That result could not be saved.');
      }
    },
    [user],
  );

  const newTest = useCallback(() => {
    retrySeed.current = undefined;
    setResult(null);
    setPersonalBest(false);
    setFinishSignal(0);
    restart();
  }, [restart]);

  const retry = useCallback(() => {
    setResult(null);
    setPersonalBest(false);
    restart();
  }, [restart]);

  /** Escape restarts from anywhere on the page — mouse never required. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        newTest();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newTest]);

  return (
    <div className="measure px-4 pb-16 pt-8 sm:px-6">
      {result ? (
        <Results
          result={result}
          averageWpm={averageWpm}
          personalBest={personalBest}
          onRetry={retry}
          onNewTest={newTest}
        />
      ) : (
        <>
          <div className="mb-8">
            <ConfigBar config={config} onChange={update} />
            {config.mode === 'custom' && (
              <div className="mt-3">
                <Field
                  label="Custom text"
                  placeholder="Paste the text you want to practise"
                  value={config.customText}
                  onChange={(event) => update({ customText: event.target.value })}
                  hint="Changes apply to the next test."
                />
              </div>
            )}
          </div>

          <TypingSurface
            key={`${nonce}-${config.mode}-${config.target}`}
            config={config}
            nonce={nonce}
            seed={retrySeed.current}
            finishSignal={finishSignal}
            onFinish={handleFinish}
          />

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-5">
            <p className="text-tick text-mute">
              <kbd className="rounded-[2px] border border-rule px-1.5 py-0.5 font-mono">esc</kbd>{' '}
              restarts ·{' '}
              <kbd className="rounded-[2px] border border-rule px-1.5 py-0.5 font-mono">
                ctrl + backspace
              </kbd>{' '}
              clears a word
              {config.mode === 'zen' ? ' · zen mode runs until you stop it' : ''}
            </p>
            <div className="flex gap-2">
              {config.mode === 'zen' && (
                <Button small variant="primary" onClick={() => setFinishSignal((n) => n + 1)}>
                  Finish
                </Button>
              )}
              <Button small onClick={newTest}>
                Restart
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
