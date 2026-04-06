import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../Pages/Dashboard.module.css';
import { FaClock, FaUsers, FaPen, FaTrashAlt } from 'react-icons/fa';

const ActiveListings = ({ listings = [] }) => {
  const navigate = useNavigate();
  const formatZAR = (amount) => {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
  };

  return (
    <div>
      <h3 className={styles.sectionTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        My Active Listings
        <button
          onClick={() => navigate('/add-listing')}
          style={{
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 14px',
            fontSize: '12px',
            fontWeight: '700',
            cursor: 'pointer',
            letterSpacing: '0.5px'
          }}
        >
          + List New Vehicle
        </button>
      </h3>
      <div className={styles.flexColList}>
        {listings.length === 0 && (
          <p style={{ color: '#9CA3AF', padding: '20px 0', fontSize: '14px' }}>
            No live listings found. List a new vehicle to get started!
          </p>
        )}
        {listings.map(item => (
          <div key={item.id} className={styles.listingCard} onClick={() => navigate(`/listing/${item.id}`)} style={{cursor: 'pointer'}}>
            <div className={styles.listingImageWrapper}>
              <img src={item.ImageURL} alt={`${item.Make} ${item.Model}`} className={styles.listingImage} />
            </div>
            <div className={styles.listingDetails}>
              <div className={styles.listingTitleArea}>
                <span className={styles.liveTag}>LIVE</span>
                <h4 className={styles.listingName}>{item.Year} {item.Make} {item.Model}</h4>
              </div>
              <div className={styles.listingMeta}>
                <span><FaClock /> 2d 14h</span>
                <span><FaUsers /> 0 Bidders</span>
              </div>
            </div>
            <div className={styles.listingBidInfo}>
              <span className={styles.highestBidLabel}>HIGHEST BID</span>
              <span className={styles.highestBid}>{formatZAR(item.CurrentPrice || item.StartingPrice)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActiveListings;
