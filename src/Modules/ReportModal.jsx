import React, { useState } from 'react';
import { supabase } from './SupabaseClient';

/**
 * ReportModal — shared user-facing report dialog.
 * Props:
 *   targetType: 'listing' | 'comment' | 'user'
 *   targetId:   string
 *   onClose:    () => void
 */
const REASONS = {
  listing: [
    'Fraudulent / scam listing',
    'Incorrect vehicle information',
    'Counterfeit or stolen vehicle',
    'Duplicate listing',
    'Inappropriate content',
    'Other',
  ],
  comment: [
    'Harassment / abusive language',
    'Spam or off-topic',
    'Misinformation',
    'Other',
  ],
  user: [
    'Shill bidding / bid manipulation',
    'Impersonation',
    'Fraud',
    'Other',
  ],
};

const ReportModal = ({ targetType, targetId, onClose }) => {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | done | error

  const submit = async () => {
    if (!reason) return;
    setStatus('submitting');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setStatus('error');
      return;
    }

    const { error } = await supabase.from('reports').insert({
      reporter_id: session.user.id,
      target_type: targetType,
      target_id: String(targetId),
      reason,
      detail: detail.trim() || null,
    });

    setStatus(error ? 'error' : 'done');
  };

  const reasons = REASONS[targetType] ?? REASONS.listing;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        {status === 'done' ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>✅</div>
            <h3 style={heading}>Report Submitted</h3>
            <p style={sub}>Our moderation team will review this shortly. Thank you.</p>
            <button style={primaryBtn} onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <h3 style={heading}>Report {targetType.charAt(0).toUpperCase() + targetType.slice(1)}</h3>
            <p style={sub}>Help us keep the platform safe. All reports are reviewed by our team.</p>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Reason</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {reasons.map(r => (
                  <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="report-reason"
                      value={r}
                      checked={reason === r}
                      onChange={() => setReason(r)}
                      style={{ accentColor: '#6b82ff' }}
                    />
                    <span style={{ fontSize: '13px', color: '#D1D5DB' }}>{r}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Additional detail (optional)</label>
              <textarea
                value={detail}
                onChange={e => setDetail(e.target.value)}
                placeholder="Provide any additional context..."
                style={textarea}
                rows={3}
              />
            </div>

            {status === 'error' && (
              <p style={{ color: '#EF4444', fontSize: '13px', marginBottom: '12px' }}>
                Failed to submit. Please try again.
              </p>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button style={secondaryBtn} onClick={onClose}>Cancel</button>
              <button
                style={{ ...primaryBtn, opacity: (!reason || status === 'submitting') ? 0.5 : 1 }}
                onClick={submit}
                disabled={!reason || status === 'submitting'}
              >
                {status === 'submitting' ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Inline styles (no CSS file dependency) ─────────────────────────────────
const overlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 2000, padding: '24px',
};
const modal = {
  background: '#121620',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
  padding: '28px',
  width: '100%', maxWidth: '420px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  fontFamily: 'Inter, system-ui, sans-serif',
};
const heading = {
  color: '#F9FAFB', fontSize: '17px', fontWeight: 800,
  margin: '0 0 6px', letterSpacing: '-0.3px',
};
const sub = {
  color: '#9CA3AF', fontSize: '13px', margin: '0 0 20px', lineHeight: 1.5,
};
const labelStyle = {
  display: 'block', fontSize: '11px', fontWeight: 600,
  color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px',
  marginBottom: '8px',
};
const textarea = {
  width: '100%', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px', color: '#E5E7EB',
  fontSize: '13px', padding: '10px 12px',
  outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box', resize: 'vertical',
};
const primaryBtn = {
  background: 'linear-gradient(135deg, #6b82ff, #475eff)',
  border: 'none', borderRadius: '8px', color: '#fff',
  cursor: 'pointer', fontSize: '13px', fontWeight: 700,
  padding: '10px 20px', fontFamily: 'inherit',
};
const secondaryBtn = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px', color: '#9CA3AF',
  cursor: 'pointer', fontSize: '13px', fontWeight: 600,
  padding: '10px 20px', fontFamily: 'inherit',
};

export default ReportModal;
