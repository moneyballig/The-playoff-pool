import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Clock3, Crown, RefreshCw, Target, Trophy, TrendingUp, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { LeaderboardRow } from '@/lib/types';
import { Card, EmptyState, Spinner } from '@/components/ui';

type Potential = {bracket_id:string;max_possible:number;remaining_points:number;incorrect_picks:number};
type Sort = 'rank'|'possible'|'correct';
function Podium({rows,userId}:{rows:LeaderboardRow[];userId?:string}) {
 const positions=[rows[1],rows[0],rows[2]];
 const heights=['h-24 sm:h-32','h-32 sm:h-44','h-20 sm:h-28'];
 const colors=['border-slate-300/60 text-slate-200','border-amber-300/80 text-amber-300','border-orange-400/60 text-orange-300'];
 return <section aria-label="Top three ranked brackets" className="mb-6 overflow-hidden rounded-2xl border border-gold-400/25 bg-gradient-to-b from-[#17263d] via-[#0b1729] to-[#070f1e] px-3 pb-5 pt-6 sm:px-8">
  <div className="mb-5 text-center"><Crown className="mx-auto mb-1 h-6 w-6 text-gold-400"/><h2 className="font-display text-lg font-extrabold uppercase tracking-widest text-white">Top 3 Brackets</h2><p className="mt-1 text-xs text-txt-muted">The current leaders in your pool</p></div>
  <div className="mx-auto grid max-w-3xl grid-cols-3 items-end gap-2 sm:gap-5">
   {positions.map((entry,i)=>{
    const rank=[2,1,3][i];const mine=entry?.user_id===userId;
    return <div key={rank} className="flex min-w-0 flex-col items-center text-center">
     <div className={`mb-2 flex h-12 w-12 items-center justify-center rounded-full border-2 bg-[#1b2c44] shadow-lg sm:h-16 sm:w-16 ${colors[i]}`}>{entry?<span className="font-display text-xl font-extrabold sm:text-2xl">{(entry.display_name||entry.entry_name).slice(0,1).toUpperCase()}</span>:<Trophy className="h-5 w-5 opacity-50"/>}</div>
     <p className="w-full truncate text-xs font-bold text-white sm:text-sm">{entry?.display_name??'Open spot'}</p>
     <p className="w-full truncate text-[10px] text-txt-muted sm:text-xs">{entry?.entry_name??'Awaiting entry'}</p>
     <p className={`mb-3 mt-1 font-display text-base font-extrabold sm:text-xl ${rank===1?'text-amber-300':rank===2?'text-slate-200':'text-orange-300'}`}>{entry?entry.total_points+' pts':'—'}</p>
     <div className={`relative flex w-full flex-col items-center justify-start rounded-t-xl border-x-2 border-t-2 bg-gradient-to-b from-white/15 to-white/[.03] pt-3 ${heights[i]} ${colors[i]} ${mine?'ring-2 ring-gold-400/40':''}`}>
      {rank===1&&<Crown className="mb-1 h-5 w-5 text-amber-300"/>}
      <span className="font-display text-4xl font-black sm:text-6xl">{rank}</span>
      {mine&&<span className="mt-1 rounded bg-gold-400/20 px-1.5 py-0.5 text-[9px] font-bold text-gold-400">YOU</span>}
     </div>
    </div>;
   })}
  </div>
 </section>;
}
export default function AdvancedLeaderboard() {
 const {pool,user}=useAuth();
 const [rows,setRows]=useState<LeaderboardRow[]>([]);
 const [potential,setPotential]=useState<Record<string,Potential>>({});
 const [movement,setMovement]=useState<Record<string,number>>({});
 const [busy,setBusy]=useState(true);
 const [refreshing,setRefreshing]=useState(false);
 const [error,setError]=useState('');
 const [updated,setUpdated]=useState<Date|null>(null);
 const [onlyMine,setOnlyMine]=useState(false);
 const [sort,setSort]=useState<Sort>('rank');
 const previous=useRef<Map<string,number>|null>(null);
 const inFlight=useRef(false);
 useEffect(()=>{
  previous.current=null;setRows([]);setPotential({});setMovement({});setBusy(true);
  if(!pool){setBusy(false);return;}
  let live=true;
  const load=async()=>{
   if(inFlight.current)return;inFlight.current=true;setRefreshing(true);
   try{
    const [standings,ceilings]=await Promise.all([
      supabase.rpc('pp_leaderboard',{p_pool:pool.id}),
      supabase.rpc('pp_leaderboard_potential',{p_pool:pool.id})
    ]);
    if(!live)return;
    if(standings.error)throw standings.error;
    const next=(standings.data??[]) as LeaderboardRow[];
    const previousRanks=previous.current;
    const nextRanks=new Map(next.map((r,i)=>[r.bracket_id,r.rank??i+1]));
    if(previousRanks){
     const changes:Record<string,number>={};
     nextRanks.forEach((rank,id)=>{const old=previousRanks.get(id);if(old!==undefined)changes[id]=old-rank;});
     setMovement(changes);
    }
    previous.current=nextRanks;
    setRows(next);
    if(!ceilings.error){const map:Record<string,Potential>={};for(const item of (ceilings.data??[]) as Potential[])map[item.bracket_id]=item;setPotential(map);}
    else setPotential({});
    setError(ceilings.error?'Potential points temporarily unavailable. Rankings are still current.':'');
    setUpdated(new Date());
   }catch(e){if(live)setError(e instanceof Error?e.message:'Unable to load standings.');}
   finally{inFlight.current=false;if(live){setBusy(false);setRefreshing(false);}}
  };
  void load();
  const timer=window.setInterval(()=>void load(),60000);
  return()=>{live=false;window.clearInterval(timer);};
 },[pool?.id]);
 const shown=useMemo(()=>{
  const filtered=rows.filter(r=>!onlyMine||r.user_id===user?.id);
  if(sort==='possible')return [...filtered].sort((a,b)=>(potential[b.bracket_id]?.max_possible??b.total_points)-(potential[a.bracket_id]?.max_possible??a.total_points)||(a.rank??999)-(b.rank??999));
  if(sort==='correct')return [...filtered].sort((a,b)=>b.correct_picks-a.correct_picks||(a.rank??999)-(b.rank??999));
  return filtered;
 },[rows,potential,onlyMine,user?.id,sort]);
 const leader=rows[0];
 const myBest=rows.filter(r=>r.user_id===user?.id).sort((a,b)=>(a.rank??999)-(b.rank??999))[0];
 if(!pool)return <main className="mx-auto max-w-6xl px-4 py-10"><h1 className="font-display text-3xl font-extrabold uppercase text-white">Leaderboard</h1><EmptyState title="Private pool access" body="Sign in and join your private pool to see standings."/></main>;
 if(busy)return <Spinner label="Loading standings…"/>;
 return <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
   <div><p className="text-xs font-bold uppercase tracking-[.2em] text-gold-400">{pool.season}-27 NFL Playoffs</p><h1 className="mt-1 font-display text-3xl font-extrabold uppercase text-white">Leaderboard</h1><p className="mt-1 text-xs text-txt-muted">Private pool standings · updates every 60 seconds</p></div>
   <span className="inline-flex items-center gap-2 text-xs text-txt-muted"><RefreshCw className={`h-4 w-4 ${refreshing?'animate-spin':''}`}/>{updated?'Updated '+updated.toLocaleTimeString():'Waiting for scores'}</span>
  </div>
  {error&&<p role="alert" className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">{error}</p>}
  {rows.length>0&&<Podium rows={rows} userId={user?.id}/>}
  <h2 className="mb-3 font-display text-lg font-extrabold uppercase text-white">Full Standings <span className="ml-1 text-xs font-normal text-txt-muted">All ranks below the podium</span></h2>
  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
   <div className="inline-flex rounded-lg border border-white/15 bg-white/5 p-1"><button type="button" onClick={()=>setOnlyMine(false)} className={`rounded-md px-3 py-2 text-xs font-bold ${!onlyMine?'bg-gold-400 text-navy-950':'text-txt-secondary'}`}>All entries</button><button type="button" onClick={()=>setOnlyMine(true)} className={`rounded-md px-3 py-2 text-xs font-bold ${onlyMine?'bg-gold-400 text-navy-950':'text-txt-secondary'}`}>My entries</button></div>
   <label className="flex items-center gap-2 text-xs text-txt-muted">Sort by <select value={sort} onChange={e=>setSort(e.target.value as Sort)} className="rounded-lg border border-white/15 bg-[#0b1c35] px-2 py-2 text-sm text-white"><option value="rank">Current rank</option><option value="possible">Max possible</option><option value="correct">Correct picks</option></select></label>
  </div>
  <Card className="overflow-hidden p-0">
   <div className="grid grid-cols-[44px_minmax(0,1fr)_54px_58px] items-center gap-2 border-b border-white/10 bg-white/5 px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-txt-muted sm:grid-cols-[65px_minmax(0,1fr)_90px_90px_100px_85px] sm:px-5"><span>Rank</span><span>Participant / Entry</span><span className="text-right">Points</span><span className="text-right">Max</span><span className="hidden text-right sm:block">Correct</span><span className="hidden text-right sm:block">Tiebreak</span></div>
   {shown.length===0?<div className="p-8 text-center text-sm text-txt-muted">{onlyMine?'You have no submitted entries in the standings yet.':'No submitted brackets yet. Entries will appear here after submission.'}</div>:shown.map((r,i)=>{
    const mine=r.user_id===user?.id;const change=movement[r.bracket_id]??0;const possible=potential[r.bracket_id];
    return <div key={r.bracket_id} className={`grid grid-cols-[44px_minmax(0,1fr)_54px_58px] items-center gap-2 border-b border-white/10 px-3 py-4 last:border-0 sm:grid-cols-[65px_minmax(0,1fr)_90px_90px_100px_85px] sm:px-5 ${mine?'bg-gold-400/10':''}`}>
     <div><div className="flex items-center gap-1 font-display text-lg font-extrabold text-gold-400">{r.rank??i+1}{r.rank===1&&<Crown className="h-4 w-4"/>}</div>{change>0?<span className="inline-flex items-center text-[10px] font-bold text-green-400"><ArrowUp className="h-3 w-3"/>{change}</span>:change<0?<span className="inline-flex items-center text-[10px] font-bold text-red-400"><ArrowDown className="h-3 w-3"/>{Math.abs(change)}</span>:<span className="text-[10px] text-txt-muted">—</span>}</div>
     <div className="min-w-0"><div className="flex items-center gap-2"><strong className="truncate text-sm text-white">{r.display_name??'Participant'}</strong>{mine&&<span className="shrink-0 rounded bg-gold-400/20 px-1.5 py-0.5 text-[9px] font-bold text-gold-400">YOU</span>}</div><p className="truncate text-xs text-txt-muted">{r.entry_name} · Bracket {r.entry_number}</p><p className="mt-1 text-[11px] text-txt-muted sm:hidden">{r.correct_picks} correct · {possible?.remaining_points??'—'} pts remaining</p></div>
     <strong className="text-right font-display text-lg text-gold-400">{r.total_points}</strong>
     <div className="text-right"><strong className="font-display text-base text-white">{possible?.max_possible??'—'}</strong><span className="hidden text-[10px] text-txt-muted sm:block">{possible?possible.remaining_points+' remaining':''}</span></div>
     <span className="hidden text-right text-sm text-txt-secondary sm:block">{r.correct_picks}/13</span>
     <span className="hidden text-right text-sm text-txt-secondary sm:block">{r.tiebreaker_points??'—'}</span>
    </div>;
   })}
  </Card>
  <div className="mt-4 space-y-2 text-xs text-txt-muted"><p className="flex items-start gap-2"><TrendingUp className="mt-0.5 h-4 w-4 shrink-0"/>Max = points earned + points still attainable from picks whose teams haven't been eliminated. Rank arrows compare with the previous live refresh; they appear when a rank changes while this page is open.</p><p className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0"/>Scoring: Wild Card 1 · Divisional 2 · Conference 4 · Super Bowl 8. Tiebreaker: closest to the Super Bowl combined score.</p></div>
 </main>;
}
