import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { FaBars, FaTimes, FaUser, FaSignOutAlt, FaSearch, FaThLarge, FaCar, FaGavel, FaRegHeart } from 'react-icons/fa';
import { supabase } from './SupabaseClient';
import NotificationBell from './NotificationBell';
import UserAvatar from './UserAvatar';
import styles from './UniversalHeader.module.css';

const UniversalHeader = ({ searchTerm, onSearch }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [user, setUser] = useState(null);
    const [profileData, setProfileData] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();

    const isDashboard = location.pathname.startsWith('/dashboard') || location.pathname === '/my-listings';

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

                    if (!error && data) {
                        setProfileData(data);
                    } else {
                        setProfileData({
                            firstname: currentUser.user_metadata?.firstname,
                            avatar_url: currentUser.user_metadata?.avatar_url,
                            avatar_bg: currentUser.user_metadata?.avatar_bg
                        });
                    }
                } catch (err) {
                    console.error('Error fetching profile in UniversalHeader:', err);
                }
            }
        };

        loadData();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const currentUser = session?.user ?? null;
            setUser(currentUser);
            if (!currentUser) setProfileData(null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/');
        setProfileMenuOpen(false);
    };

    const navItems = [
        { name: 'HOME', path: '/' },
        { name: 'AUCTIONS', path: '/auction-floor' },
        { name: 'PERSONALIZED FEED', path: '/personalized-feed' },
        { name: 'TRENDING', path: '/trending' },
        { name: 'DASHBOARD', path: '/dashboard' }
    ];

    const isActive = (path) => location.pathname === path;

    return (
        <>
            <header className={styles.header}>
                {/* LEFT: Brand (desktop) + Nav + Mobile Search */}
                <div className={styles.headerLeft}>
                    {/* Brand - Desktop only, all pages */}
                    <div
                        className={`${styles.brand} ${isDashboard ? styles.hideBrandOnMobile : ''}`}
                        onClick={() => navigate('/')}
                    >
                        PRECISION
                    </div>

                    {/* Desktop Navigation */}
                    <nav className={styles.desktopNav}>
                        {navItems.map((item) => (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={isActive(item.path) ? styles.activeNav : ''}
                            >
                                {item.name}
                            </Link>
                        ))}
                    </nav>

                    {/* Mobile Search - Dashboard only, replaces brand space */}
                    {isDashboard && onSearch && (
                        <div className={styles.mobileSearch}>
                            <FaSearch className={styles.mobileSearchIcon} />
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchTerm || ''}
                                onChange={(e) => onSearch(e.target.value)}
                                className={styles.mobileSearchInput}
                            />
                            {searchTerm && (
                                <button
                                    className={styles.mobileClearBtn}
                                    onClick={() => onSearch('')}
                                    aria-label="Clear search"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT: Search (desktop), Notification, Profile, Burger */}
                <div className={styles.headerRight}>
                    {/* Desktop Search - Dashboard only */}
                    {isDashboard && onSearch && (
                        <div className={styles.desktopSearch}>
                            <FaSearch className={styles.searchIcon} />
                            <input
                                type="text"
                                placeholder="Search inventory..."
                                value={searchTerm || ''}
                                onChange={(e) => onSearch(e.target.value)}
                            />
                            {searchTerm && (
                                <button
                                    className={styles.clearSearchBtn}
                                    onClick={() => onSearch('')}
                                    aria-label="Clear search"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    )}

                    <div className={styles.authContainer}>
                        {user ? (
                            <>
                                <div className={styles.notificationWrap}>
                                    <NotificationBell />
                                </div>
                                <div className={styles.profileTrigger} onClick={() => setProfileMenuOpen(!profileMenuOpen)}>
                                    <UserAvatar
                                        name={profileData?.firstname || user.user_metadata?.firstname || user.email}
                                        src={profileData?.avatar_url || user.user_metadata?.avatar_url}
                                        bgColor={profileData?.avatar_bg || user.user_metadata?.avatar_bg}
                                        size={36}
                                    />
                                    {profileMenuOpen && (
                                        <div className={styles.profileDropdown} onClick={(e) => e.stopPropagation()}>
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
                            </>
                        ) : (
                            <button className={styles.loginBtn} onClick={() => navigate('/signup')}>
                                LOG IN / SIGN UP
                            </button>
                        )}
                    </div>

                    <button className={styles.burger} onClick={() => setMenuOpen(true)}>
                        <FaBars />
                    </button>
                </div>
            </header>

            {/* Mobile Burger Menu Overlay */}
            <div className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ''}`}>
                <div className={styles.mobileMenuHeader}>
                    <div className={styles.mobileBrand} onClick={() => { navigate('/'); setMenuOpen(false); }}>
                        PRECISION
                    </div>
                    <button className={styles.burgerClose} onClick={() => setMenuOpen(false)}>
                        <FaTimes />
                    </button>
                </div>

                <nav className={styles.mobileNav}>
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`${styles.mobileNavItem} ${isActive(item.path) ? styles.mobileNavItemActive : ''}`}
                            onClick={() => setMenuOpen(false)}
                        >
                            {item.name}
                        </Link>
                    ))}
                </nav>

                <div className={styles.mobileFooter}>
                    {user ? (
                        <div className={styles.mobileUserSection}>
                            <div className={styles.mobileSectionTitle}>MY DASHBOARD</div>
                            <div className={styles.mobileNavGrid}>
                                <div className={styles.mobileSubItem} onClick={() => { navigate('/dashboard'); setMenuOpen(false); }}>
                                    <FaThLarge /> Overview
                                </div>
                                <div className={styles.mobileSubItem} onClick={() => { navigate('/my-listings'); setMenuOpen(false); }}>
                                    <FaCar /> My Listings
                                </div>
                                <div className={styles.mobileSubItem} onClick={() => { navigate('/dashboard/activity?tab=bids'); setMenuOpen(false); }}>
                                    <FaGavel /> Active Bids
                                </div>
                                <div className={styles.mobileSubItem} onClick={() => { navigate('/dashboard/activity?tab=likes'); setMenuOpen(false); }}>
                                    <FaRegHeart /> Likes
                                </div>
                                <div className={styles.mobileSubItem} onClick={() => { navigate('/profile'); setMenuOpen(false); }}>
                                    <FaUser /> Profile Studio
                                </div>
                            </div>

                            <button className={styles.mobileSellBtn} onClick={() => { navigate('/new-listing'); setMenuOpen(false); }}>
                                PUBLISH VEHICLE
                            </button>

                            <div className={styles.mobileLogout} onClick={handleLogout}>
                                <FaSignOutAlt /> LOG OUT
                            </div>
                        </div>
                    ) : (
                        <button className={styles.mobileLoginBtn} onClick={() => { navigate('/signup'); setMenuOpen(false); }}>
                            GET STARTED
                        </button>
                    )}
                </div>
            </div>
        </>
    );
};

export default UniversalHeader;