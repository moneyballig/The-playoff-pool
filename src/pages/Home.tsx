import { useEffect, useMemo, useState } from 'react';
import {
  Trophy, ChevronRight, Users, FileText, Megaphone, Clock, Lock,
  Swords, Plus, Medal,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Announcement, Bracket, PlayoffGame, PlayoffTeam, LeaderboardRow } from '@/lib/types';
import { Card, GoldButton, GhostButton, SectionTitle, StatusPill, TeamLogo, SeedBadge, Spinner, EmptyState } from '@/components/ui';
import type { PageId } from '@/components/Nav';


function ConferenceSeeds({conference,teams}:{conference:string;teams:PlayoffTeam[]}) {
 const seeded=teams.filter(t=>t.conference?.toUpperCase()===conference).sort((a,b)=>a.seed-b.seed);
 const bySeed=(n:number)=>seeded.find(t=>t.seed===n);
 return <div className="space-y-3">{[[1],[2,7],[3,6],[4,5]].map((pair,i)=><div key={i} className="gridiron-match rounded-lg border border-white/20 p-2">{pair.map(n=><div key={n} className="flex items-center gap-2 border-b border-white/10 py-1.5 last:border-0"><span className="w-4 text-xs font-bold text-amber-300">{n}</span><TeamLogo team={bySeed(n)??null}/><span className="truncate text-xs font-semibold text-white">{bySeed(n)?.name??'TBD'}</span></div>)}{pair.length===1&&<span className="pl-6 text-[10px] uppercase text-amber-200">First-round bye</span>}</div>)}</div>;
}
function BracketRound({conference,round,games,teams}:{conference:string;round:string;games:PlayoffGame[];teams:Map<string,PlayoffTeam>}) {
 const matches=games.filter(g=>g.conference?.toUpperCase()===conference&&String(g.round).toLowerCase().includes(round)).slice(0,2);
 return <>{[0,1].map(i=>{const g=matches[i];const home=g?.home_team_id?teams.get(g.home_team_id):null;const away=g?.away_team_id?teams.get(g.away_team_id):null;return <div key={i} className="gridiron-match flex min-h-24 flex-col justify-center rounded-lg border border-white/20 p-2">{[away,home].map((t,j)=><div key={j} className="flex items-center gap-2 border-b border-white/10 py-2 last:border-0"><TeamLogo team={t??null}/><span className="truncate text-xs font-semibold text-white">{t?.name??'TBD'}</span></div>)}</div>})}</>;
}

function useCountdown(target: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => {
    if (!target) return null;
    const diff = new Date(target).getTime() - now;
    if (diff <= 0) return { over: true, days: 0, hours: 0, mins: 0, secs: 0 };
    return {
      over: false,
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff / 3600000) % 24),
      mins: Math.floor((diff / 60000) % 60),
      secs: Math.floor((diff / 1000) % 60),
    };
  }, [target, now]);
}

function fmtKickoff(k: string | null) {
  if (!k) return { date: 'TBD', time: '' };
  const d = new Date(k);
  return {
    date: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  };
}

interface Props {
  setPage: (p: PageId) => void;
  onJoinClick: () => void;
}

