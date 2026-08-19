import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, Band, Button, EmptyState, ErrorPanel, LinkButton, LoadingRows, Stat, Tag, cn } from '@/components/ui';
import { LineChart } from '@/components/chart/LineChart';
import { useAsync, useCopy, useDocumentTitle } from '@/hooks';
import { data } from '@/lib/data';
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toast';
import { decimate, seriesByDay } from '@/lib/analytics/aggregate';
import { formatLongDuration } from '@/lib/typing/metrics';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';
import type { ProfileStats, User } from '@/lib/data/types';
import type { TestResult } from '@/lib/typing/types';

interface ProfileData {
  user: User;
  stats: ProfileStats;
  tests: TestResult[];
  achievements: Set<string>;
  friends: User[];
}

export default function Profile() {
  const { username = '' } = useParams();
  useDocumentTitle(`${username} — Baud`);
  const me = useSession((s) => s.user);
  const [, copy] = useCopy();

  const state = useAsync<ProfileData | null>(
    async () => {
      const user = await data().getProfileByUsername(username);
      if (!user) return null;
      const [stats, tests, achievements, friends] = await Promise.all([
        data().getProfileStats(user.id),
        data().listTests(user.id, 200),
        data().listAchievements(user.id),
        data().listFriends(user.id),
      ]);
      return { user, stats, tests, achievements: new Set(achievements.map((a) => a.key)), friends };
    },
    [username],
    (value) => value === null,
  );

  const days = useMemo(
    () => (state.status === 'ready' && state.data ? decimate(seriesByDay(state.data.tests)) : []),
    [state],
  );

  if (state.status === 'loading') {
    return (
      <div className="measure px-4 py-12 sm:px-6">
        <LoadingRows rows={5} />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="measure px-4 py-12 sm:px-6">
        <ErrorPanel message={state.error} onRetry={state.retry} />
      </div>
    );
  }

  if (state.status === 'empty' || !state.data) {
    return (
      <div className="measure px-4 py-16 sm:px-6">
        <p className="gutter-label mb-3">Profile</p>
        <EmptyState
          title={`No account called “${username}”.`}
          body="Usernames are lowercase letters, numbers and underscores. Check the spelling, or look them up in Friends."
          action={<LinkButton to="/friends" variant="primary">Search people</LinkButton>}
        />
      </div>
    );
  }

  const { user, stats, tests, achievements, friends } = state.data;
  const isMe = me?.id === user.id;
  const recent = tests.slice(0, 8);

  return (
    <div className="measure px-4 pb-20 pt-10 sm:px-6">
      <header className="flex flex-wrap items-start gap-5">
        <Avatar seed={user.avatarSeed} size={64} username={user.username} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl tracking-[-0.05em]">{user.username}</h1>
          {user.bio ? (
            <p className="mt-2 max-w-lg text-sm text-dim">{user.bio}</p>
          ) : (
            <p className="mt-2 text-sm text-mute">
              {isMe ? 'No bio yet — add one in settings.' : 'No bio.'}
            </p>
          )}
          <p className="mt-2 text-tick text-mute">
            Joined {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            small
            onClick={async () => {
              const ok = await copy(`${window.location.origin}/profile/${user.username}`);
              if (ok) toast.success('Profile link copied.');
              else toast.error('Could not reach the clipboard.');
            }}
          >
            Share profile
          </Button>
          {isMe ? (
            <LinkButton to="/settings" small>
              Edit
            </LinkButton>
          ) : me ? (
            <Button
              small
              variant="primary"
              onClick={async () => {
                try {
                  await data().sendFriendRequest(user.id);
                  toast.success(`Request sent to ${user.username}.`);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Could not send that request.');
                }
              }}
            >
              Add friend
            </Button>
          ) : null}
        </div>
      </header>

      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-7 border-t border-rule py-8 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Best WPM" value={Math.round(stats.bestWpm)} tone="signal" />
        <Stat label="Average WPM" value={stats.avgWpm.toFixed(1)} />
        <Stat label="Accuracy" value={`${stats.avgAccuracy.toFixed(1)}%`} />
        <Stat label="Tests" value={stats.tests} />
        <Stat label="Typing time" value={formatLongDuration(stats.typingSeconds)} />
        <Stat label="Streak" value={stats.streak} unit={stats.streak === 1 ? 'day' : 'days'} />
      </div>

      <Band label="Pace">
        {days.length >= 2 ? (
          <LineChart
            ariaLabel={`${user.username}'s words per minute by day`}
            labels={days.map((d) => d.label)}
            yUnit=" wpm"
            series={[
              { id: 'avg', label: 'Average', color: 'var(--color-signal)', points: days.map((d) => d.avgWpm), fill: true },
            ]}
          />
        ) : (
          <p className="text-sm text-mute">
            {isMe ? 'Take tests on two separate days and a trend appears here.' : 'Not enough tests yet to plot a trend.'}
          </p>
        )}
      </Band>

      <Band label="Recent">
        {recent.length === 0 ? (
          <EmptyState
            title="No tests yet."
            body={isMe ? 'Your finished tests show up here.' : `${user.username} has not finished a test yet.`}
            action={isMe ? <LinkButton to="/practice" variant="primary">Start typing</LinkButton> : undefined}
          />
        ) : (
          <ul className="font-mono text-xs">
            {recent.map((test) => (
              <li key={test.id} className="flex items-center justify-between border-t border-rule py-2.5 first:border-t-0">
                <span className="text-mute">
                  {test.mode === 'time' ? `${test.target}s` : test.mode === 'words' ? `${test.target}w` : test.mode}
                </span>
                <span className="tnum text-signal">{test.wpm.toFixed(1)} wpm</span>
                <span className="tnum text-mute">{test.accuracy.toFixed(0)}%</span>
                <span className="text-mute">{new Date(test.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Band>

      <Band label="Achievements">
        <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACHIEVEMENTS.map((achievement) => {
            const earned = achievements.has(achievement.key);
            return (
              <li
                key={achievement.key}
                className={cn('flex items-baseline gap-3 border-t border-rule py-2.5', !earned && 'opacity-40')}
              >
                <Tag tone={earned ? 'signal' : 'default'}>{earned ? 'earned' : 'locked'}</Tag>
                <span className="min-w-0">
                  <span className="block text-sm text-paper">{achievement.title}</span>
                  <span className="block text-tick text-mute">{achievement.description}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Band>

      <Band label="Friends">
        {friends.length === 0 ? (
          <p className="text-sm text-mute">
            {isMe ? 'No friends yet. Search for someone on the Friends page.' : 'No friends listed.'}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-4">
            {friends.map((friend) => (
              <li key={friend.id}>
                <Link
                  to={`/profile/${friend.username}`}
                  className="flex items-center gap-2 font-mono text-xs text-mute hover:text-signal"
                >
                  <Avatar seed={friend.avatarSeed} size={20} username={friend.username} />
                  {friend.username}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Band>
    </div>
  );
}
