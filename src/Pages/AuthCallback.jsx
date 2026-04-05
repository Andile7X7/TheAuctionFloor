import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../Modules/SupabaseClient';

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Supabase automatically handles the token exchange from the URL hash
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (session?.user) {
          const user = session.user;

          // Extract name from Google metadata
          const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
          const nameParts = fullName.split(' ');
          const firstname = user.user_metadata?.given_name || nameParts[0] || '';
          const lastname = user.user_metadata?.family_name || nameParts.slice(1).join(' ') || '';
          const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || '';

          // Upsert the user into your users table
          // This creates a new row or updates if already exists
          const { error: upsertError } = await supabase
            .from('users')
            .upsert(
              {
                userid: user.id,
                firstname: firstname,
                lastname: lastname,
                avatar_url: avatarUrl,
              },
              { onConflict: 'userid', ignoreDuplicates: false }
            );

          if (upsertError) {
            console.error('Failed to sync user profile:', upsertError.message);
            // Don't block navigation — still take them to the dashboard
          }

          navigate('/dashboard', { replace: true });
        } else {
          // No session, redirect to login
          navigate('/signup', { replace: true });
        }
      } catch (err) {
        console.error('Auth callback error:', err.message);
        navigate('/signup', { replace: true });
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0b0e14',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '16px',
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid rgba(255,255,255,0.1)',
        borderTop: '3px solid #6366F1',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: '#9CA3AF', fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
        Signing you in...
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default AuthCallback;
