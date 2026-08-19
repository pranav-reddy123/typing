import { LinkButton } from '@/components/ui';
import { useDocumentTitle } from '@/hooks';

export default function NotFound() {
  useDocumentTitle('Not found — Baud');

  return (
    <div className="measure px-4 py-24 sm:px-6">
      <p className="gutter-label mb-3">404</p>
      <h1 className="font-display text-3xl tracking-[-0.05em]">No signal on this route.</h1>
      <p className="mt-3 max-w-md text-sm text-mute">
        That page does not exist. The typing surface is where most things start.
      </p>
      <div className="mt-8 flex gap-3">
        <LinkButton to="/practice" variant="primary">
          Start typing
        </LinkButton>
        <LinkButton to="/">Home</LinkButton>
      </div>
    </div>
  );
}
