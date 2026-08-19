import { Segmented, Toggle, cn } from '@/components/ui';
import { TIME_TARGETS, WORD_TARGETS, type TestConfig, type TestMode } from '@/lib/typing/types';
import type { Difficulty } from '@/lib/typing/words';

const MODES: Array<{ value: TestMode; label: string; hint: string }> = [
  { value: 'time', label: 'time', hint: 'Type until the clock runs out' },
  { value: 'words', label: 'words', hint: 'Type a fixed number of words' },
  { value: 'quote', label: 'quote', hint: 'Type a passage from a book' },
  { value: 'custom', label: 'custom', hint: 'Type your own text' },
  { value: 'zen', label: 'zen', hint: 'Type freely with no target' },
];

const DIFFICULTIES: Array<{ value: Difficulty; label: string }> = [
  { value: 'normal', label: 'normal' },
  { value: 'expert', label: 'expert' },
  { value: 'master', label: 'master' },
];

export function ConfigBar({
  config,
  onChange,
  disabled,
}: {
  config: TestConfig;
  onChange: (patch: Partial<TestConfig>) => void;
  disabled?: boolean;
}) {
  const showTargets = config.mode === 'time' || config.mode === 'words';
  const targets = config.mode === 'time' ? TIME_TARGETS : WORD_TARGETS;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-5 gap-y-3 border border-rule bg-slab px-3 py-2.5',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      <Segmented
        label="Test mode"
        value={config.mode}
        onChange={(mode) => onChange({ mode, target: mode === 'time' ? 30 : 25 })}
        options={MODES.map((m) => ({ value: m.value, label: m.label }))}
      />

      {showTargets && (
        <>
          <span aria-hidden className="hidden h-4 w-px bg-rule sm:block" />
          <Segmented
            label={config.mode === 'time' ? 'Duration in seconds' : 'Word count'}
            value={config.target}
            onChange={(target) => onChange({ target })}
            options={targets.map((t) => ({ value: t, label: String(t) }))}
          />
        </>
      )}

      <span aria-hidden className="hidden h-4 w-px bg-rule sm:block" />

      <div className="flex items-center gap-4">
        <Toggle
          label="punctuation"
          checked={config.punctuation}
          onChange={(punctuation) => onChange({ punctuation })}
        />
        <Toggle label="numbers" checked={config.numbers} onChange={(numbers) => onChange({ numbers })} />
      </div>

      <span aria-hidden className="hidden h-4 w-px bg-rule sm:block" />

      <Segmented
        label="Difficulty"
        value={config.difficulty}
        onChange={(difficulty) => onChange({ difficulty })}
        options={DIFFICULTIES}
      />
    </div>
  );
}

export const MODE_HINTS = Object.fromEntries(MODES.map((m) => [m.value, m.hint])) as Record<
  TestMode,
  string
>;
