import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarDays, ListOrdered, ShieldCheck, Plus, RefreshCw, Trash2, Save, Users, Trophy, Megaphone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Announcement, LeaderboardRow, PlayoffGame, PlayoffTeam } from '@/lib/types';
import { Card, GoldButton, GhostButton, EmptyState, Spinner, SectionTitle, StatusPill } from '@/components/ui';

function PageShell({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <main className="mx-auto max-w-6xl px-4 py-10"><p className="text-xs font-bold uppercase tracking-[.2em] text-gold-400">{eyebrow}</p><h1 className="mb-7 mt-1 font-display text-3xl font-extrabold uppercase text-white">{title}</h1>{children}</main>;
}

export function LeaderboardPage() {
  const { pool } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let live = true;
    if (!pool) { setBusy(false); return; }
    supabase.rpc('pp_leaderboard', { p_pool: pool.id }).then(({ data }) => {
      if (live) { setRows((data as LeaderboardRow[]) ?? []); setBusy(false); }
    });
    return () => { live = false; };
  }, [pool]);
  if (!pool) return <PageShell title="Leaderboard" eyebrow="Standings"><EmptyState title="Private pool access" body="Sign in and join your private pool to see standings." /></PageShell>;
  if (busy) return <Spinner label="Loading standings…" />;
  return <PageShell title="Leaderboard" eyebrow={`NFL Playoffs · ${pool.season}`}>
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-[48px_1fr_70px_70px] gap-2 border-b border-white/10 bg-white/5 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-txt-muted sm:grid-cols-[60px_1fr_100px_100px_100px]"><span>Rank</span><span>Entry</span><span className="text-right">Points</span><span className="hidden text-right sm:block">Correct</span><span className="text-right">Tiebreak</span></div>
      {rows.length === 0 ? <div className="p-8 text-center text-sm text-txt-muted">No submitted brackets yet. Standings appear once entries are submitted and games are scored.</div> : rows.map((r, i) => <div key={r.bracket_id} className="grid grid-cols-[48px_1fr_70px_70px] items-center gap-2 border-b border-white/5 px-4 py-4 last:border-0 sm:grid-cols-[60px_1fr_100px_100px_100px]"><span className="font-display text-lg font-extrabold text-gold-400">{r.rank ?? i + 1}</span><span className="min-w-0"><b className="block truncate text-sm text-white">{r.display_name ?? 'Participant'}</b><small className="text-xs text-txt-muted">{r.entry_name}</small></span><b className="text-right font-display text-xl text-gold-400">{r.total_points}</b><span className="hidden text-right text-sm text-txt-secondary sm:block">{r.correct_picks}</span><span className="text-right text-sm text-txt-secondary">{r.tiebreaker_points ?? '—'}</span></div>)}
    </Card>
    <p className="mt-3 text-xs text-txt-muted">Scoring: Wild Card 1 · Divisional 2 · Conference 4 · Super Bowl 8. Tiebreaker: closest Super Bowl combined score.</p>
  </PageShell>;
}

export function SchedulePage() {
  const { pool } = useAuth();
  const [games, setGames] = useState<PlayoffGame[]>([]);
  const [teams, setTeams] = useState<PlayoffTeam[]>([]);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let live = true;
    if (!pool) { setBusy(false); return; }
    Promise.all([
      supabase.from('playoff_games').select('*').eq('season', pool.season).order('game_slot'),
      supabase.from('playoff_teams').select('*').eq('season', pool.season)
    ]).then(([g,t]) => { if (live) { setGames(g.data ?? []); setTeams(t.data ?? []); setBusy(false); } });
    return () => { live = false; };
  }, [pool]);
  const byId = useMemo(() => new Map(teams.map(t => [t.id,t])), [teams]);
  if (!pool) return <PageShell title="NFL Playoff Schedule" eyebrow="Game center"><EmptyState title="Private pool access" body="Sign in and join your pool to see its playoff schedule." /></PageShell>;
  if (busy) return <Spinner label="Loading playoff schedule…" />;
  const rounds: PlayoffGame['round'][] = ['wild_card','divisional','conference','super_bowl'];
  const labels = { wild_card:'Wild Card', divisional:'Divisional Round', conference:'Conference Championships', super_bowl:'Super Bowl' };
  return <PageShell title="NFL Playoff Schedule" eyebrow={`Game center · ${pool.season}`}>
    {games.length === 0 ? <EmptyState title="Schedule not loaded yet" body="The playoff schedule will appear after the NFL confirms the postseason field and matchups. No placeholder scores are shown." /> : <div className="space-y-8">{rounds.map(round => {
      const list = games.filter(g => g.round === round);
      if (!list.length) return null;
      return <section key={round}><SectionTitle>{labels[round]}</SectionTitle><div className="grid gap-3 md:grid-cols-2">{list.map(g => {
        const home = g.home_team_id ? byId.get(g.home_team_id) : undefined;
        const away = g.away_team_id ? byId.get(g.away_team_id) : undefined;
        return <Card key={g.id} className="p-4"><div className="mb-3 flex items-center justify-between"><StatusPill status={g.status} /><span className="text-xs text-txt-muted">{g.kickoff ? new Date(g.kickoff).toLocaleString() : 'Kickoff TBD'}</span></div><div className="grid grid-cols-[1fr_auto] gap-3"><div className="space-y-3"><p className="font-semibold text-white">{away ? `#${away.seed} ${away.name}` : 'Away team TBD'}</p><p className="font-semibold text-white">{home ? `#${home.seed} ${home.name}` : 'Home team TBD'}</p></div><div className="text-right font-display text-2xl font-extrabold text-gold-400"><p>{g.away_score ?? '—'}</p><p>{g.home_score ?? '—'}</p></div></div>{g.status === 'live' || g.status === 'halftime' ? <p className="mt-3 text-xs font-semibold text-livered">{g.status === 'halftime' ? 'HALFTIME' : 'LIVE'} {g.quarter ?? ''} {g.clock ?? ''}</p> : null}</Card>;
      })}</div></section>;
    })}</div>}
    <p className="mt-5 text-xs text-txt-muted">Scores shown here are official results entered into the pool game center. Live score-feed automation still needs a connected data provider; no scores are invented.</p>
  </PageShell>;
}

