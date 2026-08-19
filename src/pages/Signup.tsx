import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ErrorPanel, Field } from '@/components/ui';
import { useSession } from '@/stores/session';
import { useDocumentTitle } from '@/hooks';
import { toast } from '@/stores/toast';
import { validateEmail, validatePassword, validateUsername } from '@/lib/data/validate';

export default function Signup() {
  useDocumentTitle('Create an account — Baud');
  const signUp = useSession((s) => s.signUp);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState(false);

  const fieldErrors = {
    email: touched.email ? validateEmail(email) : null,
    username: touched.username ? validateUsername(username) : null,
    password: touched.password ? validatePassword(password) : null,
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched({ email: true, username: true, password: true });
    // Field-level problems are reported inline, beside the field that caused
    // them. The summary panel is reserved for failures the form cannot show.
    if (validateEmail(email) ?? validateUsername(username) ?? validatePassword(password)) {
      setError(null);
      return;
    }

    setPending(true);
    setError(null);
    const message = await signUp(email, username, password);
    setPending(false);
    if (message) {
      setError(message);
      return;
    }
    toast.success('Account created.');
    navigate(next, { replace: true });
  };

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-16 sm:px-6">
      <p className="gutter-label mb-3">Create an account</p>
      <h1 className="font-display text-2xl tracking-[-0.05em]">Start keeping score.</h1>
      <p className="mt-2 text-sm text-mute">
        An account stores your history, unlocks the analysis dashboard, and lets you race friends.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
        {error ? <ErrorPanel message={error} /> : null}

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          error={fieldErrors.email}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          value={username}
          error={fieldErrors.username}
          hint="Lowercase letters, numbers and underscores. This is your public profile URL."
          onBlur={() => setTouched((t) => ({ ...t, username: true }))}
          onChange={(event) => setUsername(event.target.value.toLowerCase())}
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          error={fieldErrors.password}
          hint="At least 8 characters, with a letter and a number."
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? 'Creating account' : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-sm text-mute">
        Already have one?{' '}
        <Link to="/login" className="text-signal hover:underline">
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}
