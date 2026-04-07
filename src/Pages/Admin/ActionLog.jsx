import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../Modules/SupabaseClient';
import styles from './AdminLayout.module.css';

const PAGE_SIZE = 30;

const ActionLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('admin_action_log')
      .select('*', { count: 'exact' });

    if (search.trim()) {
      q = q.or(`action.ilike.%${search}%,reason.ilike.%${search}%`);
    }

    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (!error) { setLogs(data ?? []); setTotal(count ?? 0); }
    setLoading(false);
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  const actionColors = {
    listing_verified: styles.badgeGreen,
    listing_removed: styles.badgeRed,
    listing_featured: styles.badgeBlue,
    auction_extended: styles.badgeYellow,
    user_banned: styles.badgeRed,
    user_shadow_banned: styles.badgeRed,
    seller_verified: styles.badgeGreen,
    report_resolved: styles.badgeGreen,
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Admin Action Log</h1>
        <p className={styles.pageSubtitle}>Full immutable audit trail of all admin actions</p>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>Log ({total})</span>
          <input
            className={styles.searchInput}
            placeholder="Search action, reason..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
          />
        </div>

        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Admin</th>
              <th>Target</th>
              <th>Reason</th>
              <th>Previous State</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.loadingRow}><td colSpan={6}>Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr className={styles.loadingRow}><td colSpan={6}>No logs found.</td></tr>
            ) : logs.map(l => (
              <tr key={l.id}>
                <td style={{ color: '#6B7280', whiteSpace: 'nowrap', fontSize: '12px' }}>
                  {new Date(l.created_at).toLocaleString()}
                </td>
                <td>
                  <span className={`${styles.badge} ${actionColors[l.action] ?? styles.badgeGray}`}>
                    {l.action}
                  </span>
                </td>
                <td style={{ color: '#9CA3AF', fontFamily: 'monospace', fontSize: '11px' }}>
                  {l.admin_id?.slice(0, 8)}...
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '11px', color: '#6B7280', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {JSON.stringify(l.target)}
                </td>
                <td style={{ color: '#9CA3AF', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.reason ?? <span style={{ color: '#4B5563' }}>—</span>}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '11px', color: '#6B7280' }}>
                  {l.previous_state ? JSON.stringify(l.previous_state).slice(0, 60) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.pagination}>
          <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
          <button className={styles.pageBtn} disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <button className={styles.pageBtn} disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      </div>
    </div>
  );
};

export default ActionLog;
