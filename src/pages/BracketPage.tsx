import { useEffect, useMemo, useState } from 'react';
import { Trophy, Lock, Save, Check, RotateCcw, Info, ChevronLeft, ChevronRight, Crown } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Bracket, BracketPick, PlayoffGame, PlayoffTeam } from '@/lib/types';
import { buildBracket, allMatchups, validPicks, type Matchup, type DerivedBracket, type PickMap } from '@/lib/bracket';
import { Card, GoldButton, GhostButton, TeamLogo, SeedBadge, Spinner, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modals';

interface Props {
  bracketId: string | null;
  onOpenEntries: () => void;
}

function TeamRow({
  team,
  label,
  selected,
  disabled,
  onSelect,
  right,
}: {
  team: PlayoffTeam | null;
  label: string | null;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  right?: React.ReactNode;
}) {
  if (!team) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-white/10 bg-navy-950/40 px-3 py-2 text-xs text-txt-muted">
        <div className="h-8 w-8 rounded-full border border-dashed border-white/20" />
        <span>{label ?? 'To be determined'}</span>
      </div>
    );
  }
  return (
    <button
      disabled={disabled}
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition ${
        selected
          ? 'border-gold-400 bg-gold-400/10 shadow-glow-soft'
          : 'border-white/10 bg-navy-950/60 hover:border-white/25 hover:bg-navy-700/60'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <TeamLogo team={team} size={32} />
      <SeedBadge seed={team.seed} />
      <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${selected ? 'text-gold-400' : 'text-white'}`}>
        {team.name}
      </span>
      {label && !selected && <span className="shrink-0 text-[10px] uppercase tracking-wider text-txt-muted">{label}</span>}
      {selected && <Check className="h-4 w-4 shrink-0 text-gold-400" />}
      {right}
    </button>
  );
}

function MatchupCard({
  m,
  disabled,
  onPick,
}: {
  m: Matchup;
  disabled: boolean;
  onPick: (key: string, teamId: string) => void;
}) {
  const points = m.round === 'wild_card' ? 1 : m.round === 'divisional' ? 2 : m.round === 'conference' ? 4 : 8;
  return (
    <div
      className={`rounded-xl border p-3 transition ${
        m.realGame?.status === 'live' || m.realGame?.status === 'halftime'
          ? 'border-livered/40 bg-navy-800'
          : 'border-white/10 bg-card-sheen'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-txt-muted">
          {m.conference ? `${m.conference} · ` : ''}
          {m.round === 'wild_card' ? 'Wild Card' : m.round === 'divisional' ? 'Divisional' : m.round === 'conference' ? 'Championship' : 'Super Bowl'}
        </span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-gold-400">{points} pt{points > 1 ? 's' : ''}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <TeamRow
          team={m.home}
          label={m.homeLabel}
          selected={m.userPick?.id === m.home?.id}
          disabled={disabled}
          onSelect={() => m.home && onPick(m.key, m.home.id)}
        />
        <TeamRow
          team={m.away}
          label={m.awayLabel}
          selected={m.userPick?.id === m.away?.id}
          disabled={disabled}
          onSelect={() => m.away && onPick(m.key, m.away.id)}
        />
      </div>
    </div>
  );
}

function RoundColumn({ title, matchups, disabled, onPick }: { title: string; matchups: Matchup[]; disabled: boolean; onPick: (k: string, t: string) => void }) {
  return (
    <div className="flex min-w-[270px] flex-1 flex-col gap-3">
      <p className="text-center font-display text-sm font-bold uppercase tracking-[0.2em] text-gold-400">{title}</p>
      <div className="flex flex-1 flex-col justify-around gap-3">
        {matchups.map((m) => (
          <MatchupCard key={m.key} m={m} disabled={disabled} onPick={onPick} />
        ))}
        {matchups.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-txt-muted">Awaiting teams</div>
        )}
      </div>
    </div>
  );
}

