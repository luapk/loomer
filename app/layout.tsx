import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Loomer',
  description: 'Storyboard-to-stills pipeline',
};

function LoomerMark() {
  return (
    <div className="inline-flex items-center gap-1.5">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="0" stroke="currentColor" strokeWidth="1.5" />
        <rect x="6" y="6" width="12" height="12" rx="0" stroke="currentColor" strokeWidth="1.5" />
        <line x1="2" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5" />
        <line x1="2" y1="16" x2="6" y2="16" stroke="currentColor" strokeWidth="1.5" />
        <line x1="18" y1="8" x2="22" y2="8" stroke="currentColor" strokeWidth="1.5" />
        <line x1="18" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
        }}
      >
        Loomer
      </span>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="min-h-screen flex flex-col">
          <header
            className="sticky top-0 z-10 bg-[var(--paper)] px-14 py-4"
            style={{ borderBottom: '1px solid var(--ink)' }}
          >
            <div className="max-w-5xl mx-auto flex items-center justify-between">
              <a href="/" className="text-[var(--ink)] hover:opacity-70 transition-opacity">
                <LoomerMark />
              </a>
              <nav
                className="flex items-center gap-9"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                }}
              >
                <a href="/list" className="text-[var(--ink-low)] hover:text-[var(--ink)] transition-colors">
                  Archive
                </a>
              </nav>
            </div>
          </header>
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
