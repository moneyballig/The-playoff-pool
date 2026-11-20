import { useState } from 'react';
import { AuthProvider } from '@/lib/auth';
import Nav, { type PageId } from '@/components/Nav';
import Home from '@/pages/Home';
import BracketPage from '@/pages/BracketPage';
import AuthModal, { JoinPoolModal } from '@/components/Modals';
import { Trophy, CalendarDays, ListOrdered, FileText, ShieldCheck } from 'lucide-react';

function PlaceholderPage({ page }: { page: PageId }) {
  const content: Record<string, { title: string; body: string; icon: typeof Trophy }> = {
    entries: { title: 'My Entries', body: 'Your two bracket entries will appear here after you sign in and join the private pool.', icon: FileText },
    leaderboard: { title: 'Leaderboard', body: 'Standings and points will appear here once pool entries and game results are available.', icon: ListOrdered },
    schedule: { title: 'NFL Playoff Schedule', body: 'The postseason schedule and game status will appear here when the pool administrator loads the season schedule.', icon: CalendarDays },
    admin: { title: 'Pool Administration', body: 'Pool management tools are available to the designated administrator after backend setup.', icon: ShieldCheck },
    join: { title: 'Join the Pool', body: 'Sign in and enter your private invitation code to participate.', icon: Trophy },
  };
  const item = content[page] ?? content.entries;
  const Icon = item.icon;
  return (
    <main className="mx-auto max-w-4xl px-4 py-20">
      <section className="rounded-2xl border border-white/10 bg-card-sheen px-6 py-14 text-center shadow-card">
        <Icon className="mx-auto mb-4 h-10 w-10 text-gold-400" />
        <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide text-white">{item.title}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-txt-secondary">{item.body}</p>
      </section>
    </main>
  );
}

function AppContent() {
  const [page, setPage] = useState<PageId>('home');
  const [authOpen, setAuthOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const openJoin = () => {
    setAuthOpen(false);
    setJoinOpen(true);
  };

  return (
    <div className="min-h-screen bg-navy-950 text-txt-primary">
      <Nav page={page} setPage={setPage} onAuthClick={() => setAuthOpen(true)} />
      {page === 'home' && <Home setPage={setPage} onJoinClick={openJoin} />}
      {page === 'bracket' && <BracketPage bracketId={null} onOpenEntries={() => setPage('entries')} />}
      {page !== 'home' && page !== 'bracket' && <PlaceholderPage page={page} />}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      {joinOpen && <JoinPoolModal onClose={() => setJoinOpen(false)} />}
      <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-txt-muted">
        THE PLAYOFF POOL · Private NFL postseason competition
      </footer>
    </div>
  );
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>;
}
