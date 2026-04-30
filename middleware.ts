import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Paths that bypass the password gate
const PUBLIC_PATHS = ['/api/auth', '/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow /share/* routes (public read-only storyboards — Session 5)
  if (pathname.startsWith('/share/')) {
    return NextResponse.next();
  }

  const password = process.env.LOOMER_PASSWORD;
  if (!password) {
    // No password configured — allow all (useful for local dev without setup)
    return NextResponse.next();
  }

  const authCookie = request.cookies.get('loomer-auth');
  if (authCookie?.value === password) {
    return NextResponse.next();
  }

  // Redirect to login, preserving the intended destination
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Match everything except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
