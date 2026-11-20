import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarDays, ListOrdered, ShieldCheck, Plus, RefreshCw, Trash2, Save, Users, Trophy, Megaphone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Announcement, PlayoffGame, PlayoffTeam } from '@/lib/types';
import { Card, GoldButton, GhostButton, EmptyState, Spinner, SectionTitle, StatusPill } from '@/components/ui';
export { default as LeaderboardPage } from '@/components/AdvancedLeaderboard';

function PageShell({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <main className="mx-auto max-w-6xl px-4 py-10"><p className="text-xs font-bold uppercase tracking-[.2em] text-gold-400">{eyebrow}</p><h1 className="mb-7 mt-1 font-display text-3xl font-extrabold uppercase text-white">{title}</h1>{children}</main>;
}

export function SchedulePage() {
  const { pool, user } = useAuth();
  const [myPicks, setMyPicks] = useState<{bracket_id:string;pick_key:string;team_id:string;entry_name:string}[]>([]);
  const [games, setGames] = useState<PlayoffGame[]>([]);
  const [teams, setTeams] = useState<PlayoffTeam[]>([]);
  const [feed, setFeed] = useState<any[]>([]);
  const [feedError, setFeedError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
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
  useEffect(() => {
    if (!pool) return;
    let live = true;
    const load = async () => {
      try {
        const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=3&season=${pool.season}`);
        if (!response.ok) throw new Error('Live score provider unavailable');
        const data = await response.json();
        if (live) { setFeed(data.events ?? []); setFeedError(''); setUpdatedAt(new Date()); }
      } catch (e) {
        if (live) setFeedError('Live scores are temporarily unavailable. Pool schedule and saved results remain available below.');
      }
    };
    load();
    const timer = window.setInterval(load, 30000);
    return () => { live = false; window.clearInterval(timer); };
  }, [pool]);
  useEffect(() => {
    if (!pool || !user) { setMyPicks([]); return; }
    let live=true;
    const load=async()=>{
      const {data:entries}=await supabase.from('brackets').select('id,name').eq('pool_id',pool.id).eq('user_id',user.id);
      if(!entries?.length){if(live)setMyPicks([]);return;}
      const {data:picks}=await supabase.from('bracket_picks').select('bracket_id,pick_key,team_id').in('bracket_id',entries.map(e=>e.id));
      if(live)setMyPicks((picks??[]).map(p=>({...p,entry_name:entries.find(e=>e.id===p.bracket_id)?.name??'My bracket'})));
    };
    void load();return()=>{live=false};
  },[pool,user]);
  const byId = useMemo(() => new Map(teams.map(t => [t.id,t])), [teams]);
  if (!pool) return <PageShell title="NFL Playoff Schedule" eyebrow="Game center"><EmptyState title="Private pool access" body="Sign in and join your pool to see its playoff schedule." /></PageShell>;
  if (busy) return <Spinner label="Loading playoff schedule…" />;
  return <PageShell title="NFL Playoff Schedule" eyebrow={`Game center · ${pool.season}`}>
    <Card className="mb-6 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-lg font-bold uppercase text-white">Live NFL playoff scores</h2><span className="inline-flex items-center gap-2 text-xs text-txt-muted"><span className="h-2 w-2 rounded-full bg-correct"/> ESPN feed · refreshes every 30 seconds</span></div>
      {updatedAt && <p className="mb-3 text-[11px] text-txt-muted">Last updated {updatedAt.toLocaleTimeString()}</p>}
      {feedError && <p className="mb-3 text-sm text-livered">{feedError}</p>}
      {feed.length === 0 ? <p className="py-5 text-center text-sm text-txt-muted">ESPN has no postseason games available for this season yet. The playoff scoreboard will populate when postseason matchups are published.</p> : <div className="grid gap-3 md:grid-cols-2">{feed.map(event => {
        const competition = event.competitions?.[0];
        const competitors = competition?.competitors ?? [];
        const away = competitors.find((x:any)=>x.homeAway==='away') ?? competitors[0];
        const home = competitors.find((x:any)=>x.homeAway==='home') ?? competitors[1];
        const state = competition?.status?.type?.state ?? event.status?.type?.state;
        const detail = competition?.status?.type?.shortDetail ?? event.status?.type?.shortDetail ?? '';
        return <div key={event.id} className="rounded-xl border border-white/10 bg-navy-950/70 p-4"><div className="mb-3 flex items-center justify-between"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${state==='in'?'bg-livered/15 text-livered':state==='post'?'bg-white/10 text-txt-muted':'bg-gold-400/10 text-gold-400'}`}>{competition?.status?.type?.description ?? event.status?.type?.description ?? 'Scheduled'}</span><span className="text-xs text-txt-muted">{detail || new Date(event.date).toLocaleString()}</span></div><div className="grid grid-cols-[1fr_auto] gap-3"><div className="space-y-3">{[away,home].map((team:any,i)=><div key={team?.id ?? i} className="flex items-center gap-2"><img src={team?.team?.logo} alt="" className="h-7 w-7 object-contain"/><span className="text-sm font-semibold text-white">{team?.team?.displayName ?? 'TBD'}</span></div>)}</div><div className="text-right font-display text-2xl font-extrabold text-gold-400"><p>{away?.score ?? '—'}</p><p>{home?.score ?? '—'}</p></div></div></div>;
      })}</div>}
    </Card>
    <h2 className="mb-4 font-display text-xl font-bold uppercase tracking-wide text-white">Pool schedule & official results</h2>
    {games.length === 0 ? <EmptyState title="Pool bracket schedule not loaded" body="The commissioner can enter teams, matchups, and kickoff times in Admin. Live ESPN scores appear above as soon as postseason games are available." /> : <div className="space-y-8">{(['wild_card','divisional','conference','super_bowl'] as PlayoffGame['round'][]).map(round => {
      const list = games.filter(g => g.round === round);
      if (!list.length) return null;
      const labels = { wild_card:'Wild Card', divisional:'Divisional Round', conference:'Conference Championships', super_bowl:'Super Bowl' };
      return <section key={round}><SectionTitle>{labels[round]}</SectionTitle><div className="grid gap-3 md:grid-cols-2">{list.map(g => {
        const home = g.home_team_id ? byId.get(g.home_team_id) : undefined;
        const away = g.away_team_id ? byId.get(g.away_team_id) : undefined;
        return <Card key={g.id} className="p-4"><div className="mb-3 flex items-center justify-between"><StatusPill status={g.status} /><span className="text-xs text-txt-muted">{g.kickoff ? new Date(g.kickoff).toLocaleString() : 'Kickoff TBD'}</span></div><div className="grid grid-cols-[1fr_auto] gap-3"><div className="space-y-3"><p className="font-semibold text-white">{away ? `#${away.seed} ${away.name}` : 'Away team TBD'}</p><p className="font-semibold text-white">{home ? `#${home.seed} ${home.name}` : 'Home team TBD'}</p></div><div className="text-right font-display text-2xl font-extrabold text-gold-400"><p>{g.away_score ?? '—'}</p><p>{g.home_score ?? '—'}</p></div></div>{myPicks.filter(p=>p.pick_key===g.id).length>0 && <div className="mt-3 border-t border-white/10 pt-3">{myPicks.filter(p=>p.pick_key===g.id).map(p=><div key={p.bracket_id} className="flex items-center justify-between gap-2 py-1 text-xs"><span className="truncate text-txt-secondary">{p.entry_name}: <b className="text-white">{byId.get(p.team_id)?.name??'Selected team'}</b></span><span className={g.status==='final'?(g.winner_team_id===p.team_id?'text-green-400':'text-red-400'):'text-amber-300'}>{g.status==='final'?(g.winner_team_id===p.team_id?'Correct pick':'Incorrect pick'):'Pending'}</span></div>)}</div>}</Card>;
      })}</div></section>;
    })}</div>}
    <p className="mt-5 text-xs text-txt-muted">The ESPN scoreboard is a third-party, undocumented public feed and may change without notice. Final pool scoring is calculated from the commissioner-confirmed game results.</p>
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
  const [gameRound, setGameRound] = useState<PlayoffGame['round']>('wild_card');
  const [gameSlot, setGameSlot] = useState('1');
  const [gameConference, setGameConference] = useState<'AFC'|'NFC'|'SB'>('AFC');
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [kickoff, setKickoff] = useState('');
  const [syncing, setSyncing] = useState(false);
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
  const syncEspn = async () => {
    if (!pool || !teams.length || !games.length || syncing) return;
    setSyncing(true); setNotice('');
    try {
      const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=3&season=' + pool.season);
      if (!response.ok) throw new Error('ESPN scoreboard is temporarily unavailable');
      const data = await response.json();
      let updated = 0;
      for (const event of data.events ?? []) {
        const competition = event.competitions?.[0];
        const competitors = competition?.competitors ?? [];
        const h = competitors.find((x:any)=>x.homeAway==='home');
        const a = competitors.find((x:any)=>x.homeAway==='away');
        if (!h?.team?.abbreviation || !a?.team?.abbreviation) continue;
        const home = teams.find(t=>t.abbreviation.toLowerCase()===h.team.abbreviation.toLowerCase());
        const away = teams.find(t=>t.abbreviation.toLowerCase()===a.team.abbreviation.toLowerCase());
        if (!home || !away) continue;
        const game = games.find(g=>g.home_team_id===home.id && g.away_team_id===away.id);
        if (!game) continue;
        const state = competition?.status?.type?.state ?? event.status?.type?.state;
        const description = (competition?.status?.type?.description ?? '').toLowerCase();
        const nextStatus: PlayoffGame['status'] = state==='post' ? 'final' : state==='in' ? (description.includes('half') ? 'halftime' : 'live') : 'upcoming';
        const hs = h.score === undefined || h.score === '' ? null : Number(h.score);
        const as = a.score === undefined || a.score === '' ? null : Number(a.score);
        const result = await supabase.from('playoff_games').update({
          home_score: hs, away_score: as, status: nextStatus,
          quarter: competition?.status?.period ? String(competition.status.period) : null,
          clock: competition?.status?.displayClock ?? null,
          kickoff: event.date ?? game.kickoff,
          source: 'api',
          winner_team_id: nextStatus==='final' && hs!==null && as!==null ? (hs>as ? home.id : away.id) : null
        }).eq('id',game.id);
        if (result.error) throw result.error;
        updated++;
      }
      setNotice('ESPN sync complete · ' + updated + ' pool games updated');
      await load();
    } catch (e:any) {
      setNotice(e?.message ?? 'Could not sync ESPN scores');
    } finally { setSyncing(false); }
  };
  useEffect(() => {
    if (!allowed || !pool || !games.length || !teams.length) return;
    const timer = window.setInterval(() => { void syncEspn(); }, 30000);
    return () => window.clearInterval(timer);
  }, [allowed, pool, games, teams, syncing]);
  if (!allowed) return <PageShell title="Pool administration" eyebrow="Restricted"><EmptyState title="Administrator access required" body="Only the private pool administrator can manage participants, entries, game results, and announcements." /></PageShell>;
  if (!pool) return <PageShell title="Pool administration" eyebrow="Restricted"><EmptyState title="No pool attached" body="Join the default pool before opening admin controls." /></PageShell>;
  return <PageShell title="Pool administration" eyebrow="Commissioner console">
    {notice && <p className="mb-5 rounded-lg border border-gold-400/30 bg-gold-400/10 px-4 py-3 text-sm text-gold-300">{notice}</p>}
    <Card className="mb-5 p-5"><SectionTitle>Commissioner setup checklist</SectionTitle><div className="grid gap-2 sm:grid-cols-2">{[
      {label:'Private pool created',done:!!pool},
      {label:'Invite code ready',done:!!code.trim()},
      {label:'Submission deadline set',done:!!pool.deadline},
      {label:'14 playoff teams seeded',done:teams.filter(t=>t.conference==='AFC').length===7&&teams.filter(t=>t.conference==='NFC').length===7},
      {label:'13 playoff games configured',done:games.length>=13},
      {label:'Participants joined',done:members.length>1},
    ].map(item=><div key={item.label} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"><span className={item.done?'text-green-400':'text-amber-300'}>{item.done?'✓':'○'}</span><span className="text-white">{item.label}</span></div>)}</div><p className="mt-3 text-xs text-txt-muted">Complete the checklist before inviting everyone to submit brackets. Game results and scoring still require verification.</p></Card>

    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5"><SectionTitle><span className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-gold-400"/> Pool settings</span></SectionTitle><label className="mb-2 block text-xs text-txt-muted">Bracket submission deadline</label><input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)} className="mb-3 w-full rounded-lg border border-white/10 bg-navy-950 p-3 text-white"/><GoldButton disabled={busy} onClick={()=>act(()=>supabase.rpc('pp_set_pool_deadline',{p_pool:pool.id,p_deadline:deadline ? new Date(deadline).toISOString() : null}),'Deadline saved')}>Save deadline</GoldButton><div className="my-5 border-t border-white/10"/><label className="mb-2 block text-xs text-txt-muted">Private invitation code</label><div className="flex gap-2"><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-navy-950 p-3 font-bold tracking-widest text-gold-400"/><GoldButton disabled={busy || !code.trim()} onClick={()=>act(()=>supabase.from('pool_invitations').insert({pool_id:pool.id,code:code.trim(),active:true}),'New invitation code created')}>Add code</GoldButton></div><p className="mt-2 text-xs text-txt-muted">Share this code only with invited participants. Existing codes remain active until disabled in the database.</p></Card>
      <Card className="p-5"><SectionTitle><span className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-gold-400"/> Announcement</span></SectionTitle><input value={announcementTitle} onChange={e=>setAnnouncementTitle(e.target.value)} placeholder="Announcement title" className="mb-3 w-full rounded-lg border border-white/10 bg-navy-950 p-3 text-white"/><textarea value={announcementBody} onChange={e=>setAnnouncementBody(e.target.value)} placeholder="Message to pool participants" rows={4} className="mb-3 w-full rounded-lg border border-white/10 bg-navy-950 p-3 text-white"/><GoldButton disabled={busy || !announcementTitle.trim() || !announcementBody.trim()} onClick={()=>act(()=>supabase.from('announcements').insert({pool_id:pool.id,title:announcementTitle.trim(),body:announcementBody.trim()}),'Announcement posted')}>Post announcement</GoldButton></Card>
      <Card className="p-5"><SectionTitle><span className="flex items-center gap-2"><Trophy className="h-5 w-5 text-gold-400"/> Team field</span></SectionTitle><div className="grid grid-cols-2 gap-2"><input value={teamName} onChange={e=>setTeamName(e.target.value)} placeholder="Team name" className="rounded-lg border border-white/10 bg-navy-950 p-2.5 text-sm text-white"/><input value={teamAbbr} onChange={e=>setTeamAbbr(e.target.value.toUpperCase())} placeholder="Abbreviation" className="rounded-lg border border-white/10 bg-navy-950 p-2.5 text-sm text-white"/><select value={conference} onChange={e=>setConference(e.target.value as 'AFC'|'NFC')} className="rounded-lg border border-white/10 bg-navy-950 p-2.5 text-sm text-white"><option>AFC</option><option>NFC</option></select><select value={seed} onChange={e=>setSeed(e.target.value)} className="rounded-lg border border-white/10 bg-navy-950 p-2.5 text-sm text-white">{[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n} seed</option>)}</select></div><GoldButton className="mt-3" disabled={busy || !teamName.trim() || !teamAbbr.trim()} onClick={()=>act(()=>supabase.from('playoff_teams').upsert({season:pool.season,name:teamName.trim(),abbreviation:teamAbbr.trim(),conference,seed:Number(seed)},{onConflict:'season,conference,seed'}),'Team saved')}>Save team</GoldButton><p className="mt-2 text-xs text-txt-muted">{teams.length} of 14 teams entered</p></Card>
      <Card className="p-5"><SectionTitle><span className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-gold-400"/> Build playoff matchups</span></SectionTitle><div className="grid grid-cols-2 gap-2"><select value={gameRound} onChange={e=>setGameRound(e.target.value as PlayoffGame['round'])} className="rounded-lg border border-white/10 bg-navy-950 p-2.5 text-sm text-white"><option value="wild_card">Wild Card</option><option value="divisional">Divisional</option><option value="conference">Conference Championship</option><option value="super_bowl">Super Bowl</option></select><select value={gameConference} onChange={e=>setGameConference(e.target.value as 'AFC'|'NFC'|'SB')} className="rounded-lg border border-white/10 bg-navy-950 p-2.5 text-sm text-white"><option value="AFC">AFC</option><option value="NFC">NFC</option><option value="SB">Super Bowl</option></select><input type="number" min="1" max="13" value={gameSlot} onChange={e=>setGameSlot(e.target.value)} placeholder="Game slot" className="rounded-lg border border-white/10 bg-navy-950 p-2.5 text-sm text-white"/><input type="datetime-local" value={kickoff} onChange={e=>setKickoff(e.target.value)} className="rounded-lg border border-white/10 bg-navy-950 p-2.5 text-sm text-white"/><select value={awayTeamId} onChange={e=>setAwayTeamId(e.target.value)} className="rounded-lg border border-white/10 bg-navy-950 p-2.5 text-sm text-white"><option value="">Away team</option>{teams.map(t=><option key={t.id} value={t.id}>{t.conference} #{t.seed} · {t.name}</option>)}</select><select value={homeTeamId} onChange={e=>setHomeTeamId(e.target.value)} className="rounded-lg border border-white/10 bg-navy-950 p-2.5 text-sm text-white"><option value="">Home team</option>{teams.map(t=><option key={t.id} value={t.id}>{t.conference} #{t.seed} · {t.name}</option>)}</select></div><GoldButton className="mt-3" disabled={busy || !homeTeamId || !awayTeamId || homeTeamId===awayTeamId || !gameSlot} onClick={()=>act(()=>supabase.from('playoff_games').upsert({season:pool.season,round:gameRound,game_slot:Number(gameSlot),conference:gameConference==='SB'?null:gameConference,home_team_id:homeTeamId,away_team_id:awayTeamId,kickoff:kickoff?new Date(kickoff).toISOString():null,status:'upcoming',source:'manual'},{onConflict:'season,round,game_slot'}),'Matchup saved')}>Save matchup</GoldButton><p className="mt-2 text-xs text-txt-muted">{games.length} games configured · use unique game slots within each round</p></Card>
      <Card className="p-5"><SectionTitle><span className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-gold-400"/> Game center & scores</span></SectionTitle><select value={selectedGame} onChange={e=>setSelectedGame(e.target.value)} className="mb-3 w-full rounded-lg border border-white/10 bg-navy-950 p-3 text-sm text-white"><option value="">Select game</option>{games.map(g=><option key={g.id} value={g.id}>{g.round.replace('_',' ')} · game {g.game_slot}</option>)}</select><div className="grid grid-cols-2 gap-2"><input type="number" min="0" value={awayScore} onChange={e=>setAwayScore(e.target.value)} placeholder="Away score" className="rounded-lg border border-white/10 bg-navy-950 p-3 text-white"/><input type="number" min="0" value={homeScore} onChange={e=>setHomeScore(e.target.value)} placeholder="Home score" className="rounded-lg border border-white/10 bg-navy-950 p-3 text-white"/></div><select value={status} onChange={e=>setStatus(e.target.value as any)} className="my-3 w-full rounded-lg border border-white/10 bg-navy-950 p-3 text-white"><option value="upcoming">Upcoming</option><option value="live">Live</option><option value="halftime">Halftime</option><option value="final">Final</option></select><GoldButton disabled={busy || !selectedGame || homeScore==='' || awayScore===''} onClick={()=>act(()=>supabase.from('playoff_games').update({home_score:Number(homeScore),away_score:Number(awayScore),status,source:'manual'}).eq('id',selectedGame),'Game result updated and standings recalculated')}>Update score</GoldButton><div className="mt-3"><GoldButton disabled={syncing || !games.length || !teams.length} onClick={syncEspn}><RefreshCw className="h-4 w-4"/>{syncing ? "Syncing ESPN…" : "Sync live ESPN scores now"}</GoldButton></div><p className="mt-2 text-xs text-txt-muted">The commissioner screen also syncs every 30 seconds while open. Final scores trigger automatic bracket scoring.</p></Card>
    </div>
    <Card className="mt-5 p-5"><SectionTitle><span className="flex items-center gap-2"><Users className="h-5 w-5 text-gold-400"/> Participants ({members.length})</span></SectionTitle>{members.length===0?<p className="text-sm text-txt-muted">No participants yet.</p>:<div className="divide-y divide-white/5">{members.map(m=><div key={m.user_id} className="flex items-center justify-between gap-3 py-3"><div><b className="block text-sm text-white">{m.display_name}</b><span className="text-xs text-txt-muted">{m.email} · {m.entry_count} entries · {m.role}</span></div>{m.role!=='admin'&&<GhostButton onClick={()=>act(()=>supabase.rpc('pp_revoke_member',{p_pool:pool.id,p_user:m.user_id}),'Participant removed')}><Trash2 className="h-4 w-4"/> Remove</GhostButton>}</div>)}</div>}</Card>
    <div className="mt-5 flex justify-end"><GhostButton onClick={load}><RefreshCw className="h-4 w-4"/> Refresh data</GhostButton></div>
  </PageShell>;
}
