import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import type { Session, User } from '@supabase/supabase-js';
import { AuthContext } from './authContextValue';
import type { UserProfile } from './authContextValue';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const ensureProfile = async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null);
      return;
    }

    const fallbackProfile: UserProfile = {
      id: currentUser.id,
      role: 'user',
      full_name: currentUser.user_metadata?.full_name ?? currentUser.user_metadata?.name ?? null,
      avatar_url: currentUser.user_metadata?.avatar_url ?? null,
    };

    const { data: existingProfile, error: selectError } = await supabase
      .from('profiles')
      .select('id,role,full_name,avatar_url')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (selectError && selectError.code !== 'PGRST116') {
      setProfile(fallbackProfile);
      return;
    }

    if (existingProfile) {
      setProfile(existingProfile);
      return;
    }

    const { data: insertedProfile, error: insertError } = await supabase
      .from('profiles')
      .upsert(fallbackProfile, { onConflict: 'id' })
      .select('id,role,full_name,avatar_url')
      .single();

    if (insertError) {
      setProfile(fallbackProfile);
      return;
    }

    setProfile(insertedProfile);
  };

  const refreshProfile = async () => {
    await ensureProfile(user);
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      ensureProfile(session?.user ?? null).finally(() => setLoading(false));
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      ensureProfile(session?.user ?? null).finally(() => setLoading(false));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
