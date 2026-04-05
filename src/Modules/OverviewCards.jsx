import React from 'react';
import styles from '../Pages/Dashboard.module.css';
import { FaCar, FaGavel, FaMoneyBillWave, FaChartLine, FaBolt, FaStar } from 'react-icons/fa';

const OverviewCards = ({ listings = [], participating = [] }) => {
  const activeCount = listings.length;
  const participationCount = participating.length;
  const winningCount = participating.filter(p => p.isLeading).length;

  const totalBidsReceived = listings.reduce((sum, item) => sum + (item.NumberOfBids || 0), 0);
  const totalValuation = listings.reduce((sum, item) => sum + (item.CurrentPrice || item.StartingPrice || 0), 0);

  const formatZAR = (amount) => {
    return new Intl.NumberFormat('en-ZA', { 
      style: 'currency', 
      currency: 'ZAR', 
      maximumFractionDigits: 0, 
      minimumFractionDigits: 0 
    }).format(amount);
  };

  return (
    <div className={styles.statsGrid}>
      <div className={styles.statCard}>
        <div className={styles.statHeader}>My Listings</div>
        <h3 className={styles.statValue}>{activeCount}</h3>
        <FaCar className={styles.statIconBg} />
        <div className={styles.statFooter}>
          <FaChartLine className={styles.statTrendUp} />
          <span>{totalBidsReceived} bids received</span>
        </div>
      </div>

      <div className={styles.statCard}>
        <div className={styles.statHeader}>Participating In</div>
        <h3 className={styles.statValue}>{participationCount}</h3>
        <FaGavel className={styles.statIconBg} />
        <div className={styles.statFooter}>
          <FaBolt style={{ color: winningCount > 0 ? '#10B981' : '#fff' }} />
          <span>{winningCount} Winning currently</span>
        </div>
      </div>

      <div className={styles.statCard}>
        <div className={styles.statHeader}>Inventory Value</div>
        <h3 className={`${styles.statValue} ${styles.accent}`}>{formatZAR(totalValuation)}</h3>
        <FaMoneyBillWave className={styles.statIconBg} />
        <div className={styles.statFooter}>
          <FaStar style={{ color: '#ffb480' }} />
          <span style={{ color: '#ffb480' }}>Premium Tier Seller</span>
        </div>
      </div>
    </div>
  );
};

export default OverviewCards;