export default function BracketPage({ bracketId, onOpenEntries }: Props) {
  const { pool, user } = useAuth();
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [teams, setTeams] = useState<PlayoffTeam[]>([]);
  const [games, setGames] = useState<PlayoffGame[]>([]);
  const [picks, setPicks] = useState<PickMap>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [tiebreaker, setTiebreaker] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileRound, setMobileRound] = useState(0);

  useEffect(() => {
    if (!pool) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const [t, g] = await Promise.all([
        supabase.from('playoff_teams').select('*').eq('season', pool.season),
        supabase.from('playoff_games').select('*').eq('season', pool.season).order('game_slot'),
      ]);
      setTeams(t.data ?? []);
      setGames(g.data ?? []);
      if (bracketId && user) {
        const { data: b } = await supabase.from('brackets').select('*').eq('id', bracketId).eq('user_id', user.id).maybeSingle();
        setBracket(b ?? null);
        if (b) {
          const { data: p } = await supabase.from('bracket_picks').select('pick_key, team_id').eq('bracket_id', b.id);
          const map: PickMap = {};
          for (const row of (p as (BracketPick & { pick_key: string })[]) ?? []) map[row.pick_key] = row.team_id;
          setPicks(map);
          setSavedAt(b.submitted_at);
        }
      } else {
        setBracket(null);
      }
      setLoading(false);
    })();
  }, [pool, bracketId, user]);

  const derived: DerivedBracket = useMemo(() => buildBracket(teams, games, picks), [teams, games, picks]);
  const matchups = useMemo(() => allMatchups(derived), [derived]);
  const pickCount = matchups.filter((m) => m.winner).length;
  const locked = !bracket || bracket.frozen;
  const deadlinePassed = pool?.deadline ? new Date(pool.deadline).getTime() < Date.now() : false;

  const handlePick = (key: string, teamId: string) => {
    if (locked) return;
    setPicks((prev) => ({ ...prev, [key]: teamId }));
  };

  const save = async () => {
    if (!bracket || locked) return;
    setSaving(true);
    setError(null);
    const payload = validPicks(buildBracket(teams, games, picks));
    const { data: err } = await supabase.rpc('pp_save_picks', { p_bracket: bracket.id, p_picks: payload });
    if (err) setError(err.message ?? 'Could not save picks');
    else setSavedAt(new Date().toLocaleTimeString());
    setSaving(false);
  };

  // autosave shortly after each change
  useEffect(() => {
    if (!bracket || locked || Object.keys(picks).length === 0) return;
    const t = setTimeout(() => {
      save();
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks]);

  const submit = async () => {
    if (!bracket) return;
    setError(null);
    const tb = parseInt(tiebreaker, 10);
    const { data: err } = await supabase.rpc('pp_submit_bracket', {
      p_bracket: bracket.id,
      p_tiebreaker: pool?.tiebreaker_enabled && !isNaN(tb) ? tb : null,
    });
    if (err) {
      setError(err.message ?? 'Could not submit');
      return;
    }
    setSubmitOpen(false);
    const { data: b } = await supabase.from('brackets').select('*').eq('id', bracket.id).maybeSingle();
    setBracket(b ?? null);
    setSavedAt(b?.submitted_at ?? null);
  };

  if (loading) return <Spinner label="Building bracket…" />;

  if (!pool) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState title="Join a pool first" body="The playoff bracket opens up once you join a pool with an invitation code." />
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          title="Playoff teams not set"
          body="The administrator has not entered this season's playoff teams yet. Check back once the postseason field is locked."
        />
      </div>
    );
  }

  if (!bracket) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          title="Choose a bracket"
          body="Pick which of your brackets you want to work on from the My Entries page."
          action={<GoldButton onClick={onOpenEntries}>Go to my entries</GoldButton>}
        />
      </div>
    );
  }

  const mobileRounds = [
    { label: 'Wild Card', cols: [derived.afcWC, derived.nfcWC] },
    { label: 'Divisional', cols: [derived.afcDiv, derived.nfcDiv] },
    { label: 'Championships', cols: [derived.afcConf ? [derived.afcConf] : [], derived.nfcConf ? [derived.nfcConf] : []] },
    { label: 'Super Bowl', cols: [derived.superBowl ? [derived.superBowl] : []] },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 animate-fade-up">
      {/* Header bar */}
      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-white/10 bg-card-sheen p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold uppercase tracking-wide text-white">{bracket.name}</h1>
          <p className="text-xs text-txt-muted">
            {bracket.submitted
              ? `Submitted ${bracket.submitted_at ? new Date(bracket.submitted_at).toLocaleString() : ''}`
              : locked
                ? 'Locked'
                : `${pickCount} of 13 picks · autosaves as you pick`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !locked && (
            <span className="hidden items-center gap-1.5 text-xs text-correct sm:inline-flex">
              <Save className="h-3.5 w-3.5" /> Saved {saving ? '…' : savedAt}
            </span>
          )}
          {locked ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-4 py-2 font-display text-sm font-bold uppercase tracking-wider text-txt-muted">
              <Lock className="h-4 w-4" /> {bracket.submitted ? 'Submitted & locked' : 'Locked'}
            </span>
          ) : (
            <>
              <GhostButton onClick={save} disabled={saving}>
                <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
              </GhostButton>
              <GoldButton onClick={() => setSubmitOpen(true)} disabled={pickCount < 13 || deadlinePassed}>
                <Trophy className="h-4 w-4" /> Submit bracket
              </GoldButton>
            </>
          )}
        </div>
      </div>

      {deadlinePassed && !locked && (
        <div className="mb-4 rounded-lg border border-livered/30 bg-livered/10 px-4 py-2.5 text-sm text-livered">
          The submission deadline has passed. Your bracket cannot be submitted.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-livered/30 bg-livered/10 px-4 py-2.5 text-sm text-livered">{error}</div>
      )}

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-white/10 bg-navy-900/70 px-4 py-2.5 text-xs text-txt-secondary">
        <Info className="h-4 w-4 shrink-0 text-gold-400" />
        <span>
          Pick winners round by round — your selections advance automatically. Divisional matchups follow NFL reseeding: the
          #1 seed hosts the lowest remaining seed. Wild Card 1 pt · Divisional 2 pts · Championships 4 pts · Super Bowl 8 pts.
        </span>
      </div>

      {/* Desktop bracket */}
      <div className="hidden gap-4 lg:flex">
        <div className="flex flex-col gap-4">
          <RoundColumn title="AFC Wild Card" matchups={derived.afcWC} disabled={locked} onPick={handlePick} />
        </div>
        <div className="flex flex-col justify-center gap-6">
          <RoundColumn title="AFC Divisional" matchups={derived.afcDiv} disabled={locked} onPick={handlePick} />
          <RoundColumn title="NFC Divisional" matchups={derived.nfcDiv} disabled={locked} onPick={handlePick} />
        </div>
        <div className="flex flex-col justify-center gap-6">
          {derived.afcConf && <RoundColumn title="AFC Championship" matchups={[derived.afcConf]} disabled={locked} onPick={handlePick} />}
          {derived.nfcConf && <RoundColumn title="NFC Championship" matchups={[derived.nfcConf]} disabled={locked} onPick={handlePick} />}
        </div>
        <div className="flex flex-1 flex-col justify-center">
          {derived.superBowl && (
            <div className="rounded-2xl border border-gold-400/40 bg-gradient-to-b from-gold-400/10 to-navy-800 p-5 shadow-glow-soft">
              <div className="mb-4 flex items-center justify-center gap-2">
                <Trophy className="h-5 w-5 text-gold-400" />
                <p className="font-display text-xl font-extrabold uppercase tracking-[0.2em] text-gold-400">Super Bowl</p>
              </div>
              <div className="flex flex-col gap-2">
                <TeamRow team={derived.superBowl.home} label="AFC" selected={derived.superBowl.userPick?.id === derived.superBowl.home?.id} disabled={locked} onSelect={() => derived.superBowl!.home && handlePick('sb', derived.superBowl!.home.id)} />
                <TeamRow team={derived.superBowl.away} label="NFC" selected={derived.superBowl.userPick?.id === derived.superBowl.away?.id} disabled={locked} onSelect={() => derived.superBowl!.away && handlePick('sb', derived.superBowl!.away.id)} />
              </div>
              {derived.champion && (
                <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-gold-400/40 bg-gold-400/10 px-4 py-3">
                  <Crown className="h-5 w-5 text-gold-400" />
                  <TeamLogo team={derived.champion} size={28} />
                  <p className="font-display text-lg font-extrabold uppercase tracking-wide text-gold-400">
                    {derived.champion.name} — your champion
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile / tablet round-by-round */}
      <div className="lg:hidden">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-txt-secondary disabled:opacity-30"
            disabled={mobileRound === 0}
            onClick={() => setMobileRound((r) => Math.max(0, r - 1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex gap-1.5">
            {mobileRounds.map((r, i) => (
              <button
                key={r.label}
                onClick={() => setMobileRound(i)}
                className={`h-2 rounded-full transition-all ${i === mobileRound ? 'w-8 bg-gold-400' : 'w-2 bg-white/20'}`}
                aria-label={r.label}
              />
            ))}
          </div>
          <button
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-txt-secondary disabled:opacity-30"
            disabled={mobileRound === mobileRounds.length - 1}
            onClick={() => setMobileRound((r) => Math.min(mobileRounds.length - 1, r + 1))}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-center font-display text-lg font-bold uppercase tracking-[0.2em] text-gold-400">
          {mobileRounds[mobileRound].label}
        </p>
        <div className="flex flex-col gap-3">
          {mobileRounds[mobileRound].cols.flat().map((m) => (
            <MatchupCard key={m.key} m={m} disabled={locked} onPick={handlePick} />
          ))}
          {mobileRounds[mobileRound].cols.flat().length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-txt-muted">
              Matchups appear once earlier rounds are decided.
            </div>
          )}
        </div>
        {mobileRound === 3 && derived.champion && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-gold-400/40 bg-gold-400/10 px-4 py-3">
            <Crown className="h-5 w-5 text-gold-400" />
            <p className="font-display text-lg font-extrabold uppercase text-gold-400">{derived.champion.name}</p>
          </div>
        )}
      </div>

      {/* Submit confirmation */}
      {submitOpen && (
        <Modal title="Submit your bracket" onClose={() => setSubmitOpen(false)}>
          <p className="text-sm text-txt-secondary">
            You are submitting <span className="font-semibold text-white">{bracket.name}</span> with{' '}
            <span className="font-semibold text-gold-400">{pickCount} of 13 picks</span>.
          </p>
          <p className="mt-2 flex items-start gap-2 rounded-lg border border-gold-400/30 bg-gold-400/10 px-3 py-2.5 text-xs text-gold-300">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            Once submitted, this bracket becomes locked and cannot be changed{pool?.deadline ? ` (deadline: ${new Date(pool.deadline).toLocaleString()})` : ''}.
          </p>
          {pool?.tiebreaker_enabled && (
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-semibold text-white">
                Super Bowl tiebreaker <span className="text-txt-muted">— total combined points, both teams</span>
              </label>
              <input
                type="number"
                min={0}
                max={120}
                value={tiebreaker}
                onChange={(e) => setTiebreaker(e.target.value)}
                placeholder="e.g. 47"
                className="w-full rounded-lg border border-white/10 bg-navy-950/70 px-3.5 py-2.5 text-sm text-white placeholder:text-txt-muted outline-none focus:border-gold-400/60"
              />
            </div>
          )}
          {error && <p className="mt-3 rounded-lg border border-livered/30 bg-livered/10 px-3 py-2 text-sm text-livered">{error}</p>}
          <div className="mt-5 flex justify-end gap-3">
            <GhostButton onClick={() => setSubmitOpen(false)}>Keep editing</GhostButton>
            <GoldButton onClick={submit}>Lock & submit</GoldButton>
          </div>
        </Modal>
      )}
    </div>
  );
}
