import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Radio, CalendarDays } from 'lucide-react';

type ScoreTeam = { abbreviation: string; name: string; logo?: string; score?: string; homeAway: string };
type ScoreGame = { id: string; date: string; status: string; state: string; detail: string; teams: ScoreTeam[] };
type ApiTeam = { homeAway: string; score?: string; team?: { abbreviation?: string; shortDisplayName?: string; displayName?: string; logo?: string } };
type ApiEvent = { id: string; date: string; status?: { type?: { state?: string; shortDetail?: string; description?: string } }; competitions?: { competitors?: ApiTeam[] }[] };

function parseGames(data: { events?: ApiEvent[] }): ScoreGame[] {
 return (data.events ?? []).map(e => ({
  id: e.id, date: e.date,
  state: e.status?.type?.state ?? 'pre',
  status: e.status?.type?.description ?? 'Scheduled',
  detail: e.status?.type?.shortDetail ?? '',
  teams: (e.competitions?.[0]?.competitors ?? []).map(c => ({
   abbreviation: c.team?.abbreviation ?? 'TBD',
   name: c.team?.shortDisplayName ?? c.team?.displayName ?? 'TBD',
   logo: c.team?.logo, score: c.score, homeAway: c.homeAway,
  })).sort((a,b) => a.homeAway === 'away' ? -1 : b.homeAway === 'away' ? 1 : 0),
 })).filter(g=>g.teams.length===2);
}

export default function NFLScoreboard() {
 const [games,setGames]=useState<ScoreGame[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState(false);
 const [updated,setUpdated]=useState<Date|null>(null);
 const [refresh,setRefresh]=useState(0);
 const trackRef=useRef<HTMLDivElement|null>(null);
 const pausedRef=useRef(false);
 const [reduceMotion,setReduceMotion]=useState(false);
 useEffect(()=>{const query=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduceMotion(query.matches);update();query.addEventListener('change',update);return ()=>query.removeEventListener('change',update)},[]);
 useEffect(()=>{const track=trackRef.current;if(!track||games.length<2||reduceMotion)return;let frame=0;let previous=0;const step=(time:number)=>{if(previous===0)previous=time;const elapsed=Math.min(time-previous,50);previous=time;if(!pausedRef.current&&track.scrollWidth>track.clientWidth){const max=track.scrollWidth-track.clientWidth;track.scrollLeft=Math.min(max,track.scrollLeft+elapsed*.025);if(track.scrollLeft>=max-1)track.scrollLeft=0;}frame=requestAnimationFrame(step)};frame=requestAnimationFrame(step);return ()=>cancelAnimationFrame(frame)},[games,reduceMotion]);
 useEffect(()=>{
  let alive=true;
  const load=async()=>{
   try {
    const response=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=50',{cache:'no-store'});
    if(!response.ok) throw new Error('Scores unavailable');
    const data=await response.json();
    if(!alive)return;
    const parsed=parseGames(data);
    const now=Date.now();
    parsed.sort((a,b)=>{
      const rank=(g:ScoreGame)=>g.state==='in'?0:g.state==='pre'?1:2;
      const diff=rank(a)-rank(b);
      if(diff)return diff;
      return a.state==='post'?new Date(b.date).getTime()-new Date(a.date).getTime():Math.abs(new Date(a.date).getTime()-now)-Math.abs(new Date(b.date).getTime()-now);
    });
    setGames(parsed.slice(0,8));setUpdated(new Date());setError(false);
   } catch {if(alive)setError(true)}
   finally {if(alive)setLoading(false)}
  };
  void load();
  const interval=setInterval(()=>void load(),60000);
  return ()=>{alive=false;clearInterval(interval)};
 },[refresh]);
 return <section aria-label="NFL live scores and upcoming games" className="mx-auto max-w-[1500px] px-4 pt-5 sm:px-7">
  <div className="overflow-hidden rounded-xl border border-amber-300/30 bg-[#08172d] shadow-lg">
   <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
    <div className="flex items-center gap-1"><Radio className="h-5 w-5 text-amber-300"/><h2 className="font-display text-lg font-extrabold uppercase tracking-wide text-white sm:text-xl">NFL Scores & Upcoming Games</h2></div>
    <div className="flex items-center gap-3"><span className="text-[11px] text-slate-400">{updated?'Updated '+updated.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'Updates every 60 sec'}</span><button type="button" onClick={()=>setRefresh(v=>v+1)} aria-label="Refresh NFL scores" className="rounded-md border border-white/20 p-2 text-amber-200 hover:bg-white/10"><RefreshCw className="h-4 w-4"/></button></div>
   </div>
   {loading?<p className="px-5 py-6 text-sm text-slate-300">Loading NFL games…</p>:error&&games.length===0?<p className="px-5 py-6 text-sm text-slate-300">Scores are temporarily unavailable. Try refreshing.</p>:games.length===0?<p className="px-5 py-6 text-sm text-slate-300">No NFL games are currently listed.</p>:
   <div ref={trackRef} onMouseEnter={()=>{pausedRef.current=true}} onMouseLeave={()=>{pausedRef.current=false}} onTouchStart={()=>{pausedRef.current=true}} onTouchEnd={()=>{pausedRef.current=false}} className="flex gap-2 overflow-x-auto px-3 py-3 sm:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {games.map(g=><article key={g.id} className="w-[118px] shrink-0 rounded-lg border border-white/15 bg-gradient-to-br from-[#203657] to-[#0b172b] p-2 sm:w-[125px]">
     <div className="mb-2 flex flex-col gap-0.5 text-[9px]">
      <span className={g.state==='in'?'font-bold text-red-400':'text-amber-200'}>{g.state==='in'?'● LIVE':g.state==='post'?'FINAL':'UPCOMING'}</span>
      <span className="truncate text-slate-300">{g.state==='pre'?new Date(g.date).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'}):g.detail}</span>
     </div>
     <div className="space-y-1">{g.teams.map(t=><div key={t.homeAway} className="flex items-center gap-2">
      {t.logo?<img src={t.logo} alt="" className="h-5 w-5 shrink-0 object-contain"/>:<span className="h-5 w-5 shrink-0"/>}
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white">{t.abbreviation}</span>
      <strong className="text-sm tabular-nums text-white">{g.state==='pre'?'–':t.score??'–'}</strong>
     </div>)}</div>
     <div className="mt-2 flex items-center gap-1 border-t border-white/10 pt-1.5 text-[9px] text-slate-300"><CalendarDays className="h-3 w-3"/>{g.state==='pre'?new Date(g.date).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})+' ET':g.status}</div>
    </article>)}
   </div>}
   <p className="px-4 pb-3 text-[10px] text-slate-500 sm:px-6">NFL game data via ESPN. Scores refresh every minute. Games move automatically; hover or touch to pause.</p>
  </div>
 </section>;
}
