/**
 * Secure Authentication & Session Management
 * Handles: token refresh, session persistence, XSS prevention, logout cleanup
 */

import { supabase } from '../Modules/SupabaseClient';

// Session configuration
const SESSION_CONFIG = {
  refreshBuffer: 5 * 60,      // Refresh 5 minutes before expiry
  inactivityTimeout: 30 * 60 * 1000, // 30 minutes
  maxRetries: 3,
  retryDelay: 1000,
};

let refreshTimer = null;
let inactivityTimer = null;
let isRefreshing = false;

/**
 * Initialize secure session management
 * Call this once in your App component
 */
export const initSecureAuth = () => {
  // Set up activity listeners
  const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
  
  const resetInactivityTimer = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(handleInactivityLogout, SESSION_CONFIG.inactivityTimeout);
  };

  activityEvents.forEach(event => {
    window.addEventListener(event, resetInactivityTimer, { passive: true });
  });

  // Initial timer
  resetInactivityTimer();

  // Handle visibility change (tab switching)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Tab hidden: pause refresh, but don't logout
      if (refreshTimer) clearTimeout(refreshTimer);
    } else {
      // Tab visible: check session immediately
      checkAndRefreshSession();
    }
  });

  // Listen for auth state changes
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth event:', event);
    
    switch (event) {
      case 'SIGNED_IN':
      case 'TOKEN_REFRESHED':
        scheduleTokenRefresh(session);
        resetInactivityTimer();
        break;
      case 'SIGNED_OUT':
        cleanup();
        break;
      case 'USER_UPDATED':
        // Handle password changes, etc.
        break;
    }
  });

  // Initial session check
  checkAndRefreshSession();
};

/**
 * Schedule proactive token refresh
 */
const scheduleTokenRefresh = (session) => {
  if (!session?.expires_at) return;

  const expiresAt = session.expires_at * 1000;
  const now = Date.now();
  const refreshAt = expiresAt - (SESSION_CONFIG.refreshBuffer * 1000);

  if (refreshTimer) clearTimeout(refreshTimer);

  if (refreshAt > now) {
    const delay = refreshAt - now;
    refreshTimer = setTimeout(() => {
      checkAndRefreshSession();
    }, delay);
  }
};

/**
 * Check and refresh session with retry logic
 */
const checkAndRefreshSession = async (retries = 0) => {
  if (isRefreshing) return;
  isRefreshing = true;

  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) throw error;

    if (!session) {
      // No session: user is logged out
      cleanup();
      return;
    }

    // Check if refresh needed
    const expiresAt = session.expires_at * 1000;
    const shouldRefresh = Date.now() >= expiresAt - (SESSION_CONFIG.refreshBuffer * 1000);

    if (shouldRefresh) {
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        // Refresh failed: might be revoked or expired
        if (retries < SESSION_CONFIG.maxRetries) {
          setTimeout(() => {
            isRefreshing = false;
            checkAndRefreshSession(retries + 1);
          }, SESSION_CONFIG.retryDelay * (retries + 1));
          return;
        }
        throw refreshError;
      }

      if (data.session) {
        scheduleTokenRefresh(data.session);
      }
    } else {
      scheduleTokenRefresh(session);
    }

  } catch (err) {
    console.error('Session refresh failed:', err);
    // Don't auto-logout on refresh failure unless it's a 401/403
    if (err.status === 401 || err.status === 403) {
      await secureLogout();
    }
  } finally {
    isRefreshing = false;
  }
};

/**
 * Handle inactivity logout
 */
const handleInactivityLogout = async () => {
  console.log('Session expired due to inactivity');
  await secureLogout();
  window.location.href = '/login?reason=inactivity';
};

/**
 * Secure logout with cleanup
 */
export const secureLogout = async () => {
  try {
    // Clear all timers
    cleanup();

    // Revoke session server-side
    await supabase.auth.signOut({ scope: 'global' }); // Sign out all devices

    // Clear any local storage items (except supabase manages this)
    localStorage.removeItem('supabase.auth.token'); // Legacy cleanup

    // Redirect to login
    window.location.href = '/login';

  } catch (err) {
    console.error('Logout error:', err);
    // Force cleanup even if API fails
    cleanup();
    window.location.href = '/login';
  }
};

/**
 * Cleanup all timers and state
 */
const cleanup = () => {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
  isRefreshing = false;
};

/**
 * Get current user with validation
 * @returns {Promise<Object|null>} - User object or null
 */
export const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) return null;

    // Validate user object structure (prevent injection)
    if (!user.id || typeof user.id !== 'string') return null;
    if (!user.email || typeof user.email !== 'string') return null;

    return user;
  } catch (err) {
    console.error('Get user error:', err);
    return null;
  }
};

/**
 * Secure wrapper for authenticated operations
 * @param {Function} operation - Async function to execute
 * @returns {Promise<any>} - Operation result or error
 */
export const withAuth = async (operation) => {
  const user = await getCurrentUser();
  
  if (!user) {
    throw new Error('Authentication required');
  }

  try {
    return await operation(user);
  } catch (err) {
    if (err.status === 401) {
      // Session expired during operation
      await secureLogout();
    }
    throw err;
  }
};

/**
 * XSS Prevention: Sanitize user metadata from auth
 * @param {Object} user - Supabase user object
 * @returns {Object} - Sanitized user data
 */
export const sanitizeUserData = (user) => {
  if (!user) return null;

  const allowedFields = ['id', 'email', 'created_at', 'last_sign_in_at'];
  const sanitized = {};

  allowedFields.forEach(field => {
    if (user[field] && typeof user[field] === 'string') {
      // Basic XSS prevention
      sanitized[field] = user[field]
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    } else {
      sanitized[field] = user[field];
    }
  });

  // Handle user_metadata safely
  if (user.user_metadata) {
    sanitized.user_metadata = {
      firstname: sanitizeString(user.user_metadata.firstname),
      lastname: sanitizeString(user.user_metadata.lastname),
      avatar_url: sanitizeUrl(user.user_metadata.avatar_url),
    };
  }

  return sanitized;
};

const sanitizeString = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/[<>\"']/g, '')
    .substring(0, 100); // Max length
};

const sanitizeUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  // Only allow https URLs
  if (!url.startsWith('https://')) return '';
  return url.substring(0, 500);
};

/**
 * Check if session is valid (for route guards)
 * @returns {Promise<boolean>}
 */
export const isAuthenticated = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session && session.expires_at > Date.now() / 1000;
};