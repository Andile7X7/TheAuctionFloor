import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../Modules/SupabaseClient';
import { apiClient } from '../../utils/apiClient';
import styles from './AdminLayout.module.css';
import { hasPermission } from '../../Modules/AdminRoute';
import { FaCheck, FaTimes, FaStar, FaClock, FaEye } from 'react-icons/fa';

const PAGE_SIZE = 20;

const ActionModal = ({ listing, action, onConfirm, onClose }) => {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [extendsAt, setExtendsAt] = useState('');
  const [busy, setBusy] = useState(false);

  const titles = {
    verify: 'Verify Listing',
    remove: 'Remove Listing',
    feature: 'Feature Listing',
    extend: 'Extend Auction',
    unfeature: 'Unfeature Listing',
  };

  const submit = async () => {
    setBusy(true);
    await onConfirm({ reason, note, extendsAt });
    setBusy(false);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>{titles[action]}</h2>
        <p style={{ fontSize: '13px', color: '#9CA3AF', marginBottom: '16px' }}>
          {listing.Year} {listing.Make} {listing.Model} — Lot #{String(listing.id).padStart(3, '0')}
        </p>

        {(action === 'remove' || action === 'verify') && (
          <div className={styles.field}>
            <label className={styles.label}>Admin Note (optional)</label>
            <input className={styles.input} value={note} onChange={e => setNote(e.target.value)}
              placeholder="Internal note for this action..." />
          </div>
        )}

        {action === 'remove' && (
          <div className={styles.field}>
            <label className={styles.label}>Reason (required)</label>
            <textarea className={styles.textarea} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Counterfeit VIN, fraud, seller request..." required />
          </div>
        )}

        {action === 'extend' && (
          <div className={styles.field}>
            <label className={styles.label}>New Close Date/Time</label>
            <input type="datetime-local" className={styles.input} value={extendsAt}
              onChange={e => setExtendsAt(e.target.value)} />
          </div>
        )}

        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          <button
            className={action === 'remove' ? styles.btnDanger : styles.btnPrimary}
            onClick={submit}
            disabled={busy || (action === 'remove' && !reason.trim())}
          >
            {busy ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ListingManagement = () => {
  const { role, roleLevel } = useOutletContext();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // pending | active | removed | featured
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [modal, setModal] = useState(null); // { listing, action }

  const load = useCallback(async () => {
    setLoading(true);
    
    // First, fetch listings WITHOUT the users join, because no foreign key exists in the schema cache.
    let q = supabase
      .from('listings')
      .select('id, Make, Model, Year, CurrentPrice, status, verified, featured, report_count, created_at, admin_note, userid', { count: 'exact' });

    if (filter === 'appealed') {
      const { data: appeals } = await supabase.from('listing_appeals').select('listing_id, reason').eq('status', 'pending');
      const appealListingIds = appeals?.map(a => a.listing_id) || [];
      if (appealListingIds.length === 0) {
        setListings([]);
        setTotal(0);
        setLoading(false);
        return;
      }
      q = q.in('id', appealListingIds);
    } else if (filter === 'pending') {
      q = q.eq('verified', false).neq('status', 'removed');
    } else if (filter === 'active') {
      q = q.eq('status', 'active').eq('verified', true);
    } else if (filter === 'removed') {
      q = q.eq('status', 'removed');
    } else if (filter === 'featured') {
      q = q.eq('featured', true);
    }

    if (search.trim()) {
      q = q.or(`Make.ilike.%${search}%,Model.ilike.%${search}%`);
    }

    const { data: listingsData, count, error } = await q
      .order('created_at', { ascending: filter === 'pending' })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      console.error('[ListingManagement] listings query error:', error);
      setListings([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    if (!listingsData || listingsData.length === 0) {
      setListings([]);
      setTotal(count ?? 0);
      setLoading(false);
      return;
    }

    // Now, manually fetch the users for these listings and map them
    const userIds = [...new Set(listingsData.map(l => l.userid).filter(Boolean))];
    let mappedListings = listingsData;

    if (userIds.length > 0) {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('userid, firstname, lastname, seller_verified')
        .in('userid', userIds);

      if (!usersError && usersData) {
        // Also fetch appeals if we are in appealed filter mapping
        let defaultAppeals = [];
        if (filter === 'appealed') {
           const { data: fetchAppeals } = await supabase.from('listing_appeals').select('*').in('listing_id', userIds.length > 0 ? listingsData.map(l=>l.id) : []).eq('status', 'pending');
           defaultAppeals = fetchAppeals || [];
        }

        const userMap = {};
        usersData.forEach(u => { userMap[u.userid] = u; });
        mappedListings = listingsData.map(l => ({
          ...l,
          users: userMap[l.userid] || null,
          appeal: filter === 'appealed' ? defaultAppeals.find(a => a.listing_id === l.id) : null
        }));
      }
    }

    setListings(mappedListings);
    setTotal(count ?? 0);
    setLoading(false);
  }, [filter, search, page]);

  useEffect(() => { load(); }, [load]);

  const logAction = async (action, listing, details = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('admin_action_log').insert({
      admin_id: session.user.id,
      action,
      target: { listing_id: listing.id, seller_id: listing.userid },
      previous_state: { status: listing.status, verified: listing.verified },
      ...details,
    });
  };

  const handleAction = async ({ reason, note, extendsAt }) => {
    const { listing, action } = modal;
    
    try {
      if (action === 'verify') {
        const response = await apiClient.post('/admin-actions', {
          action: 'verify-listing',
          payload: { 
            listingId: listing.id, 
            sellerId: listing.userid, 
            note 
          }
        });
        if (response.error) throw new Error(response.error);
        
        // Handle appeal resolution state locally (or let server handle it fully if we extend API)
        if (listing.appeal) {
          await supabase.from('listing_appeals').update({ status: 'approved' }).eq('id', listing.appeal.id);
        }

      } else if (action === 'remove') {
        const response = await apiClient.post('/admin-actions', {
          action: 'reject-listing',
          payload: { 
            listingId: listing.id, 
            sellerId: listing.userid, 
            reason, 
            note 
          }
        });
        if (response.error) throw new Error(response.error);

        if (listing.appeal) {
          await supabase.from('listing_appeals').update({ status: 'denied' }).eq('id', listing.appeal.id);
        }

      } else if (action === 'feature') {
        const { error } = await supabase.from('listings').update({ featured: true }).eq('id', listing.id);
        if (error) throw error;
      } else if (action === 'unfeature') {
        const { error } = await supabase.from('listings').update({ featured: false }).eq('id', listing.id);
        if (error) throw error;
      } else if (action === 'extend' && extendsAt) {
        const { error } = await supabase.from('listings')
          .update({ closes_at: new Date(extendsAt).toISOString() })
          .eq('id', listing.id);
        if (error) throw error;
      }

      setModal({ show: false, listing: null, action: null });
      fetchListings();
      
    } catch (err) {
      console.error('Admin action error:', err);
      alert(err.message || 'Operation failed');
    }
  };

  const formatZAR = (n) =>
    new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n || 0);

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Listing Management</h1>
        <p className={styles.pageSubtitle}>Review, approve, and moderate listings</p>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>
            {filter === 'pending' ? `Pending Review (${total})` : `${filter.charAt(0).toUpperCase() + filter.slice(1)} (${total})`}
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select
              className={styles.filterSelect}
              value={filter}
              onChange={e => { setFilter(e.target.value); setPage(0); }}
            >
              <option value="pending">Pending Review</option>
              <option value="appealed">Appeals Queue</option>
              <option value="active">Active</option>
              <option value="featured">Featured</option>
              <option value="removed">Removed</option>
            </select>
            <input
              className={styles.searchInput}
              placeholder="Search make / model..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Lot</th>
              <th>Vehicle</th>
              <th>Seller</th>
              <th>Price</th>
              <th>Status</th>
              <th>Reports</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.loadingRow}><td colSpan={7}>Loading...</td></tr>
            ) : listings.length === 0 ? (
              <tr className={styles.loadingRow}><td colSpan={7}>No listings found.</td></tr>
            ) : listings.map(l => {
              const seller = l.users;
              return (
                <tr key={l.id}>
                  <td style={{ color: '#6B7280', fontFamily: 'monospace' }}>
                    #{String(l.id).padStart(3, '0')}
                  </td>
                  <td>
                    <strong style={{ color: '#F9FAFB' }}>{l.Year} {l.Make} {l.Model}</strong>
                    {l.featured && <span className={`${styles.badge} ${styles.badgeBlue}`} style={{ marginLeft: '6px' }}>⭐ Featured</span>}
                    {l.appeal && <div style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>Appeal: "{l.appeal.reason}"</div>}
                  </td>
                  <td>
                    <span style={{ color: '#D1D5DB' }}>{seller?.firstname} {seller?.lastname}</span>
                    {seller?.seller_verified
                      ? <span className={`${styles.badge} ${styles.badgeGreen}`} style={{ marginLeft: '6px' }}>✓ Verified</span>
                      : <span className={`${styles.badge} ${styles.badgeGray}`} style={{ marginLeft: '6px' }}>Unverified</span>}
                  </td>
                  <td>{formatZAR(l.CurrentPrice)}</td>
                  <td>
                    {!l.verified
                      ? <span className={`${styles.badge} ${styles.badgeYellow}`}>Pending</span>
                      : l.status === 'removed'
                        ? <span className={`${styles.badge} ${styles.badgeRed}`}>Removed</span>
                        : <span className={`${styles.badge} ${styles.badgeGreen}`}>Active</span>}
                  </td>
                  <td>
                    {l.report_count > 0
                      ? <span className={`${styles.badge} ${styles.badgeRed}`}>{l.report_count}</span>
                      : <span style={{ color: '#4B5563' }}>—</span>}
                  </td>
                  <td>
                    <div className={styles.actionBtns}>
                      <a href={`/listing/${l.id}`} target="_blank" rel="noreferrer">
                        <button className={styles.actionBtn}><FaEye /></button>
                      </a>
                      {!l.verified && hasPermission(role, 'moderator') && (
                        <button
                          className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
                          onClick={() => setModal({ listing: l, action: 'verify' })}
                        ><FaCheck /> {l.appeal ? 'Approve Appeal' : 'Verify'}</button>
                      )}
                      {(l.status !== 'removed' || l.appeal) && (
                        <button
                          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                          onClick={() => setModal({ listing: l, action: 'remove' })}
                        ><FaTimes /> {l.appeal ? 'Deny Appeal' : 'Remove'}</button>
                      )}
                      {hasPermission(role, 'moderator') && !l.featured && l.status === 'active' && (
                        <button
                          className={styles.actionBtn}
                          onClick={() => setModal({ listing: l, action: 'feature' })}
                        ><FaStar /> Feature</button>
                      )}
                      {l.featured && (
                        <button
                          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                          onClick={() => setModal({ listing: l, action: 'unfeature' })}
                        >Unfeature</button>
                      )}
                      {hasPermission(role, 'admin') && (
                        <button
                          className={styles.actionBtn}
                          onClick={() => setModal({ listing: l, action: 'extend' })}
                        ><FaClock /> Extend</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className={styles.pagination}>
          <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
          <button className={styles.pageBtn} disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <button className={styles.pageBtn} disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      </div>

      {modal && (
        <ActionModal
          listing={modal.listing}
          action={modal.action}
          onConfirm={handleAction}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default ListingManagement;
