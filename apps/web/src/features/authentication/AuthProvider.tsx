import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect } from 'react';
import type { MeResponse, UserDto } from '@sigma/validation';
import { ApiRequestError, http, onUnauthorized } from '../../lib/api';
import { useSessionState } from './SessionExpiredModal';

interface AuthValue {
  user: UserDto | null;
  loading: boolean;
  refresh(): Promise<unknown>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await http.get<MeResponse>('/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiRequestError && e.statusCode === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    onUnauthorized(() => {
      if (window.location.pathname.startsWith('/file/'))
        useSessionState.getState().setExpired(true);
      else qc.setQueryData(['me'], null);
    });
    return () => onUnauthorized(null);
  }, [qc]);

  const value: AuthValue = {
    user: me.data ?? null,
    loading: me.isLoading,
    refresh: () => me.refetch(),
    logout: async () => {
      await http.post('/auth/logout').catch(() => undefined);
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
