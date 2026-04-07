import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../Pages/Dashboard.module.css';
import { FaClock, FaGavel, FaArrowRight } from 'react-icons/fa';
import { getTransformUrl } from '../utils/imageCompression';

const BiddingActivity = ({ listings = [] }) => {
  const navigate = useNavigate();
  
  const formatZAR = (amount) => {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  if (listings.length === 0) return null;

  return (
    <div>
      <h3 className={styles.sectionTitle}>
        Auctions I'm Participating In
        <span className={styles.viewAll} onClick={() => navigate('/auction-floor')}>Browse More &gt;</span>
      </h3>
      <div className={styles.flexColList}>
        {listings.map(item => (
          <div key={item.id} className={styles.listingCard} onClick={() => navigate(`/listing/${item.id}`)} style={{cursor: 'pointer'}}>
            <div className={styles.listingImageWrapper}>
              <img src={getTransformUrl(item.ImageURL, { width: 200 })} alt={`${item.Make} ${item.Model}`} className={styles.listingImage} />
            </div>
            <div className={styles.listingDetails}>
              <div className={styles.listingTitleArea}>
                {item.isLeading ? (
                  <span className={styles.winningTag}>WINNING</span>
                ) : (
                  <span className={styles.outbidTag}>OUTBID</span>
                )}
                <h4 className={styles.listingName}>{item.Year} {item.Make} {item.Model}</h4>
              </div>
              <div className={styles.listingMeta}>
                <span><FaClock /> 2d 14h</span>
                <span><FaGavel /> {item.NumberOfBids || 0} Bids</span>
              </div>
            </div>
            <div className={styles.listingBidInfo}>
              <span className={styles.highestBidLabel}>CURRENT PRICE</span>
              <span className={styles.highestBid}>{formatZAR(item.CurrentPrice || item.StartingPrice)}</span>
            </div>
            <div className={styles.listingActions} style={{ borderLeft: 'none', paddingLeft: '0' }}>
               <FaArrowRight style={{ color: '#6366F1', opacity: 0.5 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BiddingActivity;
