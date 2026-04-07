import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../Modules/SupabaseClient';
import styles from './AdminLayout.module.css';
import { FaCheck, FaTimes, FaEye } from 'react-icons/fa';

const PAGE_SIZE = 20;

const ResolveModal = ({ report, onConfirm, onClose }) => {
  const [resolution, setResolution] = useState('resolved');
  const [action, setAction] = useState('none');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await onConfirm({ resolution, action });
    setBusy(false);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Resolve Report</h2>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#F9FAFB', fontWeight: 600 }}>
            {report.target_type.toUpperCase()}: {report.target_id}
          </p>
          <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#9CA3AF' }}>
            <strong>Reason:</strong> {report.reason}
          </p>
          {report.detail && (
            <p style={{ margin: 0, fontSize: '12px', color: '#6B7280' }}>{report.detail}</p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Resolution</label>
          <select className={styles.select} value={resolution} onChange={e => setResolution(e.target.value)}>
            <option value="resolved">Resolved — action taken</option>
            <option value="dismissed">Dismissed — not a violation</option>
          </select>
        </div>

        {report.target_type === 'listing' && resolution === 'resolved' && (
          <div className={styles.field}>
            <label className={styles.label}>Action on listing</label>
            <select className={styles.select} value={action} onChange={e => setAction(e.target.value)}>
              <option value="none">No automatic action</option>
              <option value="remove">Remove listing</option>
            </select>
          </div>
        )}

        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={submit} disabled={busy}>
            {busy ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Reports = () => {
  const { role } = useOutletContext();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('reports')
      .select('*', { count: 'exact' });

    q = q.eq('status', filter);
    if (typeFilter !== 'all') q = q.eq('target_type', typeFilter);

    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (!error) { setReports(data ?? []); setTotal(count ?? 0); }
    setLoading(false);
  }, [filter, typeFilter, page]);

  useEffect(() => { load(); }, [load]);

  const logAction = async (action, report, details = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('admin_action_log').insert({
      admin_id: session.user.id,
      action,
      target: { report_id: report.id, target_type: report.target_type, target_id: report.target_id },
      previous_state: { status: report.status },
      ...details,
    });
  };

  const handleResolve = async (report, { resolution, action }) => {
    const { data: { session } } = await supabase.auth.getSession();

    await supabase.from('reports').update({
      status: resolution,
      resolved_by: session.user.id,
    }).eq('id', report.id);

    if (action === 'remove' && report.target_type === 'listing') {
      await supabase.from('listings').update({ status: 'removed', verified: false })
        .eq('id', parseInt(report.target_id));
    }

    await logAction('report_resolved', report, {
      reason: resolution,
      new_state: { status: resolution, action_taken: action },
    });

    if (report.reporter_id) {
      await supabase.from('notifications').insert({
        recipient_id: report.reporter_id,
        actor_id: session.user.id,
        type: 'system',
        message: `Your report regarding a ${report.target_type} has been reviewed and ${resolution}. Thank you for keeping the platform safe.`
      });
    }

    setModal(null);
    load();
  };

  const typeColors = {
    listing: styles.badgeBlue,
    comment: styles.badgeYellow,
    user: styles.badgeRed,
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Reports Queue</h1>
        <p className={styles.pageSubtitle}>User-submitted reports for listings, comments, and users</p>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>
            {filter === 'open' ? `Open Reports (${total})` : `${filter} (${total})`}
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select className={styles.filterSelect} value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}>
              <option value="open">Open</option>
              <option value="reviewing">Reviewing</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
            <select className={styles.filterSelect} value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0); }}>
              <option value="all">All Types</option>
              <option value="listing">Listings</option>
              <option value="comment">Comments</option>
              <option value="user">Users</option>
            </select>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Target</th>
              <th>Reason</th>
              <th>Detail</th>
              <th>Reported</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.loadingRow}><td colSpan={6}>Loading...</td></tr>
            ) : reports.length === 0 ? (
              <tr className={styles.loadingRow}><td colSpan={6}>No reports found. 🎉</td></tr>
            ) : reports.map(r => (
              <tr key={r.id}>
                <td>
                  <span className={`${styles.badge} ${typeColors[r.target_type] ?? styles.badgeGray}`}>
                    {r.target_type}
                  </span>
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#9CA3AF' }}>
                  {r.target_id}
                </td>
                <td style={{ fontWeight: 600, color: '#F9FAFB', maxWidth: '160px' }}>
                  {r.reason}
                </td>
                <td style={{ color: '#9CA3AF', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.detail ?? '—'}
                </td>
                <td style={{ color: '#6B7280', whiteSpace: 'nowrap' }}>
                  {new Date(r.created_at).toLocaleDateString()}
                </td>
                <td>
                  {filter === 'open' || filter === 'reviewing' ? (
                    <div className={styles.actionBtns}>
                      {r.target_type === 'listing' && (
                        <a href={`/listing/${r.target_id}`} target="_blank" rel="noreferrer">
                          <button className={styles.actionBtn}><FaEye /></button>
                        </a>
                      )}
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
                        onClick={() => setModal(r)}
                      ><FaCheck /> Resolve</button>
                      <button
                        className={styles.actionBtn}
                        onClick={async () => {
                          await handleResolve(r, { resolution: 'dismissed', action: 'none' });
                        }}
                      ><FaTimes /> Dismiss</button>
                    </div>
                  ) : (
                    <span className={`${styles.badge} ${r.status === 'resolved' ? styles.badgeGreen : styles.badgeGray}`}>
                      {r.status}
                    </span>
                  )}
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

      {modal && (
        <ResolveModal
          report={modal}
          onConfirm={(opts) => handleResolve(modal, opts)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default Reports;
