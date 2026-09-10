import { getCurrentUser, listDemoUsers } from '@/auth/currentUser';
import { getDb } from '@/db/client';
import { NavLinks, type NavItem } from './NavLinks';
import { PersonaSwitcher } from './PersonaSwitcher';
import { ROLE_LABELS } from './labels';

/** Approvals are a senior's inbox, so an analyst is not offered the tab. */
function navFor(role: string): NavItem[] {
  return [
    { href: '/queue', label: 'Queue' },
    ...(role === 'senior' ? [{ href: '/approvals', label: 'Approvals' }] : []),
    { href: '/policy', label: 'Policy' },
  ];
}

export async function AppHeader() {
  const db = getDb();
  const currentUser = await getCurrentUser(db);
  const personas = listDemoUsers(db).map(({ id, name, role }) => ({ id, name, role }));

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-6 px-4">
        <span className="text-sm font-semibold whitespace-nowrap text-slate-900">
          Fraud Review Queue
        </span>
        <NavLinks items={navFor(currentUser.role)} />
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[11px] text-slate-500 md:block">
            Signed in as {ROLE_LABELS[currentUser.role]}
          </span>
          <PersonaSwitcher personas={personas} current={currentUser} />
        </div>
      </div>
    </header>
  );
}
