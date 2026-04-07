import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../Modules/SupabaseClient';
import { apiClient } from '../../utils/apiClient';
import styles from './AdminLayout.module.css';
import { hasPermission } from '../../Modules/AdminRoute';
import { FaBan, FaEye, FaCheck, FaUserShield } from 'react-icons/fa';

const PAGE_SIZE = 20;

const BanModal = ({ user, onConfirm, onClose, canPermBan }) => {
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('24');
  const [shadow, setShadow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    await onConfirm({ reason, duration: duration === 'perm' ? null : parseInt(duration), shadow });
    setBusy(false);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Ban / Suspend User</h2>
        <p style={{ fontSize: '13px', color: '#9CA3AF', marginBottom: '16px' }}>
          {user.firstname} {user.lastname} — {user.email}
        </p>

        <div className={styles.field}>
          <label className={styles.label}>Reason (required — logged permanently)</label>
          <textarea className={styles.textarea} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Shill bidding, spam, fraud..." />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Duration</label>
          <select className={styles.select} value={duration} onChange={e => setDuration(e.target.value)}>
            <option value="24">24 hours</option>
            <option value="72">3 days</option>
            <option value="168">7 days</option>
            {canPermBan && <option value="720">30 days</option>}
            {canPermBan && <option value="perm">Permanent</option>}
          </select>
        </div>

        <div className={styles.field} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input type="checkbox" id="shadow" checked={shadow} onChange={e => setShadow(e.target.checked)} />
          <label htmlFor="shadow" style={{ fontSize: '13px', color: '#D1D5DB', cursor: 'pointer' }}>
            Shadow ban — user sees normal activity but bids/listings are hidden
          </label>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          <button className={styles.btnDanger} onClick={submit} disabled={busy || !reason.trim()}>
            {busy ? 'Banning...' : 'Confirm Ban'}
          </button>
        </div>
      </div>
    </div>
  );
};

const UserManagement = () => {
  const { role, roleLevel } = useOutletContext();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [banModal, setBanModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    // email lives in auth.users, not public.users — select only what's guaranteed to exist.
    // role and seller_verified are added via our SQL migration; if missing, query still works
    // but those columns will be null/undefined and filters won't apply.
    let q = supabase
      .from('users')
      .select('userid, firstname, lastname, role, seller_verified, created_at', { count: 'exact' });

    if (search.trim()) {
      // Only search on columns we know exist
      q = q.or(`firstname.ilike.%${search}%,lastname.ilike.%${search}%`);
    }
    // Only apply these filters if the column values are expected to exist
    if (filter === 'sellers') q = q.eq('seller_verified', true);
    if (filter === 'staff') q = q.neq('role', 'user');

    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      console.error('[UserManagement] query error:', error);
    } else {
      setUsers(data ?? []);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [search, filter, page]);

  useEffect(() => { load(); }, [load]);

  const logAction = async (action, targetUser, details = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('admin_action_log').insert({
      admin_id: session.user.id,
      action,
      target: { user_id: targetUser.userid },
      ...details,
    });
  };

  const handleBan = async (user, { reason, duration, shadow }) => {
    try {
      const response = await apiClient.post('/admin-actions', {
        action: 'ban-user',
        payload: { 
          targetUserId: user.userid, 
          reason, 
          durationHours: parseInt(duration, 10), 
          shadowBan: shadow 
        }
      });

      if (response.error) throw new Error(response.error);
      
      setBanModal(null);
      load();
    } catch (err) {
      console.error('Ban error:', err);
      alert(err.message || 'Failed to ban user');
    }
  };

  const handleVerifySeller = async (user) => {
    try {
      const response = await apiClient.post('/admin-actions', {
        action: 'verify-seller',
        payload: { targetUserId: user.userid }
      });

      if (response.error) throw new Error(response.error);
      
      load();
    } catch (err) {
      console.error('Verify seller error:', err);
      alert(err.message || 'Failed to verify seller');
    }
  };

  const roleColors = {
    user: styles.badgeGray,
    support_agent: styles.badgeBlue,
    moderator: styles.badgeYellow,
    admin: styles.badgeBlue,
    super_admin: styles.badgeRed,
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>User Management</h1>
        <p className={styles.pageSubtitle}>View, ban, and verify platform users</p>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>Users ({total})</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select className={styles.filterSelect} value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}>
              <option value="all">All Users</option>
              <option value="sellers">Verified Sellers</option>
              <option value="staff">Staff</option>
            </select>
            <input
              className={styles.searchInput}
              placeholder="Search name / email..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Seller</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.loadingRow}><td colSpan={6}>Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr className={styles.loadingRow}><td colSpan={6}>No users found.</td></tr>
            ) : users.map(u => (
              <tr key={u.userid}>
                <td><strong style={{ color: '#F9FAFB' }}>{u.firstname} {u.lastname}</strong></td>
                <td>
                  <span className={`${styles.badge} ${roleColors[u.role] ?? styles.badgeGray}`}>
                    {u.role ?? 'user'}
                  </span>
                </td>
                <td>
                  {u.seller_verified
                    ? <span className={`${styles.badge} ${styles.badgeGreen}`}>✓ Verified</span>
                    : <span style={{ color: '#4B5563' }}>—</span>}
                </td>
                <td style={{ color: '#6B7280', whiteSpace: 'nowrap' }}>
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td>
                  <div className={styles.actionBtns}>
                    {!u.seller_verified && hasPermission(role, 'moderator') && (
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
                        onClick={() => handleVerifySeller(u)}
                      ><FaUserShield /> Verify Seller</button>
                    )}
                    {hasPermission(role, 'moderator') && u.role === 'user' && (
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                        onClick={() => setBanModal(u)}
                      ><FaBan /> Ban</button>
                    )}
                  </div>
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

      {banModal && (
        <BanModal
          user={banModal}
          canPermBan={hasPermission(role, 'admin')}
          onConfirm={(opts) => handleBan(banModal, opts)}
          onClose={() => setBanModal(null)}
        />
      )}
    </div>
  );
};

export default UserManagement;
