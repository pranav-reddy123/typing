import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Wordmark } from '@/components/brand/Logo';
import { Avatar, cn, LinkButton } from '@/components/ui';
import { useSession } from '@/stores/session';

const NAV = [
  { to: '/practice', label: 'Type' },
  { to: '/race', label: 'Race' },
  { to: '/dashboard', label: 'Analysis' },
  { to: '/history', label: 'History' },
  { to: '/friends', label: 'Friends' },
  { to: '/leaderboard', label: 'Ranks' },
];

export function Layout() {
  const user = useSession((s) => s.user);
  const { pathname } = useLocation();
  /** The typing surface owns the whole viewport; nothing else may distract. */
  const focusMode = pathname === '/practice' || pathname.startsWith('/race/');

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-signal focus:px-3 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>

      <header
        className={cn(
          'sticky top-0 z-40 border-b border-rule bg-ink/90 backdrop-blur-sm transition-opacity',
          focusMode && 'opacity-60 hover:opacity-100 focus-within:opacity-100',
        )}
      >
        <div className="measure flex h-14 items-center gap-6 px-4 sm:px-6">
          <NavLink to="/" className="shrink-0" aria-label="Baud home">
            <Wordmark />
          </NavLink>

          <nav aria-label="Main" className="min-w-0 flex-1 overflow-x-auto">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'block rounded-[var(--radius-tag)] px-2.5 py-1.5 font-mono text-xs transition-colors duration-[var(--t-fast)]',
                        isActive ? 'text-signal' : 'text-mute hover:text-paper',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          {user ? (
            <NavLink
              to={`/profile/${user.username}`}
              className="flex shrink-0 items-center gap-2 text-xs text-mute transition-colors hover:text-paper"
            >
              <Avatar seed={user.avatarSeed} size={24} username={user.username} />
              <span className="hidden font-mono sm:inline">{user.username}</span>
            </NavLink>
          ) : (
            <LinkButton to="/login" small variant="ghost" className="shrink-0">
              Sign in
            </LinkButton>
          )}
        </div>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      {!focusMode && (
        <footer className="border-t border-rule">
          <div className="measure flex flex-wrap items-center justify-between gap-3 px-4 py-6 text-tick text-mute sm:px-6">
            <p>
              Baud — a typing instrument. Every number here comes from tests you actually took.
            </p>
            <NavLink to="/settings" className="hover:text-paper">
              Settings
            </NavLink>
          </div>
        </footer>
      )}
    </div>
  );
}
