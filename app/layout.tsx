import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Loomer',
  description: 'Storyboard-to-stills pipeline',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="min-h-screen flex flex-col">
          <header className="sticky top-0 z-10 glass border-b border-stone-200/60 px-6 py-4">
            <div className="max-w-5xl mx-auto flex items-center justify-between">
              <a href="/" className="font-semibold text-stone-900 tracking-tight text-lg">
                Loomer
              </a>
              <nav className="flex items-center gap-6 text-sm text-stone-500">
                <a href="/list" className="hover:text-stone-900 transition-colors">
                  All storyboards
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
