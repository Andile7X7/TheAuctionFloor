import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

// Lazy-loaded pages
const Home = lazy(() => import('./Pages/Home'));
const AuctionFloor = lazy(() => import('./Pages/AuctionFloor'));
const SignUpPage = lazy(() => import('./Pages/SignUpPage'));
const AuthCallback = lazy(() => import('./Pages/AuthCallback'));
const ListingDetail = lazy(() => import('./Pages/ListingDetail'));
const Trending = lazy(() => import('./Pages/Trending'));
const Notifications = lazy(() => import('./Pages/Notifications'));
const Dashboard = lazy(() => import('./Pages/Dashboard'));
const AddListing = lazy(() => import('./Pages/AddListing'));
const MyListings = lazy(() => import('./Pages/MyListings'));
const ActivityTracking = lazy(() => import('./Pages/ActivityTracking'));
const PersonalizedFeed = lazy(() => import('./Pages/PersonalizedFeed'));
const Profile = lazy(() => import('./Pages/Profile'));
const AdminLayout = lazy(() => import('./Pages/Admin/AdminLayout'));
const Overview = lazy(() => import('./Pages/Admin/Overview'));
const ListingManagement = lazy(() => import('./Pages/Admin/ListingManagement'));
const UserManagement = lazy(() => import('./Pages/Admin/UserManagement'));
const Reports = lazy(() => import('./Pages/Admin/Reports'));
const ActionLog = lazy(() => import('./Pages/Admin/ActionLog'));
const BannedKeywords = lazy(() => import('./Pages/Admin/BannedKeywords'));

// Guards (keep as static imports — they're small and always needed)
import SecureRoute from './Modules/SecureRoute';
import AdminRoute from './Modules/AdminRoute';

// Loading fallback
const PageLoader = () => (
  <div style={{
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0d14',
    color: '#9CA3AF',
    fontSize: '14px',
  }}>
    <div style={{
      width: '32px',
      height: '32px',
      border: '2px solid #6b82ff',
      borderTopColor: 'transparent',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
    <span style={{ marginLeft: '12px' }}>Loading...</span>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/auction-floor" element={<AuctionFloor />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/listing/:id" element={<ListingDetail />} />
        <Route path="/trending" element={<Trending />} />
        <Route path="/live-feed" element={<Navigate to="/personalized-feed" replace />} />

        {/* Auth-protected */}
        <Route path="/personalized-feed" element={<SecureRoute><PersonalizedFeed /></SecureRoute>} />
        <Route path="/dashboard" element={<SecureRoute><Dashboard /></SecureRoute>} />
        <Route path="/add-listing" element={<SecureRoute><AddListing /></SecureRoute>} />
        <Route path="/my-listings" element={<SecureRoute><MyListings /></SecureRoute>} />
        <Route path="/profile" element={<SecureRoute><Profile /></SecureRoute>} />
        <Route path="/dashboard/notifications" element={<SecureRoute><Notifications /></SecureRoute>} />
        <Route path="/dashboard/activity" element={<SecureRoute><ActivityTracking /></SecureRoute>} />

        {/* Admin */}
        <Route path="/admin" element={<AdminRoute minRole="support_agent"><AdminLayout /></AdminRoute>}>
          <Route index element={<Overview />} />
          <Route path="listings" element={<ListingManagement />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="reports" element={<Reports />} />
          <Route path="log" element={<AdminRoute minRole="admin"><ActionLog /></AdminRoute>} />
          <Route path="keywords" element={<AdminRoute minRole="moderator"><BannedKeywords /></AdminRoute>} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;