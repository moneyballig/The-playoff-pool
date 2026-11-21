import { useEffect, useState } from 'react';
import { Crown, LockKeyhole, PieChart, Trophy, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, EmptyState, Spinner } from '@/components/ui';
type Prediction={team_id:string;team_name:string;abbreviation:string;logo_url:string|null;pick_count:number;total_entries:number};
export default function ChampionStatistics(){
 const {user,pool}=useAuth();
 const [rows,setRows]=useState<Prediction[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),60000);return()=>window.clearInterval(timer);},[]);
 const deadline=pool?.deadline?new Date(pool.deadline).getTime():null;
 const revealed=!!deadline&&now>=deadline;
 useEffect(()=>{
  let live=true;
  if(!pool||!user||!revealed){setRows([]);setLoading(false);return;}
  async function load(){
   setLoading(true);setError('');
   const {data,error:e}=await supabase.rpc('pp_champion_predictions',{p_pool:pool!.id});
   if(live){if(e)setError(e.message);else setRows((data??[]) as Prediction[]);setLoading(false);}
  }
  void load();const timer=window.setInterval(()=>void load(),60000);
  return()=>{live=false;window.clearInterval(timer);};
 },[pool?.id,user?.id,revealed]);
 if(!user||!pool)return <main className="mx-auto max-w-5xl px-4 py-10"><h1 className="font-display text-3xl font-extrabold uppercase text-white">Champion Predictions</h1><EmptyState title="Private pool statistics" body="Sign in and join your private pool to see champion predictions once entries close."/></main>;
 if(!revealed)return <main className="mx-auto max-w-5xl px-4 py-10">
  <p className="text-xs font-bold uppercase tracking-[.2em] text-gold-400">Pool insights</p>
  <h1 className="mt-1 font-display text-3xl font-extrabold uppercase text-white">Champion Predictions</h1>
  <Card className="mt-6 p-7 text-center sm:p-12"><LockKeyhole className="mx-auto mb-4 h-12 w-12 text-gold-400"/><h2 className="font-display text-xl font-extrabold uppercase text-white">Predictions are locked until entries close</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-txt-secondary">To keep the competition fair, we won't reveal which Super Bowl champions other participants selected until the submission deadline has passed.</p><p className="mt-4 font-bold text-gold-400">{deadline?new Date(deadline).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'full',timeStyle:'short'})+' Eastern':'The commissioner has not set a deadline.'}</p></Card>
 </main>;
 if(loading)return <Spinner label="Loading champion predictions…"/>;
 const total=rows[0]?.total_entries??0;
 const votes=rows.reduce((sum,r)=>sum+Number(r.pick_count),0);
 return <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
  <p className="text-xs font-bold uppercase tracking-[.2em] text-gold-400">Pool insights · {pool.season}–{String(pool.season+1).slice(-2)}</p>
  <h1 className="mt-1 font-display text-3xl font-extrabold uppercase text-white">Champion Predictions</h1>
  <p className="mt-2 text-sm text-txt-secondary">See which NFL teams participants picked to win the Super Bowl.</p>
  {error&&<p role="alert" className="mt-5 rounded-lg border border-red-400/30 p-3 text-sm text-red-300">{error}</p>}
  <div className="my-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
   <Card className="p-4"><Users className="mb-2 h-5 w-5 text-gold-400"/><p className="text-xs text-txt-muted">Submitted entries</p><strong className="font-display text-2xl text-white">{total}</strong></Card>
   <Card className="p-4"><PieChart className="mb-2 h-5 w-5 text-gold-400"/><p className="text-xs text-txt-muted">Champion picks counted</p><strong className="font-display text-2xl text-white">{votes}</strong></Card>
   <Card className="col-span-2 p-4 sm:col-span-1"><Trophy className="mb-2 h-5 w-5 text-gold-400"/><p className="text-xs text-txt-muted">Most popular pick</p><strong className="block truncate font-display text-lg text-white">{rows[0]?.team_name??'—'}</strong></Card>
  </div>
  {rows.length===0?<EmptyState title="No champion predictions yet" body="Submitted entries with a Super Bowl winner will appear here once available."/>:<div className="space-y-3">
   {rows.map((team,index)=>{
    const pct=total>0?Number(team.pick_count)/total*100:0;
    return <Card key={team.team_id} className="p-4 sm:p-5">
     <div className="flex items-center gap-3">
      <span className="w-7 shrink-0 text-center font-display text-lg font-bold text-gold-400">{index===0?<Crown className="mx-auto h-5 w-5"/>:'#'+(index+1)}</span>
      {team.logo_url?<img src={team.logo_url} alt="" className="h-10 w-10 shrink-0 object-contain"/>:<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">{team.abbreviation}</span>}
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-white sm:text-base">{team.team_name}</p><p className="text-xs text-txt-muted">{team.pick_count} {Number(team.pick_count)===1?'entry':'entries'}</p></div>
      <strong className="font-display text-xl text-gold-400">{pct.toFixed(1)}%</strong>
     </div>
     <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-300" style={{width:pct+'%'}}/></div>
    </Card>;
   })}
  </div>}
  <p className="mt-5 text-xs leading-5 text-txt-muted">Percentages use all submitted entries, including entries without a recorded champion. Each submitted bracket counts separately. Statistics refresh every minute and are not visible before the deadline.</p>
 </main>;
}
