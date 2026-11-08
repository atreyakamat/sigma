import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthProvider';

/** Requires a signed-in user; forces the password change when flagged; optionally requires system admin. */
export function ProtectedRoute({ admin = false }: { admin?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return <div className="flex h-full items-center justify-center text-ink-400">Loading…</div>;
  if (!user)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  if (user.mustChangePassword && location.pathname !== '/change-password')
    return <Navigate to="/change-password" replace />;
  if (admin && user.systemRole !== 'ADMIN') return <Navigate to="/" replace />;
  return <Outlet />;
}
