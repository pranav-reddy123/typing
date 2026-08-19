import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ErrorPanel, Field } from '@/components/ui';
import { useSession } from '@/stores/session';
import { useDocumentTitle } from '@/hooks';
import { toast } from '@/stores/toast';

export default function Login() {
  useDocumentTitle('Sign in — Baud');
  const signIn = useSession((s) => s.signIn);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/dashboard';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const message = await signIn(identifier, password);
    setPending(false);
    if (message) {
      setError(message);
      return;
    }
    toast.success('Signed in.');
    navigate(next, { replace: true });
  };

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-16 sm:px-6">
      <p className="gutter-label mb-3">Sign in</p>
      <h1 className="font-display text-2xl tracking-[-0.05em]">Welcome back.</h1>
      <p className="mt-2 text-sm text-mute">
        Your tests, records and races are waiting where you left them.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
        {error ? <ErrorPanel message={error} /> : null}

        <Field
          label="Username or email"
          name="identifier"
          autoComplete="username"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? 'Signing in' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-sm text-mute">
        No account?{' '}
        <Link to="/signup" className="text-signal hover:underline">
          Create one
        </Link>
        . Tests you have already taken will move across.
      </p>
    </div>
  );
}
