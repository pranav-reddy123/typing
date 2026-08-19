import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Band, Button, Dialog, Field, Toggle, Segmented } from '@/components/ui';
import { ConfigBar } from '@/components/typing/ConfigBar';
import { useDocumentTitle } from '@/hooks';
import { useSession } from '@/stores/session';
import { useConfig } from '@/stores/config';
import { data, hasRemote } from '@/lib/data';
import { toast } from '@/stores/toast';
import { validateBio } from '@/lib/data/validate';
import { randomSeed } from '@/lib/typing/rng';

export default function Settings() {
  useDocumentTitle('Settings — Baud');
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const signOut = useSession((s) => s.signOut);
  const config = useConfig((s) => s.config);
  const update = useConfig((s) => s.update);
  const navigate = useNavigate();

  const [bio, setBio] = useState(user?.bio ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const bioError = validateBio(bio);

  const save = async () => {
    if (bioError) return;
    setSaving(true);
    try {
      setUser(await data().updateProfile({ displayName, bio }));
      toast.success('Profile saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const reroll = async () => {
    try {
      setUser(await data().updateProfile({ avatarSeed: randomSeed() }));
      toast.success('New avatar.');
    } catch {
      toast.error('Could not change your avatar.');
    }
  };

  return (
    <div className="measure px-4 pb-20 pt-10 sm:px-6">
      <p className="gutter-label mb-3">Settings</p>
      <h1 className="font-display text-2xl tracking-[-0.05em]">
        {user ? user.username : 'Your account'}
      </h1>

      <Band label="Test defaults">
        <p className="mb-5 max-w-lg text-sm text-mute">
          These are the settings a new test starts with. They are saved as you change them, here or on
          the typing surface.
        </p>
        <ConfigBar config={config} onChange={update} />

        <div className="mt-6 max-w-xl">
          <Field
            label="Custom text"
            value={config.customText}
            onChange={(event) => update({ customText: event.target.value })}
            hint="Used by custom mode. Paste anything you want to drill."
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-6">
          <Segmented
            label="Language"
            value={config.language}
            onChange={(language) => update({ language })}
            options={[{ value: 'english', label: 'English' }]}
          />
          <Toggle
            label="punctuation by default"
            checked={config.punctuation}
            onChange={(punctuation) => update({ punctuation })}
          />
        </div>
      </Band>

      <Band label="Profile">
        {user ? (
          <div className="max-w-md space-y-5">
            <Field
              label="Display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={40}
            />
            <Field
              label="Bio"
              value={bio}
              error={bioError}
              hint={`${bio.length}/160`}
              onChange={(event) => setBio(event.target.value)}
              maxLength={160}
            />
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onClick={save} disabled={saving || Boolean(bioError)}>
                {saving ? 'Saving' : 'Save profile'}
              </Button>
              <Button onClick={reroll}>New avatar</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-mute">Sign in to edit your profile.</p>
        )}
      </Band>

      <Band label="Storage">
        <p className="max-w-xl text-sm text-mute">
          {hasRemote
            ? 'Your results are stored in Postgres under row-level security — only you and the friends you accept can read them.'
            : 'This build runs against local storage: your account, tests and races live in IndexedDB in this browser and never leave the device. Passwords are hashed with PBKDF2 even locally.'}
        </p>
      </Band>

      <Band label="Account">
        {user ? (
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={async () => {
                await signOut();
                toast.info('Signed out.');
                navigate('/');
              }}
            >
              Sign out
            </Button>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete account
            </Button>
          </div>
        ) : (
          <p className="text-sm text-mute">You are not signed in.</p>
        )}
      </Band>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete your account">
        <p className="text-sm text-mute">
          This removes your profile, every test you have taken and your records. It cannot be undone.
        </p>
        <div className="mt-6 flex gap-3">
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await data().deleteAccount();
                toast.info('Account deleted.');
                navigate('/');
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Could not delete the account.');
              }
            }}
          >
            Delete everything
          </Button>
          <Button variant="quiet" onClick={() => setConfirmDelete(false)}>
            Keep my account
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
