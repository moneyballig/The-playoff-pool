import { useEffect, useMemo, useState } from 'react';
import { Trophy, Save, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { buildBracket, allMatchups, validPicks, type Matchup, type PickMap } from '@/lib/bracket';
import type { Bracket, PlayoffGame, PlayoffTeam } from '@/lib/types';
import { GoldButton, TeamLogo } from '@/components/ui';

function Game({ m, locked, pick }: {m:Matchup;locked:boolean;pick:(key:string,id:string)=>void}) {
 return <div className="gridiron-match rounded-lg border border-white/20 bg-[#0b1c35] p-2">
  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">{m.round==='wild_card'?'Wild Card':m.round==='divisional'?'Divisional':m.round==='conference'?'Conference Championship':'Super Bowl'}</div>
  {([m.home,m.away] as const).map((team,i)=><button key={i} type="button" disabled={locked||!team} onClick={()=>team&&pick(m.key,team.id)} className={`flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left transition ${m.userPick?.id===team?.id?'border-amber-300 bg-amber-400/20 text-amber-200':'border-transparent border-b-white/10 text-white hover:bg-white/10'} disabled:cursor-default`}>
    {team?<><span className="w-4 shrink-0 text-xs font-bold text-amber-300">{team.seed}</span><TeamLogo team={team} size={26}/><span className="min-w-0 flex-1 truncate text-xs font-semibold">{team.name}</span>{m.userPick?.id===team.id&&<Check className="h-4 w-4 shrink-0 text-amber-300"/>}</>:<span className="py-1 text-xs text-slate-400">{i===0?(m.homeLabel??'TBD'):(m.awayLabel??'TBD')}</span>}
  </button>)}
 </div>;
}
function Round({title,items,locked,pick}:{title:string;items:Matchup[];locked:boolean;pick:(key:string,id:string)=>void}) {
 return <div className="flex min-w-0 flex-col justify-center gap-4"><h3 className="text-center font-display text-xs font-bold uppercase tracking-wider text-amber-200">{title}</h3>{items.map(m=><Game key={m.key} m={m} locked={locked} pick={pick}/>)}</div>;
}
export default function HomeBracketEditor({teams,games,brackets,onJoinClick,onEntries}:{teams:PlayoffTeam[];games:PlayoffGame[];brackets:Bracket[];onJoinClick:()=>void;onEntries:()=>void}) {
 const {user,pool}=useAuth();
 const [selected,setSelected]=useState('');
 const [picks,setPicks]=useState<PickMap>({});
 const [busy,setBusy]=useState(false);
 const [submittedIds,setSubmittedIds]=useState<string[]>([]);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [tiebreaker,setTiebreaker]=useState('');
 const [loading,setLoading]=useState(false);
 const active=brackets.find(b=>b.id===selected)??brackets[0]??null;
 useEffect(()=>{if(!brackets.some(b=>b.id===selected))setSelected(brackets[0]?.id??'');},[brackets,selected]);
 useEffect(()=>{
  let live=true;
  setPicks({});
  if(!active)return;
  setLoading(true);
  supabase.from('bracket_picks').select('pick_key,team_id').eq('bracket_id',active.id).then(({data,error:e})=>{
   if(!live)return;
   if(e)setError(e.message);
   const map:PickMap={};for(const p of data??[])map[p.pick_key]=p.team_id;
   setPicks(map);setTiebreaker(active.tiebreaker_points==null?'':String(active.tiebreaker_points));setLoading(false);
  });
  return ()=>{live=false;};
 },[active?.id]);
 const derived=useMemo(()=>buildBracket(teams,games,picks),[teams,games,picks]);
 const count=allMatchups(derived).filter(m=>m.userPick&&(m.userPick.id===m.home?.id||m.userPick.id===m.away?.id)).length;
 const locked=!!pool?.deadline&&new Date(pool.deadline).getTime()<=Date.now();
 const pick=(key:string,id:string)=>{if(locked||!active||busy)return;setPicks(prev=>({...prev,[key]:id}));setNotice('Unsaved changes');};
 const persist=async(submit:boolean)=>{
  if(!active||locked||busy)return;
  setBusy(true);setError('');setNotice('');
  const payload=validPicks(derived);
  const {error:e}=await supabase.rpc('pp_save_picks',{p_bracket:active.id,p_picks:payload});
  if(e){setError(e.message);setBusy(false);return;}
  if(submit){
   if(payload.length!==13){setError('Choose all 13 winners before submitting.');setBusy(false);return;}
   const {error:submitError}=await supabase.rpc('pp_submit_bracket',{p_bracket:active.id,p_tiebreaker:tiebreaker.trim()?Number(tiebreaker):null});
   if(submitError){setError(submitError.message);setBusy(false);return;}
   setSubmittedIds(ids=>ids.includes(active.id)?ids:[...ids,active.id]);
   setNotice('Bracket submitted! You can edit and resubmit until the deadline.');
  }else setNotice('Picks saved successfully.');
  setBusy(false);
 };
 return <section id="home-bracket" className="mx-auto max-w-[1500px] px-4 pt-5 sm:px-7">
  <div className="gridiron-panel overflow-hidden rounded-xl border border-amber-300/30">
   <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300/25 bg-[#08172d] px-4 py-4 sm:px-8">
    <span className="font-display text-xl font-extrabold uppercase italic text-amber-300">AFC</span>
    <h2 className="font-display text-lg font-extrabold uppercase italic tracking-wider text-white sm:text-3xl">NFL Playoff Bracket</h2>
    <span className="font-display text-xl font-extrabold uppercase italic text-sky-300">NFC</span>
   </div>
   <div className="border-b border-white/10 bg-[#08172d]/80 px-4 py-4 sm:px-8">
    {!user?<GoldButton onClick={onJoinClick}>Sign in to make your picks</GoldButton>:!pool?<GoldButton onClick={onJoinClick}>Join a pool to make picks</GoldButton>:brackets.length===0?<GoldButton onClick={onEntries}>Create your first bracket</GoldButton>:<div className="flex flex-wrap items-center gap-3">
     <label htmlFor="home-bracket-entry" className="text-sm font-bold text-white">Your entry</label>
     <select id="home-bracket-entry" className="min-w-40 rounded-lg border border-amber-300/40 bg-[#0b1c35] px-3 py-2 text-sm text-white" value={active?.id??''} onChange={e=>setSelected(e.target.value)}>{brackets.map(b=><option key={b.id} value={b.id}>{b.name}{b.submitted||submittedIds.includes(b.id)?' (Submitted)':''}</option>)}</select>
     <span className="text-sm text-amber-200">{count}/13 picks</span>
     {(active?.submitted||submittedIds.includes(active?.id??''))&&<span className="rounded-full border border-green-500/30 px-2 py-1 text-xs text-green-300">Submitted · editable before deadline</span>}
     {locked&&<span className="text-sm font-bold text-red-300">Deadline passed · picks locked</span>}
     <GoldButton onClick={onEntries}>Manage entries</GoldButton>
    </div>}
    {notice&&<p role="status" className="mt-2 text-sm text-green-300">{notice}</p>}
    {error&&<p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
    <p className="mt-2 text-xs text-slate-300">{active?'Select a team in each matchup to advance it. Save your picks, then submit when all 13 are selected.':'The bracket is visible to everyone. Sign in and create an entry to make picks.'}</p>
   </div>
   {loading?<p className="p-10 text-center text-amber-200">Loading your saved predictions…</p>:<div className="gridiron-bracket-scroll overflow-x-auto p-4 sm:p-6">
    <div className="grid min-w-[1190px] grid-cols-[1.3fr_1fr_0.9fr_0.9fr_0.9fr_1fr_1.3fr] items-center gap-3 lg:gap-5">
     <Round title="AFC Wild Card" items={derived.afcWC} locked={locked||!active||busy} pick={pick}/>
     <Round title="AFC Divisional" items={derived.afcDiv} locked={locked||!active||busy} pick={pick}/>
     <Round title="AFC Championship" items={derived.afcConf?[derived.afcConf]:[]} locked={locked||!active||busy} pick={pick}/>
     <div className="flex flex-col items-center gap-4"><Trophy className="h-16 w-16 text-amber-300"/><h3 className="font-display text-xl font-extrabold uppercase text-amber-200">Super Bowl</h3>{derived.superBowl&&<Game m={derived.superBowl} locked={locked||!active||busy} pick={pick}/>}
      {derived.champion&&<p className="text-center text-sm font-bold text-amber-300">Your champion: {derived.champion.name}</p>}
     </div>
     <Round title="NFC Championship" items={derived.nfcConf?[derived.nfcConf]:[]} locked={locked||!active||busy} pick={pick}/>
     <Round title="NFC Divisional" items={derived.nfcDiv} locked={locked||!active||busy} pick={pick}/>
     <Round title="NFC Wild Card" items={derived.nfcWC} locked={locked||!active||busy} pick={pick}/>
    </div>
    <p className="mt-5 text-center text-xs text-slate-400">NFL reseeding is applied automatically. The #1 seeds enter in the Divisional round.</p>
   </div>}
   {active&&<div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-300/25 bg-[#08172d] p-4 sm:px-8">
    <label className="flex items-center gap-2 text-sm text-white">Super Bowl total points tiebreaker <input aria-label="Super Bowl total points tiebreaker" type="number" min="0" max="200" className="w-20 rounded-md border border-white/20 bg-[#0b1c35] px-2 py-2 text-white" value={tiebreaker} disabled={locked} onChange={e=>setTiebreaker(e.target.value)}/></label>
    <div className="flex flex-wrap gap-3"><button type="button" disabled={locked||busy} onClick={()=>void persist(false)} className="inline-flex items-center gap-2 rounded-lg border border-amber-300/50 px-4 py-2 text-sm font-bold text-amber-200 disabled:opacity-40"><Save className="h-4 w-4"/>Save picks</button><GoldButton disabled={locked||busy||count!==13} onClick={()=>void persist(true)}><Trophy className="h-4 w-4"/>{active.submitted||submittedIds.includes(active.id)?'Resubmit bracket':'Submit bracket'}</GoldButton></div>
   </div>}
  </div>
 </section>;
}
