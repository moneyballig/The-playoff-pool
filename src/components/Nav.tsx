import { useState } from 'react';
import { Menu, X, Trophy, LayoutGrid, ListOrdered, CalendarDays, FileText, Shield, User as UserIcon, Ticket } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export type PageId = 'home' | 'bracket' | 'entries' | 'leaderboard' | 'schedule' | 'admin' | 'join';

const NAV_ITEMS: { id: PageId; label: string; icon: typeof Trophy }[] = [
  { id: 'home', label: 'Home', icon: LayoutGrid },
  { id: 'bracket', label: 'Playoff Bracket', icon: Trophy },
  { id: 'entries', label: 'My Entries', icon: FileText },
  { id: 'leaderboard', label: 'Leaderboard', icon: ListOrdered },
  { id: 'schedule', label: 'NFL Playoff Schedule', icon: CalendarDays },
];

interface Props {
  page: PageId;
  setPage: (p: PageId) => void;
  onAuthClick: () => void;
}

export default function Nav({ page, setPage, onAuthClick }: Props) {
  const { user, profile, signOut, isPlatformAdmin, pool } = useAuth();
  const [open, setOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);

  const items = [...NAV_ITEMS];
  if (isPlatformAdmin) items.push({ id: 'admin', label: 'Admin', icon: Shield });

  const go = (p: PageId) => {
    setPage(p);
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#030a18]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <button onClick={() => go('home')} className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-b from-gold-400 to-gold-600 shadow-glow-soft">
            <Trophy className="h-5 w-5 text-navy-950" strokeWidth={2.5} />
          </span>
          <span className="text-left leading-none">
            <span className="block font-display text-lg font-extrabold uppercase tracking-wider text-white">
              The Playoff Pool
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-gold-400">
              NFL Postseason
            </span>
          </span>
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => go(item.id)}
              className={`rounded-lg px-3 py-2 font-display text-sm font-semibold uppercase tracking-wide transition ${
                page === item.id
                  ? 'border border-amber-400/60 bg-amber-400/15 text-amber-200 shadow-glow-soft'
                  : 'text-txt-secondary hover:bg-white/5 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <div className="relative">
              <button
                onClick={() => setUserMenu((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-txt-primary transition hover:bg-white/10"
              >
                <UserIcon className="h-4 w-4 text-gold-400" />
                <span className="hidden max-w-[120px] truncate sm:inline">{profile?.display_name ?? 'Account'}</span>
              </button>
              {userMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenu(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-navy-800 shadow-card">
                    <div className="border-b border-white/10 px-4 py-3">
                      <p className="truncate text-sm font-semibold text-white">{profile?.display_name}</p>
                      <p className="truncate text-xs text-txt-muted">{user.email}</p>
                      {pool && (
                        <p className="mt-1.5 flex items-center gap-1 text-xs text-gold-400">
                          <Ticket className="h-3 w-3" /> {pool.name}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setUserMenu(false);
                        signOut();
                      }}
                      className="block w-full px-4 py-2.5 text-left text-sm text-txt-secondary transition hover:bg-white/5 hover:text-white"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={onAuthClick}
              className="rounded-lg bg-gradient-to-b from-gold-400 to-gold-600 px-4 py-2 font-display text-sm font-bold uppercase tracking-wider text-navy-950 shadow-glow-soft transition hover:brightness-110"
            >
              Sign in
            </button>
          )}
          <button
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-txt-secondary md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-white/10 bg-navy-950/95 px-4 py-3 md:hidden">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => go(item.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 font-display text-base font-semibold uppercase tracking-wide transition ${
                page === item.id ? 'bg-white/10 text-gold-400' : 'text-txt-secondary hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
