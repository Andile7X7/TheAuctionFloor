import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../Modules/SupabaseClient';
import styles from './AdminLayout.module.css';
import { FaTrash, FaPlus } from 'react-icons/fa';

const BannedKeywords = () => {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newKeyword, setNewKeyword] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('banned_keywords')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[BannedKeywords]', error);
    } else {
      setKeywords(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addKeyword = async () => {
    const kw = newKeyword.trim().toLowerCase();
    if (!kw) return;
    setAdding(true);
    setError('');

    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from('banned_keywords').insert({
      keyword: kw,
      added_by: session?.user?.id,
    });

    if (error) {
      setError(error.code === '23505' ? 'That keyword is already banned.' : error.message);
    } else {
      setNewKeyword('');
      load();
    }
    setAdding(false);
  };

  const removeKeyword = async (id) => {
    await supabase.from('banned_keywords').delete().eq('id', id);
    load();
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Banned Keywords</h1>
        <p className={styles.pageSubtitle}>
          Words auto-flagged in listing titles and descriptions for moderator review
        </p>
      </div>

      {/* Add keyword */}
      <div className={styles.tableWrap} style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <input
            className={styles.searchInput}
            style={{ flex: 1 }}
            placeholder="Enter keyword to ban (e.g. salvage, written-off)..."
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addKeyword()}
          />
          <button
            className={styles.btnPrimary}
            onClick={addKeyword}
            disabled={adding || !newKeyword.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            <FaPlus /> {adding ? 'Adding...' : 'Add Keyword'}
          </button>
        </div>
        {error && <p style={{ color: '#EF4444', fontSize: '13px', marginTop: '8px' }}>{error}</p>}
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>Banned Keywords ({keywords.length})</span>
        </div>
        {loading ? (
          <div className={styles.emptyState}>Loading...</div>
        ) : keywords.length === 0 ? (
          <div className={styles.emptyState}>No banned keywords yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Keyword</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map(kw => (
                <tr key={kw.id}>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeRed}`}>{kw.keyword}</span>
                  </td>
                  <td style={{ color: '#6B7280' }}>
                    {new Date(kw.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                      onClick={() => removeKeyword(kw.id)}
                    >
                      <FaTrash /> Remove
                    </button>
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

export default BannedKeywords;
