import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Band, Button, EmptyState, Field, LoadingRows, Segmented, Tag } from '@/components/ui';
import { useDocumentTitle } from '@/hooks';
import { data } from '@/lib/data';
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toast';
import type { Race, RaceParticipant } from '@/lib/data/types';

const LENGTHS = [
  { value: 25, label: '25 words' },
  { value: 40, label: '40 words' },
  { value: 60, label: '60 words' },
];

export default function RaceLobby() {
  useDocumentTitle('Race — Baud');
  const user = useSession((s) => s.user);
  const navigate = useNavigate();

  const [wordCount, setWordCount] = useState(40);
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [history, setHistory] = useState<Array<{ race: Race; me: RaceParticipant; field: RaceParticipant[] }> | null>(
    null,
  );

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setHistory(await data().listRaceHistory(user.id));
  }, [user]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const create = async () => {
    setCreating(true);
    try {
      const race = await data().createRace(wordCount);
      navigate(`/race/${race.code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the race.');
    } finally {
      setCreating(false);
    }
  };

  const join = async (event: FormEvent) => {
    event.preventDefault();
    const clean = code.trim().toUpperCase().replace(/^RACE-/, '');
    if (!/^[A-Z0-9]{4}$/.test(clean)) {
      setJoinError('Codes are four characters, like 8K2F.');
      return;
    }
    const race = await data().getRaceByCode(clean);
    if (!race) {
      setJoinError('No race with that code. Check it with whoever sent it.');
      return;
    }
    if (race.status === 'expired') {
      setJoinError('That race expired. Ask for a new code.');
      return;
    }
    navigate(`/race/${clean}`);
  };

  return (
    <div className="measure px-4 pb-20 pt-10 sm:px-6">
      <p className="gutter-label mb-3">Race</p>
      <h1 className="max-w-xl font-display text-2xl leading-tight tracking-[-0.05em]">
        Private races. One code, four characters, everyone on the same start.
      </h1>

      <Band label="Create">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className="gutter-label mb-2">Length</p>
            <Segmented label="Race length" value={wordCount} onChange={setWordCount} options={LENGTHS} />
          </div>
          <Button variant="primary" onClick={create} disabled={creating}>
            {creating ? 'Creating' : 'Race a friend'}
          </Button>
        </div>
        <p className="mt-4 max-w-lg text-sm text-mute">
          You get a code to share. Everyone types the same passage, derived from the same seed — the
          text itself never travels, so nobody can be handed an easier one.
        </p>
      </Band>

      <Band label="Join">
        <form onSubmit={join} className="flex max-w-sm flex-wrap items-end gap-3" noValidate>
          <div className="flex-1">
            <Field
              label="Invite code"
              value={code}
              error={joinError}
              placeholder="8K2F"
              maxLength={9}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
                setJoinError(null);
              }}
            />
          </div>
          <Button type="submit">Join</Button>
        </form>
      </Band>

      <Band label="Past races">
        {history === null ? (
          <LoadingRows rows={3} />
        ) : history.length === 0 ? (
          <EmptyState
            title="No races yet."
            body="Create one and send the code to a friend. Races you finish are listed here with the whole field."
          />
        ) : (
          <ul>
            {history.map(({ race, me, field }) => (
              <li key={race.id} className="border-t border-rule py-4 first:border-t-0">
                <div className="flex flex-wrap items-center gap-3">
                  <Tag tone={me.place === 1 ? 'signal' : 'default'}>
                    {me.place === 1 ? 'won' : `#${me.place ?? '—'}`}
                  </Tag>
                  <span className="font-mono text-xs text-mute">RACE-{race.code}</span>
                  <span className="tnum text-sm">{me.wpm.toFixed(1)} wpm</span>
                  <span className="tnum text-sm text-mute">{me.accuracy.toFixed(0)}%</span>
                  <span className="text-tick text-mute">
                    {new Date(race.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3">
                  {field.map((player) => (
                    <span key={player.userId} className="flex items-center gap-1.5 text-tick text-mute">
                      <Avatar seed={player.avatarSeed} size={16} username={player.username} />
                      {player.username}
                      <span className="tnum">{player.wpm.toFixed(0)}</span>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Band>
    </div>
  );
}
