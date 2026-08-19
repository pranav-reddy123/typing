import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './Layout';
import { ErrorBoundary } from './ErrorBoundary';
import { LoadingRows } from '@/components/ui';
import { useSession } from '@/stores/session';
import Home from '@/pages/Home';
import Practice from '@/pages/Practice';

/* Everything beyond the front door is lazy. */
const Login = lazy(() => import('@/pages/Login'));
const Signup = lazy(() => import('@/pages/Signup'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const History = lazy(() => import('@/pages/History'));
const Friends = lazy(() => import('@/pages/Friends'));
const RaceLobby = lazy(() => import('@/pages/RaceLobby'));
const RaceRoom = lazy(() => import('@/pages/RaceRoom'));
const Leaderboard = lazy(() => import('@/pages/Leaderboard'));
const Profile = lazy(() => import('@/pages/Profile'));
const Settings = lazy(() => import('@/pages/Settings'));
const NotFound = lazy(() => import('@/pages/NotFound'));

function Loading() {
  return (
    <div className="measure px-4 py-12 sm:px-6">
      <LoadingRows rows={5} />
    </div>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const location = useLocation();

  if (status === 'booting') return <Loading />;
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    element: (
      <ErrorBoundary>
        <Layout />
      </ErrorBoundary>
    ),
    children: [
      { path: '/', element: <Home /> },
      { path: '/practice', element: <Practice /> },
      { path: '/login', element: <Page><Login /></Page> },
      { path: '/signup', element: <Page><Signup /></Page> },
      { path: '/leaderboard', element: <Page><Leaderboard /></Page> },
      { path: '/profile/:username', element: <Page><Profile /></Page> },
      {
        path: '/dashboard',
        element: <Page><RequireAuth><Dashboard /></RequireAuth></Page>,
      },
      { path: '/history', element: <Page><RequireAuth><History /></RequireAuth></Page> },
      { path: '/friends', element: <Page><RequireAuth><Friends /></RequireAuth></Page> },
      { path: '/race', element: <Page><RequireAuth><RaceLobby /></RequireAuth></Page> },
      { path: '/race/:code', element: <Page><RequireAuth><RaceRoom /></RequireAuth></Page> },
      { path: '/settings', element: <Page><RequireAuth><Settings /></RequireAuth></Page> },
      { path: '*', element: <Page><NotFound /></Page> },
    ],
  },
]);
