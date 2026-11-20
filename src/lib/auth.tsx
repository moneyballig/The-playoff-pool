import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './supabase';
import type { Profile, Pool } from './types';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  pool: Pool | null;
  isPoolAdmin: boolean;
  isPlatformAdmin: boolean;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  joinPool: (code: string) => Promise<{ error: string | null }>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [isPoolAdmin, setIsPoolAdmin] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadUserData = async (user: User | null) => {
    if (!user) {
      setProfile(null);
      setPool(null);
      setIsPoolAdmin(false);
      setIsPlatformAdmin(false);
      return;
    }
    // The first authenticated account claims platform admin after email verification.
    await supabase.rpc('pp_claim_admin');

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    setProfile(prof ?? null);

    const { data: memberships } = await supabase
      .from('pool_members')
      .select('pool_id, role, pools(*)')
      .eq('user_id', user.id)
      .limit(1);
    if (memberships && memberships.length > 0) {
      const m = memberships[0] as unknown as { pool_id: string; role: string; pools: Pool | Pool[] | null };
      setPool(Array.isArray(m.pools) ? m.pools[0] : m.pools);
      setIsPoolAdmin(m.role === 'admin');
    } else {
      setPool(null);
      setIsPoolAdmin(false);
    }
    const { data: platformAdmin } = await supabase.rpc('pp_is_platform_admin');
    setIsPlatformAdmin(Boolean(platformAdmin));
  };

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadUserData(data.session?.user ?? null).finally(() => setLoading(false));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      (async () => {
        await loadUserData(newSession?.user ?? null);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName: string) => {
    if (!supabaseConfigured) return { error: 'Pool sign-in is not connected yet. The site owner must connect the Supabase backend first.' };
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) return { error: error.message };
    await supabase.rpc('pp_claim_admin');
    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    if (!supabaseConfigured) return { error: 'Pool sign-in is not connected yet. The site owner must connect the Supabase backend first.' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setPool(null);
    setIsPoolAdmin(false);
    setIsPlatformAdmin(false);
  };

  const joinPool = async (code: string) => {
    if (!supabaseConfigured) return { error: 'Pool invitations are unavailable until the Supabase backend is connected.' };
    const { error } = await supabase.rpc('pp_join_pool', { p_code: code });
    if (error) return { error: error.message };
    await loadUserData(session?.user ?? null);
    return { error: null };
  };

  const refresh = async () => {
    await loadUserData(session?.user ?? null);
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile, pool, isPoolAdmin, isPlatformAdmin, loading, signUp, signIn, signOut, joinPool, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
