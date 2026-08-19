import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Band, Button, EmptyState, ErrorPanel, Field, LoadingRows } from '@/components/ui';
import { useDocumentTitle } from '@/hooks';
import { data } from '@/lib/data';
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toast';
import type { FriendRequest, ProfileStats, User } from '@/lib/data/types';

interface FriendView {
  user: User;
  stats: ProfileStats;
}

export default function Friends() {
  useDocumentTitle('Friends — Baud');
  const me = useSession((s) => s.user);

  const [friends, setFriends] = useState<FriendView[] | null>(null);
  const [incoming, setIncoming] = useState<Array<{ request: FriendRequest; user: User }>>([]);
  const [outgoing, setOutgoing] = useState<Array<{ request: FriendRequest; user: User }>>([]);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[] | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    setError(null);
    try {
      const list = await data().listFriends(me.id);
      const withStats = await Promise.all(
        list.map(async (user) => ({ user, stats: await data().getProfileStats(user.id) })),
      );
      setFriends(withStats);

      const requests = await data().listFriendRequests(me.id);
      const resolve = async (items: FriendRequest[], field: 'fromUser' | 'toUser') => {
        const out: Array<{ request: FriendRequest; user: User }> = [];
        for (const request of items) {
          const user = await data().getProfileById(request[field]);
          if (user) out.push({ request, user });
        }
        return out;
      };

      setIncoming(await resolve(requests.incoming, 'fromUser'));
      setOutgoing(await resolve(requests.outgoing, 'toUser'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your friends.');
    }
  }, [me]);

  useEffect(() => {
    void load();
  }, [load]);

  const search = async (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      setResults(await data().searchUsers(value));
    } finally {
      setSearching(false);
    }
  };

  const act = async (fn: () => Promise<void>, message: string) => {
    try {
      await fn();
      toast.success(message);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'That did not work.');
    }
  };

  if (error) {
    return (
      <div className="measure px-4 py-10 sm:px-6">
        <ErrorPanel message={error} onRetry={() => void load()} />
      </div>
    );
  }

  return (
    <div className="measure px-4 pb-20 pt-10 sm:px-6">
      <p className="gutter-label mb-3">Friends</p>
      <h1 className="font-display text-2xl tracking-[-0.05em]">
        {friends === null ? 'Loading' : `${friends.length} friend${friends.length === 1 ? '' : 's'}`}
      </h1>

      <Band label="Find people">
        <div className="max-w-sm">
          <Field
            label="Search by username"
            value={query}
            onChange={(event) => void search(event.target.value)}
            placeholder="at least two characters"
          />
        </div>

        <div className="mt-5">
          {searching ? (
            <LoadingRows rows={2} />
          ) : results === null ? (
            <p className="text-sm text-mute">Type a username to look someone up.</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-mute">No accounts match “{query}”.</p>
          ) : (
            <ul>
              {results.map((user) => (
                <li key={user.id} className="flex items-center gap-3 border-t border-rule py-3">
                  <Avatar seed={user.avatarSeed} username={user.username} />
                  <Link to={`/profile/${user.username}`} className="flex-1 font-mono text-sm hover:text-signal">
                    {user.username}
                  </Link>
                  <Button
                    small
                    onClick={() =>
                      act(() => data().sendFriendRequest(user.id), `Request sent to ${user.username}.`)
                    }
                  >
                    Add friend
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Band>

      {incoming.length > 0 && (
        <Band label="Requests">
          <ul>
            {incoming.map(({ request, user }) => (
              <li key={request.id} className="flex items-center gap-3 border-t border-rule py-3 first:border-t-0">
                <Avatar seed={user.avatarSeed} username={user.username} />
                <span className="flex-1 font-mono text-sm">{user.username}</span>
                <Button
                  small
                  variant="primary"
                  onClick={() =>
                    act(() => data().respondToFriendRequest(request.id, true), `You and ${user.username} are now friends.`)
                  }
                >
                  Accept
                </Button>
                <Button
                  small
                  variant="quiet"
                  onClick={() => act(() => data().respondToFriendRequest(request.id, false), 'Request declined.')}
                >
                  Decline
                </Button>
              </li>
            ))}
          </ul>
        </Band>
      )}

      {outgoing.length > 0 && (
        <Band label="Sent">
          <ul className="text-sm text-mute">
            {outgoing.map(({ request, user }) => (
              <li key={request.id} className="border-t border-rule py-3 first:border-t-0">
                Waiting on <span className="font-mono text-paper">{user.username}</span>.
              </li>
            ))}
          </ul>
        </Band>
      )}

      <Band label="Your friends">
        {friends === null ? (
          <LoadingRows rows={3} />
        ) : friends.length === 0 ? (
          <EmptyState
            title="No friends yet."
            body="Search for someone above, or send them a race code — accepting a race does not need a friendship, but comparing records does."
          />
        ) : (
          <ul>
            {friends.map(({ user, stats }) => (
              <li
                key={user.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-rule py-4 first:border-t-0 sm:grid-cols-[auto_1fr_repeat(3,5rem)_auto]"
              >
                <Avatar seed={user.avatarSeed} size={36} username={user.username} />
                <div className="min-w-0">
                  <Link to={`/profile/${user.username}`} className="block truncate font-mono text-sm hover:text-signal">
                    {user.username}
                  </Link>
                  <span className="text-tick text-mute sm:hidden">
                    {Math.round(stats.bestWpm)} best · {stats.tests} tests
                  </span>
                </div>
                <span className="hidden text-right sm:block">
                  <span className="gutter-label block">best</span>
                  <span className="tnum text-sm">{Math.round(stats.bestWpm)}</span>
                </span>
                <span className="hidden text-right sm:block">
                  <span className="gutter-label block">avg</span>
                  <span className="tnum text-sm">{Math.round(stats.avgWpm)}</span>
                </span>
                <span className="hidden text-right sm:block">
                  <span className="gutter-label block">tests</span>
                  <span className="tnum text-sm">{stats.tests}</span>
                </span>
                <Button
                  small
                  variant="quiet"
                  onClick={() => act(() => data().removeFriend(user.id), `Removed ${user.username}.`)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Band>
    </div>
  );
}
