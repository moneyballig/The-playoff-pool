import { useEffect, useMemo, useState } from 'react';
import {
  Trophy, ChevronRight, Users, FileText, Megaphone, Clock, Lock,
  Swords, Plus, Medal,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Announcement, Bracket, PlayoffGame, PlayoffTeam, LeaderboardRow } from '@/lib/types';
import { Card, GoldButton, GhostButton, SectionTitle, StatusPill, TeamLogo, SeedBadge, Spinner, EmptyState } from '@/components/ui';
import type { PageId } from '@/components/Nav';

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
  const deadlinePassed = pool?.deadline ? new Date(pool.deadline).getTime() < Date.now() : false;

  if (loading) return <Spinner label="Loading pool…" />;

  return (
    <div className="animate-fade-up">
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-white/10 bg-stadium-dark stadium-grid">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-navy-950 to-transparent" />
        <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 text-center sm:py-24">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold-400/30 bg-gold-400/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-gold-400">
            <Swords className="h-3.5 w-3.5" /> NFL Playoffs {pool?.season ?? 2026}
          </p>
          <h1 className="font-display text-5xl font-extrabold uppercase leading-[1.05] tracking-wide text-white sm:text-7xl">
            The Playoff <span className="text-gold-400 text-glow-gold">Pool</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-txt-secondary sm:text-lg">
            Predict every snap of the postseason. Two brackets, thirteen picks, one champion.
            Beat your friends to the {pool?.name ?? 'grand prize'}.
          </p>

          {countdown && !countdown.over && (
            <div className="mt-8 flex items-stretch justify-center gap-2 sm:gap-3">
              {[
                { v: countdown.days, l: 'Days' },
                { v: countdown.hours, l: 'Hrs' },
                { v: countdown.mins, l: 'Min' },
                { v: countdown.secs, l: 'Sec' },
              ].map((u) => (
                <div key={u.l} className="w-20 rounded-xl border border-white/10 bg-navy-900/80 px-2 py-3 shadow-card sm:w-24">
                  <p className="font-display text-3xl font-extrabold text-gold-400 sm:text-4xl">{String(u.v).padStart(2, '0')}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-txt-muted">{u.l}</p>
                </div>
              ))}
            </div>
          )}
          {countdown?.over && (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-livered/30 bg-livered/10 px-4 py-1.5 text-sm font-semibold text-livered">
              <Lock className="h-4 w-4" /> The playoffs are underway
            </p>
          )}

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {!user && (
              <GoldButton onClick={onJoinClick} className="w-full sm:w-auto">
                <Trophy className="h-5 w-5" /> Enter the pool
              </GoldButton>
            )}
            {user && !pool && (
              <GoldButton onClick={onJoinClick} className="w-full sm:w-auto">
                <Trophy className="h-5 w-5" /> Join with invitation code
              </GoldButton>
            )}
            {user && pool && (
              <GoldButton onClick={() => setPage('entries')} className="w-full sm:w-auto">
                <FileText className="h-5 w-5" /> View my brackets
              </GoldButton>
            )}
          </div>

          {pool && (
            <div className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-txt-secondary">
              <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-gold-400" /> {members} participants</span>
              <span className="inline-flex items-center gap-1.5"><FileText className="h-4 w-4 text-gold-400" /> {submitted} entries submitted</span>
              {pool.deadline && (
                <span className={`inline-flex items-center gap-1.5 ${deadlinePassed ? 'text-livered' : 'text-gold-400'}`}>
                  <Clock className="h-4 w-4" /> Deadline {new Date(pool.deadline).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10">
        {!user && (
          <section className="mb-10">
            <EmptyState
              title="Welcome to the pool"
              body="Sign in or create an account, then enter your private invitation code to start filling out playoff brackets. The first account created becomes the pool administrator."
              action={<GoldButton onClick={onJoinClick}>Sign in / Join</GoldButton>}
            />
          </section>
        )}

        {user && pool && (
          <section className="mb-12">
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
              <div className="grid gap-4 sm:grid-cols-2">
                {brackets.map((b) => (
                  <EntryMiniCard key={b.id} bracket={b} setPage={setPage} />
                ))}
              </div>
            )}
          </section>
        )}

        {leaders.length > 0 && (
          <section className="mb-12">
            <SectionTitle right={<GhostButton onClick={() => setPage('leaderboard')}>Full leaderboard <ChevronRight className="h-4 w-4" /></GhostButton>}>
              Leaderboard leaders
            </SectionTitle>
            <div className="grid gap-4 sm:grid-cols-3">
              {leaders.slice(0, 3).map((row, i) => {
                const medal = ['text-gold-400', 'text-txt-secondary', 'text-orange-brand'][i];
                return (
                  <Card key={row.bracket_id} className="flex items-center gap-4 p-4">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-navy-900 font-display text-xl font-extrabold ${medal}`}>
                      <Medal className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{row.display_name ?? 'Participant'}</p>
                      <p className="truncate text-xs text-txt-muted">{row.entry_name}</p>
                      <p className="font-display text-2xl font-extrabold text-gold-400">{row.total_points} <span className="text-xs text-txt-muted">pts</span></p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="mb-12">
            <SectionTitle right={<GhostButton onClick={() => setPage('schedule')}>Full schedule <ChevronRight className="h-4 w-4" /></GhostButton>}>
              Upcoming playoff games
            </SectionTitle>
            <div className="grid gap-4 md:grid-cols-3">
              {upcoming.map((g) => {
                const home = g.home_team_id ? teamById.get(g.home_team_id) : null;
                const away = g.away_team_id ? teamById.get(g.away_team_id) : null;
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
          <section>
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
          <section className="mb-10">
            <EmptyState
              title={`You're signed in, ${profile?.display_name ?? ''}`}
              body="You haven't joined a pool yet. Enter the private invitation code you received to join the competition."
              action={<GoldButton onClick={onJoinClick}>Enter invitation code</GoldButton>}
            />
          </section>
        )}
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
