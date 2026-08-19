import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui';

interface State {
  error: Error | null;
}

/** A recoverable panel, never a white screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error in render tree', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="measure px-4 py-24 sm:px-6">
        <p className="gutter-label mb-3">Something broke</p>
        <h1 className="font-display text-2xl tracking-[-0.04em]">This screen failed to render.</h1>
        <p className="mt-3 max-w-md text-sm text-mute">
          The rest of the app is fine. Reload this page, or go back to the typing surface — your
          results are stored and nothing was lost.
        </p>
        <pre className="mt-6 max-w-full overflow-x-auto border border-rule bg-slab p-4 font-mono text-tick text-mute">
          {this.state.error.message}
        </pre>
        <div className="mt-6 flex gap-3">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Button onClick={() => this.setState({ error: null })}>Dismiss</Button>
        </div>
      </div>
    );
  }
}