export function AdminPage() {
  const { pool, isPlatformAdmin, isPoolAdmin, refresh } = useAuth();
  const [deadline, setDeadline] = useState('');
  const [code, setCode] = useState('PLAYOFF26');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [games, setGames] = useState<PlayoffGame[]>([]);
  const [teams, setTeams] = useState<PlayoffTeam[]>([]);
  const [selectedGame, setSelectedGame] = useState('');
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [status, setStatus] = useState<'upcoming'|'live'|'halftime'|'final'>('upcoming');
  const [teamName, setTeamName] = useState('');
  const [teamAbbr, setTeamAbbr] = useState('');
  const [conference, setConference] = useState<'AFC'|'NFC'>('AFC');
  const [seed, setSeed] = useState('1');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const allowed = isPlatformAdmin || isPoolAdmin;
  const load = async () => {
    if (!pool || !allowed) return;
    const [m,g,t,i] = await Promise.all([
      supabase.rpc('pp_admin_participants',{p_pool:pool.id}),
      supabase.from('playoff_games').select('*').eq('season',pool.season).order('game_slot'),
      supabase.from('playoff_teams').select('*').eq('season',pool.season),
      supabase.from('pool_invitations').select('code,active').eq('pool_id',pool.id)
    ]);
    setMembers(m.data ?? []); setGames(g.data ?? []); setTeams(t.data ?? []);
    if (i.data?.[0]) setCode(i.data[0].code);
    if (!selectedGame && g.data?.[0]) setSelectedGame(g.data[0].id);
    if (pool.deadline) setDeadline(new Date(pool.deadline).toISOString().slice(0,16));
  };
  useEffect(() => { load(); }, [pool, allowed]);
  const act = async (fn: () => PromiseLike<any>, success: string) => {
    setBusy(true); setNotice('');
    const r = await fn(); setBusy(false);
    if (r?.error) setNotice(r.error.message); else { setNotice(success); await load(); await refresh(); }
  };
  if (!allowed) return <PageShell title="Pool administration" eyebrow="Restricted"><EmptyState title="Administrator access required" body="Only the private pool administrator can manage participants, entries, game results, and announcements." /></PageShell>;
  if (!pool) return <PageShell title="Pool administration" eyebrow="Restricted"><EmptyState title="No pool attached" body="Join the default pool before opening admin controls." /></PageShell>;
  return <PageShell title="Pool administration" eyebrow="Commissioner console">
    {notice && <p className="mb-5 rounded-lg border border-gold-400/30 bg-gold-400/10 px-4 py-3 text-sm text-gold-300">{notice}</p>}
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5"><SectionTitle><span className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-gold-400"/> Pool settings</span></SectionTitle><label className="mb-2 block text-xs text-txt-muted">Bracket submission deadline</label><input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)} className="mb-3 w-full rounded-lg border border-white/10 bg-navy-950 p-3 text-white"/><GoldButton disabled={busy} onClick={()=>act(()=>supabase.rpc('pp_set_pool_deadline',{p_pool:pool.id,p_deadline:deadline ? new Date(deadline).toISOString() : null}),'Deadline saved')}>Save deadline</GoldButton><div className="my-5 border-t border-white/10"/><label className="mb-2 block text-xs text-txt-muted">Private invitation code</label><div className="flex gap-2"><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-navy-950 p-3 font-bold tracking-widest text-gold-400"/><GoldButton disabled={busy || !code.trim()} onClick={()=>act(()=>supabase.from('pool_invitations').insert({pool_id:pool.id,code:code.trim(),active:true}),'New invitation code created')}>Add code</GoldButton></div><p className="mt-2 text-xs text-txt-muted">Share this code only with invited participants. Existing codes remain active until disabled in the database.</p></Card>
      <Card className="p-5"><SectionTitle><span className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-gold-400"/> Announcement</span></SectionTitle><input value={announcementTitle} onChange={e=>setAnnouncementTitle(e.target.value)} placeholder="Announcement title" className="mb-3 w-full rounded-lg border border-white/10 bg-navy-950 p-3 text-white"/><textarea value={announcementBody} onChange={e=>setAnnouncementBody(e.target.value)} placeholder="Message to pool participants" rows={4} className="mb-3 w-full rounded-lg border border-white/10 bg-navy-950 p-3 text-white"/><GoldButton disabled={busy || !announcementTitle.trim() || !announcementBody.trim()} onClick={()=>act(()=>supabase.from('announcements').insert({pool_id:pool.id,title:announcementTitle.trim(),body:announcementBody.trim()}),'Announcement posted')}>Post announcement</GoldButton></Card>
      <Card className="p-5"><SectionTitle><span className="flex items-center gap-2"><Trophy className="h-5 w-5 text-gold-400"/> Team field</span></SectionTitle><div className="grid grid-cols-2 gap-2"><input value={teamName} onChange={e=>setTeamName(e.target.value)} placeholder="Team name" className="rounded-lg border border-white/10 bg-navy-950 p-2.5 text-sm text-white"/><input value={teamAbbr} onChange={e=>setTeamAbbr(e.target.value.toUpperCase())} placeholder="Abbreviation" className="rounded-lg border border-white/10 bg-navy-950 p-2.5 text-sm text-white"/><select value={conference} onChange={e=>setConference(e.target.value as 'AFC'|'NFC')} className="rounded-lg border border-white/10 bg-navy-950 p-2.5 text-sm text-white"><option>AFC</option><option>NFC</option></select><select value={seed} onChange={e=>setSeed(e.target.value)} className="rounded-lg border border-white/10 bg-navy-950 p-2.5 text-sm text-white">{[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n} seed</option>)}</select></div><GoldButton className="mt-3" disabled={busy || !teamName.trim() || !teamAbbr.trim()} onClick={()=>act(()=>supabase.from('playoff_teams').upsert({season:pool.season,name:teamName.trim(),abbreviation:teamAbbr.trim(),conference,seed:Number(seed)},{onConflict:'season,conference,seed'}),'Team saved')}>Save team</GoldButton><p className="mt-2 text-xs text-txt-muted">{teams.length} of 14 teams entered</p></Card>
      <Card className="p-5"><SectionTitle><span className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-gold-400"/> Game center & scores</span></SectionTitle><select value={selectedGame} onChange={e=>setSelectedGame(e.target.value)} className="mb-3 w-full rounded-lg border border-white/10 bg-navy-950 p-3 text-sm text-white"><option value="">Select game</option>{games.map(g=><option key={g.id} value={g.id}>{g.round.replace('_',' ')} · game {g.game_slot}</option>)}</select><div className="grid grid-cols-2 gap-2"><input type="number" min="0" value={awayScore} onChange={e=>setAwayScore(e.target.value)} placeholder="Away score" className="rounded-lg border border-white/10 bg-navy-950 p-3 text-white"/><input type="number" min="0" value={homeScore} onChange={e=>setHomeScore(e.target.value)} placeholder="Home score" className="rounded-lg border border-white/10 bg-navy-950 p-3 text-white"/></div><select value={status} onChange={e=>setStatus(e.target.value as any)} className="my-3 w-full rounded-lg border border-white/10 bg-navy-950 p-3 text-white"><option value="upcoming">Upcoming</option><option value="live">Live</option><option value="halftime">Halftime</option><option value="final">Final</option></select><GoldButton disabled={busy || !selectedGame || homeScore==='' || awayScore===''} onClick={()=>act(()=>supabase.from('playoff_games').update({home_score:Number(homeScore),away_score:Number(awayScore),status,source:'manual'}).eq('id',selectedGame),'Game result updated and standings recalculated')}>Update score</GoldButton><p className="mt-2 text-xs text-txt-muted">Final scores trigger automatic bracket scoring. For live game clocks, update the quarter and clock fields through the game feed.</p></Card>
    </div>
    <Card className="mt-5 p-5"><SectionTitle><span className="flex items-center gap-2"><Users className="h-5 w-5 text-gold-400"/> Participants ({members.length})</span></SectionTitle>{members.length===0?<p className="text-sm text-txt-muted">No participants yet.</p>:<div className="divide-y divide-white/5">{members.map(m=><div key={m.user_id} className="flex items-center justify-between gap-3 py-3"><div><b className="block text-sm text-white">{m.display_name}</b><span className="text-xs text-txt-muted">{m.email} · {m.entry_count} entries · {m.role}</span></div>{m.role!=='admin'&&<GhostButton onClick={()=>act(()=>supabase.rpc('pp_revoke_member',{p_pool:pool.id,p_user:m.user_id}),'Participant removed')}><Trash2 className="h-4 w-4"/> Remove</GhostButton>}</div>)}</div>}</Card>
    <div className="mt-5 flex justify-end"><GhostButton onClick={load}><RefreshCw className="h-4 w-4"/> Refresh data</GhostButton></div>
  </PageShell>;
}
