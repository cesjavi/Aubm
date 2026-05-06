import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  role: 'user' | 'manager' | 'admin';
  full_name: string | null;
  avatar_url: string | null;
}

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
