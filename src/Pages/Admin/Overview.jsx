import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../Modules/SupabaseClient';
import styles from './AdminLayout.module.css';
import { FaList, FaUsers, FaFlag, FaGavel, FaClock } from 'react-icons/fa';

const StatCard = ({ label, value, delta, icon, color = '#6b82ff' }) => (
  <div className={styles.statCard}>
    <div className={styles.statLabel}>{label}</div>
    <div className={styles.statValue} style={{ color }}>{value ?? '—'}</div>
    {delta && <div className={styles.statDelta}>{delta}</div>}
  </div>
);

const Overview = () => {
  const { role } = useOutletContext();
  const [stats, setStats] = useState(null);
  const [recentActions, setRecentActions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [
        { count: activeListings },
        { count: pendingListings },
        { count: openReports },
        { count: totalUsers },
        { count: bidsToday },
      ] = await Promise.all([
        supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('listings').select('*', { count: 'exact', head: true }).eq('verified', false),
        supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('bid_history').select('*', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 86400000).toISOString()),
      ]);

      setStats({ activeListings, pendingListings, openReports, totalUsers, bidsToday });

      const { data: actions } = await supabase
        .from('admin_action_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      setRecentActions(actions ?? []);

      setLoading(false);
    };
    load();
  }, []);

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Overview</h1>
        <p className={styles.pageSubtitle}>Platform health at a glance</p>
      </div>

      <div className={styles.statGrid}>
        <StatCard label="Active Listings" value={stats?.activeListings} icon={<FaList />} />
        <StatCard label="Pending Review" value={stats?.pendingListings} color="#F59E0B" />
        <StatCard label="Open Reports" value={stats?.openReports} color="#EF4444" />
        <StatCard label="Total Users" value={stats?.totalUsers} color="#10B981" />
        <StatCard label="Bids Today" value={stats?.bidsToday} color="#818cf8" />
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>Recent Admin Actions</span>
        </div>
        {loading ? (
          <div className={styles.emptyState}>Loading...</div>
        ) : recentActions.length === 0 ? (
          <div className={styles.emptyState}>No actions recorded yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Target</th>
                <th>Reason</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recentActions.map(a => (
                <tr key={a.id}>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeBlue}`}>{a.action}</span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '11px', color: '#6B7280' }}>
                    {JSON.stringify(a.target).slice(0, 60)}
                  </td>
                  <td style={{ color: '#9CA3AF', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.reason ?? '—'}
                  </td>
                  <td style={{ color: '#6B7280', whiteSpace: 'nowrap' }}>
                    {new Date(a.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Overview;
