import { redirect } from 'next/navigation';
import { getSession } from '@/src/lib/auth';
import { NavMenu } from './NavMenu';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  return (
    <>
      <NavMenu email={session.email} isAdmin={session.role === 'ADMIN'} />
      {children}
    </>
  );
}
