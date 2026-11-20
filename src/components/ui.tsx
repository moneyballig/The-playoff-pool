import type { PlayoffTeam } from '@/lib/types';

const SEED_COLORS: Record<number, string> = {
  1: '#F5BD45',
  2: '#E8ECF4',
  3: '#C9764A',
  4: '#5E6E8C',
  5: '#5E6E8C',
  6: '#5E6E8C',
  7: '#5E6E8C',
};

export function TeamLogo({ team, size = 36 }: { team: PlayoffTeam | null; size?: number }) {
  if (!team) {
    return (
      <div
        className="rounded-full border border-dashed border-white/25 flex items-center justify-center text-[10px] text-txt-muted shrink-0"
        style={{ width: size, height: size }}
      >
        ?
      </div>
    );
  }
  const initials = team.abbreviation.slice(0, 3);
  const logo = team.logo_url || `https://a.espncdn.com/i/teamlogos/nfl/500/${team.abbreviation.toLowerCase()}.png`;
  return (
    <div
      className="team-logo rounded-full flex items-center justify-center font-display font-bold shrink-0 border"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(145deg, ${team.color_primary} 0%, rgba(5,11,24,0.9) 130%)`,
        borderColor: 'rgba(255,255,255,0.18)',
        color: '#fff',
      }}
    >
      <img src={logo} alt={`${team.name} logo`} className="h-full w-full object-contain p-0.5" onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement?.setAttribute("data-fallback", initials); }} />
    </div>
  );
}

export function SeedBadge({ seed, size = 'sm' }: { seed: number; size?: 'sm' | 'lg' }) {
  const color = SEED_COLORS[seed] ?? '#5E6E8C';
  const dim = size === 'lg' ? 'w-7 h-7 text-sm' : 'w-5 h-5 text-[10px]';
  return (
    <span
      className={`inline-flex items-center justify-center rounded font-display font-bold ${dim}`}
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}55` }}
    >
      {seed}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    upcoming: { label: 'UPCOMING', cls: 'bg-upcoming/15 text-upcoming border-upcoming/30' },
    live: { label: 'LIVE', cls: 'bg-livered/15 text-livered border-livered/40 animate-pulse-live' },
    halftime: { label: 'HALFTIME', cls: 'bg-livered/15 text-livered border-livered/40' },
    final: { label: 'FINAL', cls: 'bg-white/10 text-txt-secondary border-white/15' },
  };
  const s = map[status] ?? map.upcoming;
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold tracking-widest border ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function GoldButton({
  children,
  onClick,
  className = '',
  disabled,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-gold-400 to-gold-600 px-5 py-2.5 font-display font-bold uppercase tracking-wider text-navy-950 shadow-glow-soft transition hover:brightness-110 hover:shadow-glow active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  className = '',
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 font-display font-semibold uppercase tracking-wider text-txt-primary transition hover:border-gold-400/50 hover:bg-white/10 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/10 bg-card-sheen shadow-card ${className}`}>{children}</div>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-white">{children}</h2>
      {right}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-txt-secondary">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-400 border-t-transparent" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/15 bg-navy-900/60 px-6 py-12 text-center">
      <p className="font-display text-xl font-bold uppercase tracking-wide text-white">{title}</p>
      <p className="max-w-md text-sm text-txt-secondary">{body}</p>
      {action}
    </div>
  );
}
