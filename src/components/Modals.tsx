import { useState, type ReactNode } from 'react';
import { X, Trophy } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { GoldButton } from './ui';

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    if (mode === 'signup') {
      if (!displayName.trim()) {
        setError('Please choose a display name.');
        setBusy(false);
        return;
      }
      const res = await signUp(email.trim(), password, displayName.trim());
      if (res.error) setError(res.error);
      else onClose();
    } else {
      const res = await signIn(email.trim(), password);
      if (res.error) setError(res.error);
      else onClose();
    }
    setBusy(false);
  };

  const input =
    'w-full rounded-lg border border-white/10 bg-navy-950/70 px-3.5 py-2.5 text-sm text-white placeholder:text-txt-muted outline-none transition focus:border-gold-400/60 focus:ring-1 focus:ring-gold-400/40';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-navy-800 p-6 shadow-card animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-b from-gold-400 to-gold-600">
              <Trophy className="h-5 w-5 text-navy-950" />
            </span>
            <div>
              <h2 className="font-display text-xl font-bold uppercase tracking-wide text-white">
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="text-xs text-txt-secondary">THE PLAYOFF POOL</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-txt-muted transition hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {mode === 'signup' && (
            <input
              className={input}
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="nickname"
            />
          )}
          <input
            className={input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className={input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
          />
          {error && <p className="rounded-lg border border-livered/30 bg-livered/10 px-3 py-2 text-sm text-livered">{error}</p>}
          <GoldButton type="submit" disabled={busy} className="mt-1 w-full">
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </GoldButton>
        </form>

        <p className="mt-4 text-center text-sm text-txt-secondary">
          {mode === 'signin' ? "New to the pool? " : 'Already have an account? '}
          <button
            className="font-semibold text-gold-400 transition hover:text-gold-300"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
            }}
          >
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}

export function JoinPoolModal({ onClose }: { onClose: () => void }) {
  const { joinPool, refresh } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    const res = await joinPool(code.trim());
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await refresh();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-navy-800 p-6 shadow-card animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-white">Join a private pool</h2>
            <p className="text-xs text-txt-secondary">Enter the invitation code from your pool organizer</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-txt-muted transition hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input
            className="w-full rounded-lg border border-white/10 bg-navy-950/70 px-3.5 py-3 text-center font-display text-xl font-bold uppercase tracking-[0.3em] text-gold-400 placeholder:text-txt-muted placeholder:tracking-normal placeholder:text-sm placeholder:font-body outline-none transition focus:border-gold-400/60 focus:ring-1 focus:ring-gold-400/40"
            placeholder="INVITATION CODE"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
          />
          {error && <p className="rounded-lg border border-livered/30 bg-livered/10 px-3 py-2 text-sm text-livered">{error}</p>}
          <GoldButton type="submit" disabled={busy} className="w-full">
            {busy ? 'Joining…' : 'Join pool'}
          </GoldButton>
        </form>
      </div>
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-navy-800 p-6 shadow-card animate-fade-up scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-txt-muted transition hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
