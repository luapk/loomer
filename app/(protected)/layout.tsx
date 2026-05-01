import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const password = process.env.LOOMER_PASSWORD;

  if (password) {
    const authCookie = cookieStore.get('loomer-auth');
    if (authCookie?.value !== password) {
      redirect('/login');
    }
  }

  return <>{children}</>;
}
