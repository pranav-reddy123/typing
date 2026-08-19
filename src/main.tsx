import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './index.css';
import { router } from './app/router';
import { Toaster } from './components/ui/Toaster';
import { useSession } from './stores/session';

function App() {
  const boot = useSession((s) => s.boot);
  const status = useSession((s) => s.status);

  useEffect(() => {
    void boot();
  }, [boot]);

  return (
    <>
      {/* The router renders immediately; auth-gated routes wait on `status`. */}
      <RouterProvider router={router} />
      <Toaster />
      <span className="sr-only" aria-live="polite">
        {status === 'ready' ? 'Ready' : 'Loading your session'}
      </span>
    </>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
