import { useEffect, useMemo, useState } from 'react';
import {
  Trophy, ChevronRight, Users, FileText, Megaphone, Clock,
  Plus, Medal,
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
function MobileWildCard({conference,teams}:{conference:'AFC'|'NFC';teams:PlayoffTeam[]}) {
 const seeded=teams.filter(t=>t.conference===conference);
 const bySeed=(seed:number)=>seeded.find(t=>t.seed===seed)??null;
 return <div className="grid grid-cols-2 gap-2">
  {([[2,7],[3,6],[4,5]] as const).map((pair,i)=><div key={i} className="gridiron-match flex min-h-24 flex-col justify-center rounded-lg border border-white/20 p-2">
   {pair.map(seed=>{const team=bySeed(seed);return <div key={seed} className="flex min-w-0 items-center gap-1 border-b border-white/10 py-2 last:border-0"><span className="w-3 shrink-0 text-[10px] font-bold text-amber-300">{seed}</span><TeamLogo team={team} size={24}/><span className="min-w-0 truncate text-[11px] font-semibold text-white">{team?.name??'TBD'}</span></div>})}
  </div>)}
  <div className="gridiron-match flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-amber-400/30 p-2"><span className="text-[10px] font-bold uppercase text-amber-200">#1 Seed Bye</span><TeamLogo team={bySeed(1)} size={28}/><span className="max-w-full truncate text-[11px] font-semibold text-white">{bySeed(1)?.name??'TBD'}</span></div>
 </div>;
}
function BracketRound({conference,round,games,teams,count=2}:{conference:string;round:string;games:PlayoffGame[];teams:Map<string,PlayoffTeam>;count?:number}) {
 const matches=games.filter(g=>g.conference?.toUpperCase()===conference&&String(g.round).toLowerCase().includes(round)).slice(0,count);
 return <>{Array.from({length:count},(_,i)=>i).map(i=>{const g=matches[i];const home=g?.home_team_id?teams.get(g.home_team_id):null;const away=g?.away_team_id?teams.get(g.away_team_id):null;return <div key={i} className="gridiron-match flex min-h-24 flex-col justify-center rounded-lg border border-white/20 p-2">{[away,home].map((t,j)=><div key={j} className="flex items-center gap-2 border-b border-white/10 py-2 last:border-0"><TeamLogo team={t??null}/><span className="truncate text-xs font-semibold text-white">{t?.name??'TBD'}</span></div>)}</div>})}</>;
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
          <div className="hidden lg:flex items-center justify-between gap-3 border-b border-amber-300/25 bg-[#08172d] px-4 py-3 sm:px-8">
            <span className="flex items-center gap-2 font-display text-xl font-extrabold italic text-amber-300 sm:text-2xl"><img src="https://a.espncdn.com/i/teamlogos/nfl/500/afc.png" alt="" className="h-8 w-8 object-contain" onError={e=>{e.currentTarget.style.display="none"}}/> AFC</span>
            <h2 className="font-display text-lg font-extrabold uppercase italic tracking-wider text-white sm:text-3xl">NFL Playoff Bracket</h2>
            <span className="flex items-center gap-2 font-display text-xl font-extrabold italic text-sky-300 sm:text-2xl">NFC <img src="https://a.espncdn.com/i/teamlogos/nfl/500/nfc.png" alt="" className="h-8 w-8 object-contain" onError={e=>{e.currentTarget.style.display="none"}}/></span>
          </div>
          <div className="gridiron-mobile-bracket p-3 sm:p-5 lg:hidden">
<div className="mb-4 flex justify-center"><img src="https://a.espncdn.com/i/teamlogos/nfl/500/afc.png" alt="AFC" className="h-16 w-16 object-contain" /></div>
<p className="mb-2 text-center text-xs text-amber-200">WILD CARD</p><MobileWildCard conference="AFC" teams={teams}/>
<div className="my-3 text-center text-amber-300">↓</div>
<p className="mb-2 text-center text-xs text-amber-200">DIVISIONAL</p><div className="grid grid-cols-2 gap-2"><BracketRound conference="AFC" round="divisional" games={games} teams={teamById}/></div>
<div className="my-3 text-center text-amber-300">↓</div>
<p className="mb-2 text-center text-xs text-amber-200">AFC CHAMPIONSHIP</p><div className="mx-auto max-w-64"><BracketRound conference="AFC" round="conference" games={games} teams={teamById} count={1}/></div>
<div className="my-3 text-center text-amber-300">↓</div>
<div className="my-4 rounded-xl border border-amber-400/50 bg-[#0b1c35] p-4 text-center">
<svg viewBox="0 0 110 170" role="img" aria-label="Vince Lombardi Trophy silhouette" className="mx-auto h-24 w-20 drop-shadow-[0_0_18px_rgba(251,191,36,.45)]"><defs><linearGradient id="silverTrophyMobile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset=".38" stopColor="#9eafc7"/><stop offset=".65" stopColor="#f6f7fb"/><stop offset="1" stopColor="#58677c"/></linearGradient></defs><g fill="url(#silverTrophyMobile)" stroke="#dce7f5" strokeWidth="1.5"><ellipse cx="62" cy="32" rx="23" ry="39" transform="rotate(43 62 32)"/><path d="M47 65 L65 65 L76 143 L35 143 Z"/><path d="M35 143 H76 L84 158 H27 Z"/></g><path d="M42 19 Q63 36 83 46 M47 13 Q67 29 88 39 M41 25 Q61 43 79 52" fill="none" stroke="#56667e" strokeWidth="2"/></svg><h3 className="my-3 font-display text-2xl font-extrabold text-amber-200">SUPER BOWL</h3>
<div className="grid grid-cols-2 gap-3">{(['AFC','NFC'] as const).map(conf => { const g=games.find(g=>g.round==='super_bowl'); const ids=[g?.home_team_id,g?.away_team_id]; const team=ids.map(id=>id?teamById.get(id):null).find(t=>t?.conference===conf)??null;return <div key={conf} className="gridiron-match flex flex-col items-center gap-2 rounded-lg border border-amber-300/30 p-3"><span className="text-xs font-bold text-amber-200">{conf} Champion</span><TeamLogo team={team}/><span className="text-xs text-white">{team?.name??'TBD'}</span></div>})}</div>
<button onClick={()=>setPage('bracket')} className="mt-4 rounded-md border border-amber-300/50 px-4 py-2 text-xs font-bold text-amber-200">View bracket →</button>
</div>
<div className="my-3 text-center text-sky-300">↑</div>
<p className="mb-2 text-center text-xs text-sky-200">NFC CHAMPIONSHIP</p><div className="mx-auto max-w-64"><BracketRound conference="NFC" round="conference" games={games} teams={teamById} count={1}/></div>
<div className="my-3 text-center text-sky-300">↑</div>
<p className="mb-2 text-center text-xs text-sky-200">DIVISIONAL</p><div className="grid grid-cols-2 gap-2"><BracketRound conference="NFC" round="divisional" games={games} teams={teamById}/></div>
<div className="my-3 text-center text-sky-300">↑</div>
<p className="mb-2 text-center text-xs text-sky-200">WILD CARD</p><MobileWildCard conference="NFC" teams={teams}/>
<div className="mt-4 flex justify-center"><img src="https://a.espncdn.com/i/teamlogos/nfl/500/nfc.png" alt="NFC" className="h-16 w-16 object-contain" /></div>
</div>
            <div className="gridiron-bracket-scroll hidden overflow-x-auto p-4 sm:p-6 lg:block">
            <div className="grid min-w-[1240px] grid-cols-[1.3fr_1fr_0.9fr_0.85fr_0.9fr_1fr_1.3fr] items-center gap-3 lg:gap-5">
              {(['Wild Card','Divisional','Conference Championship','Super Bowl','Conference Championship','Divisional','Wild Card'] as const).map((c,i)=><div key={i} className="text-center font-display text-xs font-bold uppercase tracking-wider text-amber-200">{c}</div>)}
              <div className="space-y-3">{['AFC'].map(conf=><ConferenceSeeds key={conf} conference={conf} teams={teams}/>)}</div>
              <div className="space-y-7"><BracketRound conference="AFC" round="divisional" games={games} teams={teamById}/></div>
              <div className="pt-8"><BracketRound conference="AFC" round="conference" games={games} teams={teamById}/></div>
              <div className="flex flex-col items-center justify-center gap-5"><svg viewBox="0 0 110 170" role="img" aria-label="Vince Lombardi Trophy silhouette" className="h-32 w-24 drop-shadow-[0_0_18px_rgba(251,191,36,.45)]"><defs><linearGradient id="silverTrophy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset=".38" stopColor="#9eafc7"/><stop offset=".65" stopColor="#f6f7fb"/><stop offset="1" stopColor="#58677c"/></linearGradient></defs><g fill="url(#silverTrophy)" stroke="#dce7f5" strokeWidth="1.5"><ellipse cx="62" cy="32" rx="23" ry="39" transform="rotate(43 62 32)"/><path d="M47 65 L65 65 L76 143 L35 143 Z"/><path d="M35 143 H76 L84 158 H27 Z"/></g><path d="M42 19 Q63 36 83 46 M47 13 Q67 29 88 39 M41 25 Q61 43 79 52" fill="none" stroke="#56667e" strokeWidth="2"/></svg><div className="rounded-lg border border-amber-400/60 bg-amber-400/10 px-4 py-2 text-center font-display text-xl font-extrabold uppercase text-amber-200">Super Bowl</div><button onClick={()=>setPage('bracket')} className="rounded-md border border-amber-300/50 px-4 py-2 text-xs font-bold text-amber-200 hover:bg-amber-400/10">View bracket →</button></div>
              <div className="pt-8"><BracketRound conference="NFC" round="conference" games={games} teams={teamById}/></div>
              <div className="space-y-7"><BracketRound conference="NFC" round="divisional" games={games} teams={teamById}/></div>
              <div className="space-y-3"><ConferenceSeeds conference="NFC" teams={teams}/></div>
            </div>
            <p className="mt-5 text-center text-xs text-slate-400">Bracket shows actual configured playoff seeds and games. Empty slots remain TBD until set by the pool administrator.</p>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-7">
        <div className="grid gap-5 lg:grid-cols-12 lg:items-stretch">
        {!user && (
          <section className="mb-10 lg:col-span-12">
            <EmptyState
              title="Welcome to the pool"
              body="Sign in or create an account, then enter your private invitation code to start filling out playoff brackets. The first account created becomes the pool administrator."
              action={<GoldButton onClick={onJoinClick}>Sign in / Join</GoldButton>}
            />
          </section>
        )}

        {user && pool && (
          <section className="mb-12 lg:col-span-5 lg:mb-0 lg:min-w-0 lg:rounded-xl lg:border lg:border-white/10 lg:bg-[#0c1b33]/80 lg:p-5">
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
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {brackets.map((b) => (
                  <EntryMiniCard key={b.id} bracket={b} setPage={setPage} />
                ))}
              </div>
            )}
          </section>
        )}

        {leaders.length > 0 && (
          <section className="mb-12 lg:col-span-4 lg:mb-0 lg:min-w-0 lg:rounded-xl lg:border lg:border-white/10 lg:bg-[#0c1b33]/80 lg:p-5">
            <SectionTitle right={<GhostButton onClick={() => setPage('leaderboard')}>Full leaderboard <ChevronRight className="h-4 w-4" /></GhostButton>}>
              Leaderboard leaders
            </SectionTitle>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {leaders.slice(0, 3).map((row, i) => {
                const medal = ['text-gold-400', 'text-txt-secondary', 'text-orange-brand'][i];
                return (
                  <Card key={row.bracket_id} className="flex items-center gap-3 p-3">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-navy-900 font-display text-xl font-extrabold ${medal}`}>
                      <Medal className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{row.display_name ?? 'Participant'}</p>
                      <p className="truncate text-xs text-txt-muted">{row.entry_name}</p>
                      <p className="font-display text-xl font-extrabold text-gold-400">{row.total_points} <span className="text-xs text-txt-muted">pts</span></p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="mb-12 lg:col-span-12 lg:mb-0 lg:min-w-0 lg:rounded-xl lg:border lg:border-white/10 lg:bg-[#0c1b33]/80 lg:p-5">
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
          <section className="lg:col-span-3 lg:min-w-0 lg:rounded-xl lg:border lg:border-white/10 lg:bg-[#0c1b33]/80 lg:p-5">
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
          <section className="mb-10 lg:col-span-12">
            <EmptyState
              title={`You're signed in, ${profile?.display_name ?? ''}`}
              body="You haven't joined a pool yet. Enter the private invitation code you received to join the competition."
              action={<GoldButton onClick={onJoinClick}>Enter invitation code</GoldButton>}
            />
          </section>
        )}
        </div>
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
