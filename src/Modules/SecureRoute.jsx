import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from '../utils/authSecurity';

/**
 * Route guard with authentication check
 */
const SecureRoute = ({ children, fallback = '/login' }) => {
  const [authState, setAuthState] = useState({
    checking: true,
    isAuth: false,
  });
  const location = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      const isAuth = await isAuthenticated();
      setAuthState({
        checking: false,
        isAuth,
      });
    };

    checkAuth();
  }, []);

  if (authState.checking) {
    return (
      <div className="auth-loading" role="status" aria-live="polite">
        <span className="spinner"></span>
        <span>Verifying session...</span>
      </div>
    );
  }

  if (!authState.isAuth) {
    // Redirect to login, save intended destination
    return <Navigate to={fallback} state={{ from: location }} replace />;
  }

  return children;
};

export default SecureRoute;