import { useState, useEffect, useCallback } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from './SupabaseClient';

/**
 * Role hierarchy — higher number = more permissions.
 * Used to compare minRole against the user's actual role.
 */
export const ROLE_HIERARCHY = {
  user:          0,
  support_agent: 1,
  moderator:     2,
  admin:         3,
  super_admin:   4,
};

export const ROLE_LABELS = {
  support_agent: 'Support Agent',
  moderator:     'Moderator',
  admin:         'Admin',
  super_admin:   'Super Admin',
};

/**
 * Returns true if `actual` role meets or exceeds `required` role.
 */
export const hasPermission = (actualRole, requiredRole) => {
  return (ROLE_HIERARCHY[actualRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 99);
};

/**
 * AdminRoute — wraps SecureRoute with role verification.
 *
 * Usage:
 *   <AdminRoute minRole="moderator">
 *     <SomePage />
 *   </AdminRoute>
 */
const AdminRoute = ({ children, minRole = 'support_agent' }) => {
  const [state, setState] = useState({ checking: true, allowed: false, role: null });
  const location = useLocation();

  useEffect(() => {
    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setState({ checking: false, allowed: false, role: null });
          return;
        }

        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('userid', session.user.id)
          .single();

        const role = userData?.role ?? 'user';
        const allowed = hasPermission(role, minRole);
        setState({ checking: false, allowed, role });
      } catch {
        setState({ checking: false, allowed: false, role: null });
      }
    };

    check();
  }, [minRole]);

  if (state.checking) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0d14',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '16px', color: '#9CA3AF',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{
          width: '32px', height: '32px', border: '2px solid #6b82ff',
          borderTopColor: 'transparent', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: '14px' }}>Verifying permissions...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!state.allowed) {
    // Not logged in → send to signup
    if (!state.role) {
      return <Navigate to="/signup" state={{ from: location }} replace />;
    }
    // Logged in but insufficient role → show 403
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0d14',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{
          textAlign: 'center', padding: '48px 40px',
          background: '#121620', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px', maxWidth: '400px',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
          <h1 style={{ color: '#F9FAFB', fontSize: '22px', margin: '0 0 12px', fontWeight: 800 }}>
            Access Denied
          </h1>
          <p style={{ color: '#9CA3AF', fontSize: '14px', margin: '0 0 24px', lineHeight: 1.6 }}>
            You don't have permission to access this area.
            Required: <strong style={{ color: '#F9FAFB' }}>{ROLE_LABELS[minRole] ?? minRole}</strong>
          </p>
          <a href="/" style={{
            display: 'inline-block', background: '#6b82ff', color: '#fff',
            padding: '10px 24px', borderRadius: '8px', textDecoration: 'none',
            fontSize: '14px', fontWeight: 700,
          }}>
            Go Home
          </a>
        </div>
      </div>
    );
  }

  return children;
};

export default AdminRoute;
