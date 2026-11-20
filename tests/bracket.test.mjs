import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBracket, allMatchups, validPicks } from '../src/lib/bracket.ts';

const teams = ['AFC','NFC'].flatMap(conference=>Array.from({length:7},(_,i)=>({
  id:conference+(i+1),season:2026,name:conference+' '+(i+1),abbreviation:conference+(i+1),conference,seed:i+1,logo_url:null,color_primary:'#000'
})));
const games = ['AFC','NFC'].flatMap(conference=>[[2,7],[3,6],[4,5]].map(([home,away],i)=>({
  id:conference+'wc'+i,season:2026,round:'wild_card',conference,game_slot:i+1,
  home_team_id:conference+home,away_team_id:conference+away,kickoff:null,status:'upcoming',
  home_score:null,away_score:null,quarter:null,clock:null,winner_team_id:null,source:'manual',updated_at:''
})));

test('13 total predictions and NFL divisional reseeding',()=>{
 const picks={};
 for(const conference of ['AFC','NFC']){
   picks[conference+'wc0']=conference+'7';
   picks[conference+'wc1']=conference+'3';
   picks[conference+'wc2']=conference+'4';
 }
 const initial=buildBracket(teams,games,picks);
 assert.equal(allMatchups(initial).length,13);
 assert.equal(initial.afcDiv[0].home?.seed,1);
 assert.equal(initial.afcDiv[0].away?.seed,7,'No. 1 must host the lowest remaining seed');
 assert.deepEqual([initial.afcDiv[1].home?.seed,initial.afcDiv[1].away?.seed],[3,4]);
 assert.equal(validPicks(initial).length,6);
});

test('final results must not silently overwrite submitted user predictions',()=>{
 const picks={AFCwc0:'AFC7',AFCwc1:'AFC3',AFCwc2:'AFC4'};
 const updated=games.map(g=>g.id==='AFCwc0'?{...g,status:'final',winner_team_id:'AFC2'}:g);
 const bracket=buildBracket(teams,updated,picks);
 assert.equal(bracket.afcWC[0].winner?.id,'AFC2');
 assert.equal(bracket.afcWC[0].userPick?.id,'AFC7');
 assert.equal(validPicks(bracket).find(p=>p.pick_key==='AFCwc0')?.team_id,'AFC7');
});
