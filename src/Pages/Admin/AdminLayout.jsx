import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../../Modules/SupabaseClient';
import { ROLE_LABELS, ROLE_HIERARCHY } from '../../Modules/AdminRoute';
import styles from './AdminLayout.module.css';
import {
  FaTachometerAlt, FaList, FaUsers, FaFlag, FaHistory,
  FaBan, FaBullhorn, FaSignOutAlt, FaGavel, FaShieldAlt
} from 'react-icons/fa';

const AdminLayout = () => {
  const [admin, setAdmin] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('users')
        .select('firstname, lastname, role')
        .eq('userid', session.user.id)
        .single();
      setAdmin({ ...data, email: session.user.email });
    };
    load();
  }, []);

  const role = admin?.role ?? 'user';
  const roleLevel = ROLE_HIERARCHY[role] ?? 0;

  const navItems = [
    { to: '/admin', label: 'Overview', icon: <FaTachometerAlt />, end: true, minLevel: 1 },
    { to: '/admin/listings', label: 'Listings', icon: <FaList />, minLevel: 1 },
    { to: '/admin/users', label: 'Users', icon: <FaUsers />, minLevel: 1 },
    { to: '/admin/reports', label: 'Reports', icon: <FaFlag />, minLevel: 1 },
    { to: '/admin/log', label: 'Action Log', icon: <FaHistory />, minLevel: 3 },
    { to: '/admin/keywords', label: 'Keywords', icon: <FaBan />, minLevel: 2 },
    { to: '/admin/announcements', label: 'Announcements', icon: <FaBullhorn />, minLevel: 4 },
  ].filter(item => roleLevel >= item.minLevel);

  return (
    <div className={styles.shell}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <FaShieldAlt className={styles.brandIcon} />
          <span>Control Panel</span>
        </div>

        <nav className={styles.nav}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.adminInfo}>
          <div className={styles.adminAvatar}>
            {(admin?.firstname?.[0] ?? '?').toUpperCase()}
          </div>
          <div className={styles.adminMeta}>
            <span className={styles.adminName}>
              {admin ? `${admin.firstname} ${admin.lastname}` : 'Loading...'}
            </span>
            <span className={styles.adminRole}>
              {ROLE_LABELS[role] ?? role}
            </span>
          </div>
          <button
            className={styles.signOutBtn}
            onClick={async () => { await supabase.auth.signOut(); navigate('/'); }}
            title="Sign out"
          >
            <FaSignOutAlt />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={styles.main}>
        <Outlet context={{ admin, role, roleLevel }} />
      </main>
    </div>
  );
};

export default AdminLayout;
