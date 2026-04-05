import React, { useEffect, useRef } from 'react';
import { FaGavel, FaShieldAlt, FaTimes } from 'react-icons/fa';
import styles from './BidConfirmModal.module.css';

const BidConfirmModal = ({ amount, currentPrice, listingName, vehicle, onConfirm, onCancel }) => {
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    // Auto-focus confirm button for keyboard accessibility
    confirmBtnRef.current?.focus();

    const handleKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const formatZAR = (n) =>
    new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n || 0);

  const increase = amount - (currentPrice || 0);
  const increasePercent = currentPrice
    ? ((increase / currentPrice) * 100).toFixed(1)
    : null;

  // Buyer's Premium calculation (e.g., 5% capped at R15,000)
  const buyersPremium = Math.min(amount * 0.05, 15000);
  const totalCommitment = amount + buyersPremium;

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

        {/* Close Button */}
        <button className={styles.closeX} onClick={onCancel} aria-label="Cancel bid">
          <FaTimes />
        </button>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.gavelBadge}>
            <FaGavel />
          </div>
          <h2 className={styles.title}>Confirm Your Bid</h2>
          <p className={styles.sub}>Review the final breakdown before committing</p>
        </div>

        {/* Vehicle Info */}
        <div className={styles.vehicleBanner}>
          <span className={styles.vehicleLabel}>VEHICLE</span>
          <span className={styles.vehicleName}>{listingName || vehicle}</span>
        </div>

        {/* Bid Breakdown */}
        <div className={styles.breakdown}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Your Bid Amount</span>
            <span className={styles.rowValue}>{formatZAR(amount)}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Buyer's Premium (5%)</span>
            <span className={styles.rowValue}>{formatZAR(buyersPremium)}</span>
          </div>
          <div className={styles.divider} />
          <div className={`${styles.row} ${styles.totalRow}`}>
            <span className={styles.totalLabel}>Total Commitment</span>
            <div className={styles.totalValueGroup}>
              <span className={styles.totalValue}>{formatZAR(totalCommitment)}</span>
              {increase > 0 && (
                <span className={styles.increaseBadge}>
                  +{formatZAR(increase)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Escrow Note */}
        <div className={styles.escrowNote}>
          <FaShieldAlt className={styles.shieldIcon} />
          <span>All bids are protected by CarBidPlatform Escrow Guarantee</span>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.confirmBtn} ref={confirmBtnRef} onClick={onConfirm}>
            <FaGavel /> Place Bid — {formatZAR(amount)}
          </button>
        </div>

        <p className={styles.legalNote}>
          By confirming, you agree that this bid is legally binding upon acceptance.
        </p>
      </div>
    </div>
  );
};

export default BidConfirmModal;
