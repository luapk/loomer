'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * Catches render errors in the root layout — the one class of failure that
 * never reaches the server SDK. Must render its own <html>/<body>.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Georgia, serif', background: '#faf9f7', color: '#1c1917' }}>
        <div style={{ maxWidth: 480, margin: '18vh auto', padding: '0 24px' }}>
          <h1 style={{ fontSize: 28, lineHeight: 1.1, margin: 0 }}>Something broke.</h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#57534e' }}>
            The error has been reported. Reloading usually clears it — your storyboards are saved.
          </p>
          <a
            href="/list"
            style={{
              display: 'inline-block', marginTop: 8, background: '#1c1917', color: '#fff',
              padding: '10px 18px', borderRadius: 8, textDecoration: 'none', fontSize: 13,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            Back to projects
          </a>
        </div>
      </body>
    </html>
  );
}
