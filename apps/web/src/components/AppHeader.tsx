import {
  ChevronDown,
  Globe,
  KeyRound,
  ListChecks,
  LogOut,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { LOCALES, useI18n, useT } from '../lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../features/authentication/AuthProvider';

export function AppHeader({
  crumbs = [],
  actions,
}: {
  crumbs?: { label: string; to?: string }[];
  actions?: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const t = useT();
  const { locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <header className="flex h-14 items-center justify-between border-b border-ink-700 px-6">
      <nav className="flex items-center gap-2 text-[13px]">
        <Link to="/" className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span className="font-semibold tracking-tight">SIGMA</span>
        </Link>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2">
            <span className="text-ink-500">/</span>
            {c.to ? (
              <Link to={c.to} className="text-ink-200 hover:text-ink-100">
                {c.label}
              </Link>
            ) : (
              <span className="text-ink-100">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        {actions}
        {user?.systemRole === 'ADMIN' && (
          <Link
            to="/admin/users"
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] text-ink-300 hover:bg-ink-700 hover:text-ink-100"
          >
            <Shield size={14} /> {t('nav.users')}
          </Link>
        )}
        <div className="relative" ref={ref}>
          <button
            className="flex h-8 items-center gap-2 rounded-md px-2 text-[12px] hover:bg-ink-700"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-500/30 text-[11px] font-semibold text-accent-400">
              {user?.name.slice(0, 1).toUpperCase()}
            </span>
            <span>{user?.name}</span>
            <ChevronDown size={12} />
          </button>
          {open && (
            <div className="absolute right-0 top-10 z-20 w-56 rounded-md border border-ink-600 bg-ink-800 p-1 shadow-xl">
              <div className="px-2 py-1.5 text-[11px] text-ink-400">
                {user?.email}
                <span className="ml-1 rounded bg-ink-700 px-1 py-0.5 text-[10px] uppercase">
                  {user?.systemRole}
                </span>
              </div>
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-ink-700"
                onClick={() => void navigate('/settings/security')}
              >
                <ShieldCheck size={13} /> {t('nav.security')}
              </button>
              {user?.systemRole === 'ADMIN' && (
                <>
                  <button
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-ink-700"
                    onClick={() => void navigate('/admin/audit')}
                  >
                    <ListChecks size={13} /> {t('nav.audit')}
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-ink-700"
                    onClick={() => void navigate('/admin/ai')}
                  >
                    <Sparkles size={13} /> {t('nav.ai')}
                  </button>
                </>
              )}
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-ink-700"
                onClick={() => void navigate('/settings/tokens')}
              >
                <Terminal size={13} /> {t('nav.tokens')}
              </button>
              <label className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-ink-700">
                <Globe size={13} /> {t('nav.language')}
                <select
                  className="ml-auto bg-ink-800 text-[12px]"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as typeof locale)}
                  aria-label={t('nav.language')}
                >
                  {LOCALES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-ink-700"
                onClick={() => void navigate('/change-password')}
              >
                <KeyRound size={13} /> {t('nav.changePassword')}
              </button>
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-ink-700"
                onClick={() => void logout().then(() => navigate('/login'))}
              >
                <LogOut size={13} /> {t('nav.signOut')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
