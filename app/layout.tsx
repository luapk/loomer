import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Loomer',
  description: 'Storyboard-to-stills pipeline',
};

function LoomerMark() {
  return (
    <span
      style={{
        fontFamily: "'Italiana', Georgia, serif",
        fontSize: 26,
        fontWeight: 400,
        letterSpacing: '0.04em',
        lineHeight: 1,
      }}
    >
      Loomer
    </span>
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
                <a href="/?how=1" className="text-[var(--ink-low)] hover:text-[var(--ink)] transition-colors">
                  How it works
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
