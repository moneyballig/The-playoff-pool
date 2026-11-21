import { useEffect, useMemo, useState } from 'react';
import { Crown, Target, Trophy, TrendingUp, CheckCircle2, BarChart3 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Bracket, PlayoffTeam } from '@/lib/types';
import { Card, EmptyState, Spinner, TeamLogo } from '@/components/ui';

type Potential={bracket_id:string;max_possible:number;remaining_points:number;incorrect_picks:number};
type Entry=Bracket&{champion:PlayoffTeam|null;pickCount:number;potential:Potential|null};
export default function PersonalDashboard(){
 const {user,pool}=useAuth();
 const [entries,setEntries]=useState<Entry[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
  let live=true;
  async function load(){
   if(!user||!pool){setEntries([]);setLoading(false);return;}
   setLoading(true);setError('');
   try{
    const [b,t,p]=await Promise.all([
     supabase.from('brackets').select('*').eq('pool_id',pool.id).eq('user_id',user.id).order('entry_number'),
     supabase.from('playoff_teams').select('*').eq('season',pool.season),
     supabase.rpc('pp_leaderboard_potential',{p_pool:pool.id})
    ]);
    if(b.error)throw b.error;
    const brackets=(b.data??[]) as Bracket[];
    const ids=brackets.map(x=>x.id);
    const picks=ids.length?await supabase.from('bracket_picks').select('bracket_id,pick_key,team_id').in('bracket_id',ids):{data:[],error:null};
    if(picks.error)throw picks.error;
    const teams=new Map(((t.data??[]) as PlayoffTeam[]).map(x=>[x.id,x]));
    const ceilings=new Map(((p.data??[]) as Potential[]).map(x=>[x.bracket_id,x]));
    const byBracket=new Map<string,{count:number;champion:PlayoffTeam|null}>();
    for(const pick of picks.data??[]){
     const current=byBracket.get(pick.bracket_id)??{count:0,champion:null};
     current.count++;
     if(pick.pick_key==='sb')current.champion=teams.get(pick.team_id)??null;
     byBracket.set(pick.bracket_id,current);
    }
    if(live)setEntries(brackets.map(b=>({...b,champion:byBracket.get(b.id)?.champion??null,pickCount:byBracket.get(b.id)?.count??0,potential:ceilings.get(b.id)??null})));
   }catch(e){if(live)setError(e instanceof Error?e.message:'Could not load your dashboard');}
   finally{if(live)setLoading(false);}
  }
  void load();return()=>{live=false;};
 },[user?.id,pool?.id,pool?.season]);
 const submitted=useMemo(()=>entries.filter(e=>e.submitted),[entries]);
 const best=useMemo(()=>[...submitted].sort((a,b)=>(a.rank??999999)-(b.rank??999999))[0],[submitted]);
 if(!user||!pool)return <main className="mx-auto max-w-5xl px-4 py-10"><h1 className="font-display text-3xl font-extrabold uppercase text-white">My Dashboard</h1><EmptyState title="Your private dashboard" body="Sign in and join your pool to view your personal playoff performance."/></main>;
 if(loading)return <Spinner label="Loading your dashboard…"/>;
 return <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
  <p className="text-xs font-bold uppercase tracking-[.2em] text-gold-400">Your postseason performance</p>
  <h1 className="mt-1 font-display text-3xl font-extrabold uppercase text-white">My Dashboard</h1>
  <p className="mb-6 mt-2 text-sm text-txt-secondary">Your private overview for the {pool.season}–{String(pool.season+1).slice(-2)} NFL playoffs.</p>
  {error&&<p role="alert" className="mb-4 rounded-lg border border-red-400/30 p-3 text-sm text-red-300">{error}</p>}
  <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
   {[
    {label:'Best rank',value:best?.rank?'#'+best.rank:'—',icon:Crown},
    {label:'Submitted entries',value:submitted.length+'/'+Math.max(1,entries.length),icon:Trophy},
    {label:'Best points',value:submitted.length?Math.max(...submitted.map(e=>e.total_points)):0,icon:Target},
    {label:'Best possible',value:submitted.length?Math.max(...submitted.map(e=>e.potential?.max_possible??e.total_points)):0,icon:TrendingUp}
   ].map(stat=><Card key={stat.label} className="p-4"><stat.icon className="mb-2 h-5 w-5 text-gold-400"/><p className="text-xs text-txt-muted">{stat.label}</p><strong className="mt-1 block font-display text-2xl text-white">{stat.value}</strong></Card>)}
  </div>
  <h2 className="mb-3 font-display text-xl font-bold uppercase text-white">Your brackets</h2>
  {entries.length===0?<EmptyState title="No entries yet" body="Create your first bracket under My Entries, then select winners on the homepage."/>:<div className="grid gap-4 md:grid-cols-2">
   {entries.map(entry=><Card key={entry.id} className="p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display text-xl font-bold text-white">{entry.name}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${entry.submitted?'bg-green-500/15 text-green-300':'bg-amber-400/15 text-amber-200'}`}>{entry.submitted?'Submitted':'Draft'}</span></div>
    <p className="mt-1 text-xs text-txt-muted">Entry {entry.entry_number} · {entry.pickCount}/13 selections saved</p>
    <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-white/5 p-3 text-center">
     <div><p className="text-[11px] text-txt-muted">Rank</p><p className="font-display text-xl font-bold text-white">{entry.submitted&&entry.rank?'#'+entry.rank:'—'}</p></div>
     <div><p className="text-[11px] text-txt-muted">Points</p><p className="font-display text-xl font-bold text-gold-400">{entry.total_points}</p></div>
     <div><p className="text-[11px] text-txt-muted">Correct</p><p className="font-display text-xl font-bold text-white">{entry.correct_picks}</p></div>
    </div>
    <div className="mt-4 flex items-center justify-between gap-2 text-sm"><span className="text-txt-secondary">Maximum possible</span><strong className="text-white">{entry.potential?.max_possible??'—'} pts</strong></div>
    <div className="mt-2 flex items-center justify-between gap-2 text-sm"><span className="text-txt-secondary">Points still available</span><strong className="text-white">{entry.potential?.remaining_points??'—'}</strong></div>
    <div className="mt-4 flex items-center gap-3 rounded-lg border border-gold-400/20 bg-gold-400/5 p-3"><Crown className="h-5 w-5 shrink-0 text-gold-400"/>{entry.champion?<><TeamLogo team={entry.champion} size={36}/><div className="min-w-0"><p className="text-[11px] text-txt-muted">Predicted Super Bowl champion</p><p className="truncate text-sm font-bold text-white">{entry.champion.name}</p></div></>:<span className="text-sm text-txt-muted">No Super Bowl champion selected yet</span>}</div>
    <div className="mt-3 flex items-center gap-2 text-xs text-txt-muted"><CheckCircle2 className="h-4 w-4"/>{entry.submitted?'Your submitted bracket is included in pool rankings.':'Submit all 13 picks to enter the leaderboard.'}</div>
   </Card>)}
  </div>}
  <p className="mt-5 flex items-center gap-2 text-xs text-txt-muted"><BarChart3 className="h-4 w-4"/>Points and rankings update as playoff results are recorded. This page does not change your picks.</p>
 </main>;
}
