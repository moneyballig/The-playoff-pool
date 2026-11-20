import { useEffect, useState } from 'react';
import { Trophy, CalendarDays, ListOrdered, FileText, ShieldCheck, Plus, ChevronRight } from 'lucide-react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { Bracket } from '@/lib/types';
import Nav, { type PageId } from '@/components/Nav';
import Home from '@/pages/Home';
import { LeaderboardPage, SchedulePage, AdminPage } from '@/pages/CompetitionPages';
import BracketPage from '@/pages/BracketPage';
import AuthModal, { JoinPoolModal } from '@/components/Modals';
import { Card, GoldButton, GhostButton, EmptyState, Spinner } from '@/components/ui';

function EntriesPage({ onOpenBracket, onJoin }: { onOpenBracket: (id: string) => void; onJoin: () => void }) {
  const { user, pool } = useAuth();
  const [brackets, setBrackets] = useState<Bracket[]>([]);
  const [pickCounts, setPickCounts] = useState<Record<string,number>>({});
  const [eliminatedCounts, setEliminatedCounts] = useState<Record<string,number>>({});
  const [maxPossible, setMaxPossible] = useState<Record<string,number>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabaseConfigured || !user || !pool) {
        setBrackets([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from('brackets')
        .select('*')
        .eq('pool_id', pool.id)
        .eq('user_id', user.id)
        .order('entry_number');
      if (!active) return;
      if (queryError) setError(queryError.message);
      setBrackets((data as Bracket[]) ?? []);
      if (data?.length) {
        const ids=data.map(b=>b.id);
        const [{data:picks},{data:finals}]=await Promise.all([
          supabase.from('bracket_picks').select('bracket_id,pick_key,team_id').in('bracket_id',ids),
          supabase.from('playoff_games').select('id,winner_team_id').eq('season',pool.season).eq('status','final')
        ]);
        if (!active) return;
        const counts:Record<string,number>={};const losses:Record<string,number>={};
        const finished=new Map((finals??[]).map(g=>[g.id,g.winner_team_id]));
        (picks??[]).forEach(p=>{counts[p.bracket_id]=(counts[p.bracket_id]??0)+1;
          if(finished.has(p.pick_key)&&finished.get(p.pick_key)!==p.team_id)losses[p.bracket_id]=(losses[p.bracket_id]??0)+1;
        });
        setPickCounts(counts);setEliminatedCounts(losses);
        const {data:allGames}=await supabase.from('playoff_games').select('id,round,conference,status,winner_team_id,home_team_id,away_team_id').eq('season',pool.season);
        const {data:allTeams}=await supabase.from('playoff_teams').select('id,seed').eq('season',pool.season);
        if(!active)return;
        const seedMap=new Map((allTeams??[]).map(t=>[t.id,t.seed]));
        const eliminated=new Set<string>();
        const finalKeys=new Set<string>();
        const pointsByRound:Record<string,number>={wild_card:1,divisional:2,conference:4,super_bowl:8};
        for(const g of allGames??[]){
          if(g.status!=='final'||!g.winner_team_id)continue;
          const key=g.round==='wild_card'?g.id:g.round==='divisional'
            ?'div-'+g.conference+'-'+(seedMap.get(g.home_team_id??'')===1||seedMap.get(g.away_team_id??'')===1?'1':'2')
            :g.round==='conference'?'conf-'+g.conference:'sb';
          finalKeys.add(key);
          if(g.home_team_id&&g.home_team_id!==g.winner_team_id)eliminated.add(g.home_team_id);
          if(g.away_team_id&&g.away_team_id!==g.winner_team_id)eliminated.add(g.away_team_id);
        }
        const possible:Record<string,number>={};
        for(const entry of data){
          let ceiling=entry.total_points;
          for(const p of (picks??[]).filter(p=>p.bracket_id===entry.id)){
            if(finalKeys.has(p.pick_key)||eliminated.has(p.team_id))continue;
            const round=p.pick_key.startsWith('div-')?'divisional':p.pick_key.startsWith('conf-')?'conference':p.pick_key==='sb'?'super_bowl':'wild_card';
            ceiling+=pointsByRound[round];
          }
          possible[entry.id]=ceiling;
        }
        setMaxPossible(possible);
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [user, pool]);

  const renameBracket = async (bracket: Bracket) => {
    if (pool?.deadline && Date.now() >= new Date(pool.deadline).getTime()) return;
    const name = window.prompt('Name your bracket', bracket.name)?.trim();
    if (!name || name === bracket.name || name.length > 50) return;
    const { error: renameError } = await supabase.from('brackets').update({name}).eq('id',bracket.id).eq('user_id',user!.id);
    if (renameError) setError(renameError.message);
    else setBrackets(current=>current.map(b=>b.id===bracket.id?{...b,name}:b));
  };

  const createBracket = async () => {
    if (!user || !pool || brackets.length >= 2 || creating) return;
    setCreating(true);
    setError('');
    const nextNumber = brackets.length === 0 ? 1 : 2;
    const { data: createdId, error: insertError } = await supabase.rpc('pp_create_bracket', {
      p_pool: pool.id, p_entry: nextNumber, p_name: `Bracket ${nextNumber}`
    });
    if (insertError) setError(insertError.message);
    else if (createdId) {
      const { data: created, error: fetchError } = await supabase.from('brackets').select('*').eq('id',createdId).single();
      if (fetchError) setError(fetchError.message);
      else if (created) {setBrackets(current=>[...current,created as Bracket]);onOpenBracket(created.id);}
    }
    setCreating(false);
  };

  if (!supabaseConfigured) {
    return <main className="mx-auto max-w-4xl px-4 py-12"><EmptyState title="Pool setup still needed" body="The website interface is connected, but secure accounts, invitations, and saved brackets need the Supabase backend credentials. This is a one-time owner setup." /></main>;
  }
  if (!user) {
    return <main className="mx-auto max-w-4xl px-4 py-12"><EmptyState title="Sign in to view your entries" body="Create an account or sign in, then join the private pool with your invitation code." action={<GoldButton onClick={onJoin}>Sign in / Join</GoldButton>} /></main>;
  }
  if (!pool) {
    return <main className="mx-auto max-w-4xl px-4 py-12"><EmptyState title="Join the private pool" body="Enter the invitation code from your pool organizer to create your playoff entries." action={<GoldButton onClick={onJoin}>Enter invitation code</GoldButton>} /></main>;
  }
  if (loading) return <Spinner label="Loading your entries…" />;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-400">Your competition</p><h1 className="mt-1 font-display text-3xl font-extrabold uppercase text-white">My Entries</h1><p className="mt-1 text-sm text-txt-secondary">Create up to two independent playoff brackets.</p></div>
        <GoldButton onClick={createBracket} disabled={brackets.length >= 2 || creating}><Plus className="h-4 w-4" />{creating ? 'Creating…' : brackets.length >= 2 ? '2 of 2 created' : 'Create bracket'}</GoldButton>
      </div>
      {error && <p className="mb-4 rounded-lg border border-livered/30 bg-livered/10 px-4 py-3 text-sm text-livered">{error}</p>}
      {brackets.length === 0 ? <EmptyState title="No brackets yet" body="Create your first bracket to start making your 13 playoff picks." action={<GoldButton onClick={createBracket} disabled={creating}><Plus className="h-4 w-4" />Create first bracket</GoldButton>} /> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {brackets.map((bracket) => (
            <Card key={bracket.id} className="p-5">
              <div className="flex items-center justify-between"><span className="rounded-lg bg-gold-400/10 p-2 text-gold-400"><Trophy className="h-5 w-5" /></span><span className="text-xs font-semibold uppercase tracking-wider text-txt-muted">{bracket.submitted ? 'Submitted' : bracket.frozen ? 'Locked' : 'Draft'}</span></div>
              <h2 className="mt-4 font-display text-xl font-bold uppercase text-white">{bracket.name}</h2>
              {(!pool?.deadline || Date.now() < new Date(pool.deadline).getTime()) && <button type="button" onClick={()=>void renameBracket(bracket)} className="mt-1 text-xs text-gold-400 underline underline-offset-2 hover:text-gold-300">Rename bracket</button>}
              <p className="mt-1 text-sm text-txt-secondary">{bracket.total_points} points · {bracket.correct_picks} correct picks {bracket.rank?` · Rank #${bracket.rank}`:''}</p>
               <div className="mt-4"><div className="mb-1.5 flex justify-between text-[11px] font-semibold text-txt-secondary"><span>Predictions saved</span><span>{pickCounts[bracket.id]??0}/13</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gold-400 transition-all" style={{width:Math.min(100,(pickCounts[bracket.id]??0)/13*100)+'%'}}/></div></div>
               {bracket.submitted && <p className="mt-3 text-xs text-txt-secondary">{eliminatedCounts[bracket.id]??0} confirmed incorrect picks from finalized games · {bracket.correct_picks} correct</p>}
               {bracket.submitted && <p className="mt-1 text-xs text-gold-400">Maximum possible points: {maxPossible[bracket.id]??bracket.total_points} (based on remaining viable picks)</p>}
              <div className="mt-5"><GoldButton className="w-full" onClick={() => onOpenBracket(bracket.id)}><FileText className="h-4 w-4" />{bracket.submitted && (!pool?.deadline || Date.now() < new Date(pool.deadline).getTime()) ? 'Edit submitted bracket' : bracket.submitted ? 'View bracket' : 'Open bracket'}<ChevronRight className="h-4 w-4" /></GoldButton></div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}

function InfoPage({ page }: { page: PageId }) {
  if (page === 'leaderboard') return <LeaderboardPage />;
  if (page === 'schedule') return <SchedulePage />;
  if (page === 'admin') return <AdminPage />;
  return <main className="mx-auto max-w-4xl px-4 py-20"><section className="rounded-2xl border border-white/10 bg-card-sheen px-6 py-14 text-center shadow-card"><Trophy className="mx-auto mb-4 h-10 w-10 text-gold-400" /><h1 className="font-display text-3xl font-extrabold uppercase tracking-wide text-white">Join the Pool</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-txt-secondary">Sign in and enter your private invitation code to participate.</p></section></main>;
}

function AppContent() {
  const { user } = useAuth();
  const [page, setPage] = useState<PageId>('home');
  const [bracketId, setBracketId] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const openJoin = () => {
    if (!user) setAuthOpen(true);
    else setJoinOpen(true);
  };
  const openBracket = (id: string) => {
    setBracketId(id);
    setPage('bracket');
  };

  return (
    <div className="min-h-screen bg-navy-950 text-txt-primary">
      <Nav page={page} setPage={setPage} onAuthClick={() => setAuthOpen(true)} />
      {page === 'home' && <Home setPage={setPage} onJoinClick={openJoin} />}
      {page === 'entries' && <EntriesPage onOpenBracket={openBracket} onJoin={openJoin} />}
      {page === 'bracket' && (bracketId ? <BracketPage bracketId={bracketId} onOpenEntries={() => setPage('entries')} /> : <EntriesPage onOpenBracket={openBracket} onJoin={openJoin} />)}
      {page !== 'home' && page !== 'entries' && page !== 'bracket' && <InfoPage page={page} />}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      {joinOpen && <JoinPoolModal onClose={() => setJoinOpen(false)} />}
      <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-txt-muted">THE PLAYOFF POOL · Private NFL postseason competition</footer>
    </div>
  );
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>;
}