export default function Home({ setPage, onJoinClick }: Props) {
  const { user, pool, profile } = useAuth();
  const [brackets, setBrackets] = useState<Bracket[]>([]);
  const [games, setGames] = useState<PlayoffGame[]>([]);
  const [teams, setTeams] = useState<PlayoffTeam[]>([]);
  const [leaders, setLeaders] = useState<LeaderboardRow[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [members, setMembers] = useState(0);
  const [submitted, setSubmitted] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pool) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const [g, t, a, lb, bm] = await Promise.all([
        supabase.from('playoff_games').select('*').eq('season', pool.season).order('kickoff', { ascending: true }),
        supabase.from('playoff_teams').select('*').eq('season', pool.season),
        supabase.from('announcements').select('*').eq('pool_id', pool.id).order('created_at', { ascending: false }).limit(4),
        supabase.rpc('pp_leaderboard', { p_pool: pool.id }),
        supabase.from('pool_members').select('user_id', { count: 'exact' }).eq('pool_id', pool.id),
      ]);
      setGames(g.data ?? []);
      setTeams(t.data ?? []);
      setAnnouncements(a.data ?? []);
      setLeaders((lb.data as LeaderboardRow[]) ?? []);
      setMembers(bm.count ?? 0);

      const sbCount = (lb.data as LeaderboardRow[] | null)?.length ?? 0;
      setSubmitted(sbCount);

      if (user) {
        const { data: mine } = await supabase.from('brackets').select('*').eq('pool_id', pool.id).eq('user_id', user.id);
        setBrackets(mine ?? []);
      } else {
        setBrackets([]);
      }
      setLoading(false);
    })();
  }, [pool, user]);

  const firstGame = games.filter((g) => g.kickoff).sort((a, b) => +new Date(a.kickoff!) - +new Date(b.kickoff!))[0];
  const countdown = useCountdown(firstGame?.kickoff ?? null);
  const upcoming = games
    .filter((g) => g.status !== 'final' && g.kickoff)
    .sort((a, b) => +new Date(a.kickoff!) - +new Date(b.kickoff!))
    .slice(0, 3);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const deadlinePassed = pool?.deadline ? new Date(pool.deadline).getTime() < Date.now() : false;

  if (loading) return <Spinner label="Loading pool…" />;

  return (
    <div className="animate-fade-up">
      {/* STADIUM HERO — live pool data only */}
      <section className="gridiron-hero relative overflow-hidden border-b border-amber-400/25">
        <div className="gridiron-hero-shade absolute inset-0" />
        <div className="relative mx-auto max-w-[1500px] px-4 pb-8 pt-12 sm:px-7 sm:pt-16">
          <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-amber-300">The road to the championship</p>
          <h1 className="gridiron-title mt-3 font-display text-5xl font-extrabold uppercase leading-none text-white sm:text-7xl lg:text-8xl">{pool?.season ?? 2026} NFL PLAYOFFS</h1>
          <p className="gridiron-subtitle mt-2 font-display text-xl font-bold uppercase tracking-wider text-amber-300 sm:text-3xl">Make your picks. Claim the glory.</p>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300/30 bg-[#030a18]/85 p-4 shadow-2xl backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-5 sm:gap-9">
              <div className="flex items-center gap-3"><Users className="h-7 w-7 text-amber-300"/><div><strong className="block text-xl text-white">{pool ? members : '—'}</strong><span className="text-xs text-slate-300">Participants</span></div></div>
              <div className="flex items-center gap-3"><FileText className="h-7 w-7 text-amber-300"/><div><strong className="block text-xl text-white">{pool ? submitted : '—'}</strong><span className="text-xs text-slate-300">Leaderboard entries</span></div></div>
              <div className="flex items-center gap-3"><Clock className="h-7 w-7 text-amber-300"/><div><strong className="block text-sm text-white">{pool?.deadline ? new Date(pool.deadline).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) : 'Not set'}</strong><span className="text-xs text-slate-300">Pool deadline</span></div></div>
            </div>
            {countdown && !countdown.over ? <div className="rounded-lg border border-amber-400/40 bg-black/75 px-5 py-2 text-center"><p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">Playoffs kickoff in</p><div className="mt-1 flex gap-3">{[{v:countdown.days,l:'DAYS'},{v:countdown.hours,l:'HRS'},{v:countdown.mins,l:'MIN'},{v:countdown.secs,l:'SEC'}].map(t=><div key={t.l}><strong className="block font-display text-2xl text-white">{String(t.v).padStart(2,'0')}</strong><span className="text-[9px] text-amber-300">{t.l}</span></div>)}</div></div> : <div className="rounded-lg border border-amber-400/30 px-4 py-2 text-sm text-amber-200">{countdown?.over ? 'Playoffs underway' : 'Kickoff schedule pending'}</div>}
          </div>
          {!user && <div className="mt-5"><GoldButton onClick={onJoinClick}><Trophy className="h-4 w-4"/> Sign in / Enter pool</GoldButton></div>}
          {user && !pool && <div className="mt-5"><GoldButton onClick={onJoinClick}>Join private pool</GoldButton></div>}
        </div>
      </section>
      <section className="mx-auto max-w-[1500px] px-4 pt-5 sm:px-7">
        <div className="gridiron-panel overflow-hidden rounded-xl border border-amber-300/30">
          <div className="flex items-center justify-between gap-3 border-b border-amber-300/25 bg-[#08172d] px-4 py-3 sm:px-8">
            <span className="font-display text-xl font-extrabold italic text-amber-300 sm:text-2xl">AFC</span>
            <h2 className="font-display text-lg font-extrabold uppercase italic tracking-wider text-white sm:text-3xl">NFL Playoff Bracket</h2>
            <span className="font-display text-xl font-extrabold italic text-sky-300 sm:text-2xl">NFC</span>
          </div>
          <div className="gridiron-bracket-scroll overflow-x-auto p-4 sm:p-6">
            <div className="grid min-w-[840px] grid-cols-[1fr_1fr_0.85fr_1fr_1fr] items-center gap-3 lg:gap-5">
              {(['AFC','AFC','SUPER BOWL','NFC','NFC'] as const).map((c,i)=><div key={i} className="text-center font-display text-xs font-bold uppercase tracking-wider text-amber-200">{i===0||i===4?'Wild Card':i===1||i===3?'Divisional':c}</div>)}
              <div className="space-y-3">{['AFC'].map(conf=><ConferenceSeeds key={conf} conference={conf} teams={teams}/>)}</div>
              <div className="space-y-7"><BracketRound conference="AFC" round="divisional" games={games} teams={teamById}/></div>
              <div className="flex flex-col items-center justify-center gap-5"><Trophy className="h-20 w-20 text-amber-300 drop-shadow-[0_0_20px_rgba(251,191,36,.45)]"/><div className="rounded-lg border border-amber-400/60 bg-amber-400/10 px-4 py-2 text-center font-display text-xl font-extrabold uppercase text-amber-200">Super Bowl</div><button onClick={()=>setPage('bracket')} className="rounded-md border border-amber-300/50 px-4 py-2 text-xs font-bold text-amber-200 hover:bg-amber-400/10">View bracket →</button></div>
              <div className="space-y-7"><BracketRound conference="NFC" round="divisional" games={games} teams={teamById}/></div>
              <div className="space-y-3"><ConferenceSeeds conference="NFC" teams={teams}/></div>
            </div>
            <p className="mt-5 text-center text-xs text-slate-400">Bracket shows actual configured playoff seeds and games. Empty slots remain TBD until set by the pool administrator.</p>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-10">
        {!user && (
          <section className="mb-10">
            <EmptyState
              title="Welcome to the pool"
              body="Sign in or create an account, then enter your private invitation code to start filling out playoff brackets. The first account created becomes the pool administrator."
              action={<GoldButton onClick={onJoinClick}>Sign in / Join</GoldButton>}
            />
          </section>
        )}

        {user && pool && (
          <section className="mb-12">
            <SectionTitle
              right={
                <GhostButton onClick={() => setPage('entries')}>
                  <Plus className="h-4 w-4" /> Manage
                </GhostButton>
              }
            >
              My entries
            </SectionTitle>
            {brackets.length === 0 ? (
              <EmptyState
                title="No brackets yet"
                body="You can create up to two playoff brackets. Each one saves automatically as you pick."
                action={<GoldButton onClick={() => setPage('entries')}>Create your first bracket</GoldButton>}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {brackets.map((b) => (
                  <EntryMiniCard key={b.id} bracket={b} setPage={setPage} />
                ))}
              </div>
            )}
          </section>
        )}

        {leaders.length > 0 && (
          <section className="mb-12">
            <SectionTitle right={<GhostButton onClick={() => setPage('leaderboard')}>Full leaderboard <ChevronRight className="h-4 w-4" /></GhostButton>}>
              Leaderboard leaders
            </SectionTitle>
            <div className="grid gap-4 sm:grid-cols-3">
              {leaders.slice(0, 3).map((row, i) => {
                const medal = ['text-gold-400', 'text-txt-secondary', 'text-orange-brand'][i];
                return (
                  <Card key={row.bracket_id} className="flex items-center gap-4 p-4">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-navy-900 font-display text-xl font-extrabold ${medal}`}>
                      <Medal className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{row.display_name ?? 'Participant'}</p>
                      <p className="truncate text-xs text-txt-muted">{row.entry_name}</p>
                      <p className="font-display text-2xl font-extrabold text-gold-400">{row.total_points} <span className="text-xs text-txt-muted">pts</span></p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="mb-12">
            <SectionTitle right={<GhostButton onClick={() => setPage('schedule')}>Full schedule <ChevronRight className="h-4 w-4" /></GhostButton>}>
              Upcoming playoff games
            </SectionTitle>
            <div className="grid gap-4 md:grid-cols-3">
              {upcoming.map((g) => {
                const home = g.home_team_id ? teamById.get(g.home_team_id) ?? null : null;
                const away = g.away_team_id ? teamById.get(g.away_team_id) ?? null : null;
                const ko = fmtKickoff(g.kickoff);
                return (
                  <Card key={g.id} className="p-4 transition hover:border-gold-400/30">
                    <div className="mb-3 flex items-center justify-between">
                      <StatusPill status={g.status} />
                      <span className="text-xs text-txt-muted">{g.conference ?? 'SUPER BOWL'} · {ko.date}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <TeamLogo team={away} />
                        <div>
                          <p className="text-sm font-semibold text-white">{away?.name ?? 'TBD'}</p>
                          {away && <SeedBadge seed={away.seed} />}
                        </div>
                      </div>
                      <span className="font-display text-lg font-bold text-txt-muted">VS</span>
                      <div className="flex items-center gap-2.5 text-right">
                        <div>
                          <p className="text-sm font-semibold text-white">{home?.name ?? 'TBD'}</p>
                          {home && <SeedBadge seed={home.seed} />}
                        </div>
                        <TeamLogo team={home} />
                      </div>
                    </div>
                    {ko.time && <p className="mt-3 text-center text-xs text-txt-muted">{ko.date} · {ko.time} ET kickoff</p>}
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {pool && (
          <section>
            <SectionTitle>
              <span className="inline-flex items-center gap-2">
                <Megaphone className="h-6 w-6 text-gold-400" /> Pool announcements
              </span>
            </SectionTitle>
            {announcements.length === 0 ? (
              <p className="text-sm text-txt-muted">No announcements yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {announcements.map((a) => (
                  <Card key={a.id} className="p-4">
                    <p className="font-display text-lg font-bold uppercase tracking-wide text-gold-400">{a.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-txt-secondary">{a.body}</p>
                    <p className="mt-2 text-xs text-txt-muted">{new Date(a.created_at).toLocaleDateString()}</p>
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}

        {user && !pool && (
          <section className="mb-10">
            <EmptyState
              title={`You're signed in, ${profile?.display_name ?? ''}`}
              body="You haven't joined a pool yet. Enter the private invitation code you received to join the competition."
              action={<GoldButton onClick={onJoinClick}>Enter invitation code</GoldButton>}
            />
          </section>
        )}
      </div>
    </div>
  );
}

function EntryMiniCard({ bracket: b, setPage }: { bracket: Bracket; setPage: (p: PageId) => void }) {
  const pct = b.submitted ? 100 : 0;
  return (
    <Card className="p-5 transition hover:border-gold-400/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold uppercase tracking-wide text-white">{b.name}</p>
          <p className="text-xs text-txt-muted">
            {b.submitted
              ? `Submitted ${b.submitted_at ? new Date(b.submitted_at).toLocaleDateString() : ''}`
              : b.frozen
                ? 'Locked — deadline passed'
                : 'In progress'}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${
            b.submitted ? 'bg-correct/15 text-correct' : b.frozen ? 'bg-white/10 text-txt-muted' : 'bg-gold-400/15 text-gold-400'
          }`}
        >
          {b.submitted ? 'Submitted' : b.frozen ? 'Locked' : 'Draft'}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-navy-950">
        <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-400" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="font-display text-xl font-extrabold text-gold-400">
          {b.total_points} <span className="text-xs font-medium text-txt-muted">pts · rank {b.rank ?? '—'}</span>
        </p>
        <GhostButton onClick={() => setPage('entries')}>{b.submitted ? 'View' : 'Continue'} <ChevronRight className="h-4 w-4" /></GhostButton>
      </div>
    </Card>
  );
}
