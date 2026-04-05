import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSearch, FaUserCircle, FaBars, FaTimes, FaSignOutAlt, FaUser } from 'react-icons/fa';
import { supabase } from './SupabaseClient';
import NotificationBell from './NotificationBell';
import UserAvatar from './UserAvatar';
import styles from '../Pages/AuctionFloor.module.css';

const AuctionHeader = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  useEffect(() => {
    const loadData = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        
        if (currentUser) {
            try {
              const { data, error } = await supabase
                .from('users')
                .select('firstname, avatar_url, avatar_bg')
                .eq('userid', currentUser.id)
                .maybeSingle();

              if (error) throw error;
              
              if (data) {
                setProfileData(data);
              } else {
                setProfileData({
                  firstname: currentUser.user_metadata?.firstname,
                  avatar_url: currentUser.user_metadata?.avatar_url,
                  avatar_bg: currentUser.user_metadata?.avatar_bg
                });
              }
            } catch (err) {
              // Basic fallback if columns don't exist
              const { data: basicData } = await supabase
                .from('users')
                .select('firstname')
                .eq('userid', currentUser.id)
                .maybeSingle();
              
              setProfileData({
                  firstname: basicData?.firstname || currentUser.user_metadata?.firstname,
                  avatar_url: currentUser.user_metadata?.avatar_url,
                  avatar_bg: currentUser.user_metadata?.avatar_bg
              });
            }
        }
    };
    loadData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) setProfileData(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <div className={styles.brand} onClick={() => navigate('/')}>AUCTIONFLOOR</div>
        <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ''}`}>
          <span className={styles.activeNav} onClick={() => { navigate('/'); setMenuOpen(false); }}>AUCTIONS</span>
          <span onClick={() => { navigate('/live-feed'); setMenuOpen(false); }}>LIVE FEED</span>
          <span onClick={() => { navigate('/trending'); setMenuOpen(false); }}>TRENDING</span>
          <span onClick={() => { navigate('/dashboard'); setMenuOpen(false); }}>INVENTORY</span>
          <span onClick={() => { navigate('/new-listing'); setMenuOpen(false); }}>SELL</span>
          <span onClick={() => setMenuOpen(false)}>NEWS</span>
          
          {/* Mobile Only Dashboard/Sign In */}
          <div className={styles.mobileOnlyActions}>
            {user ? (
              <div className={styles.loginTrigger} onClick={() => { navigate('/dashboard'); setMenuOpen(false); }}>
                <FaUserCircle /> Dashboard
              </div>
            ) : (
              <div className={styles.loginTrigger} onClick={() => { navigate('/signup'); setMenuOpen(false); }}>
                <FaUserCircle /> Sign In
              </div>
            )}
          </div>
        </nav>
      </div>

      <div className={styles.headerRight}>
        <div className={styles.headerSearch}>
          <FaSearch className={styles.searchIcon} />
          <input type="text" placeholder="Search luxury cars..." />
        </div>

        {user && (
          <div style={{ marginRight: '16px', display: 'flex', alignItems: 'center' }}>
            <NotificationBell />
          </div>
        )}

        <div className={styles.loginTrigger}>
          {user ? (
            <div className={styles.profileAvatarMini} onClick={() => setProfileMenuOpen(!profileMenuOpen)} style={{ background: 'none', padding: 0 }}>
              <UserAvatar 
                name={profileData?.firstname || user.user_metadata?.firstname || user.email}
                src={profileData?.avatar_url || user.user_metadata?.avatar_url}
                bgColor={profileData?.avatar_bg || user.user_metadata?.avatar_bg}
                size={34}
              />
              
              {profileMenuOpen && (
                <div className={styles.dropdownMenuHeader}>
                  <div className={styles.dropdownItem} onClick={() => { navigate('/profile'); setProfileMenuOpen(false); }}>
                    <FaUser /> Profile Studio
                  </div>
                  <div className={styles.dropdownDivider}></div>
                  <div className={`${styles.dropdownItem} ${styles.logoutItem}`} onClick={handleLogout}>
                    <FaSignOutAlt /> Log Out
                  </div>
                </div>
              )}
            </div>
          ) : (
             <div className={styles.loginBtnContainer} onClick={() => navigate('/signup')}>
               <span className={styles.loginText}>LOG IN</span>
               <FaUserCircle className={styles.loginIcon} />
             </div>
          )}
        </div>

        <button className={styles.hamburger} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <FaTimes /> : <FaBars />}
        </button>
      </div>
    </header>
  );
};

export default AuctionHeader;
