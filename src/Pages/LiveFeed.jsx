import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../Modules/SupabaseClient';
import styles from './LiveFeed.module.css';
import UniversalHeader from '../Modules/UniversalHeader';
import { FaGavel, FaHeart, FaComment } from 'react-icons/fa';

const LiveFeed = () => {
    const navigate = useNavigate();
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
    const fetchActivities = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('activities')
          .select(`
            id, type, created_at, metadata, listing_id,
            listings(ImageURL, Make, Model)
          `)
          .order('created_at', { ascending: false })
          .limit(50);
  
        if (error) {
          console.error("LiveFeed Fetch Error:", error);
        } else {
          setActivities(data || []);
        }
      } catch (err) {
        console.error("Exception fetching activities:", err);
      } finally {
        setLoading(false);
      }
    };
  
    fetchActivities();

    // Poll every 10s — removes the global activities WebSocket entirely.
    // At 1000 concurrent users that was 1000 sockets; now it's 100 req/s to the DB.
    const interval = setInterval(fetchActivities, 10_000);
    return () => clearInterval(interval);
  }, []);

  const formatTimeAgo = (timestamp) => {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return "Just now";
  };

  const formatZAR = (amount) => {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  return (
    <div className={styles.liveFeedPage}>
      <UniversalHeader />

      {/* Content */}
      <div className={styles.mainContainer}>
        <h1 className={styles.pageTitle}>
          <div className={styles.pulseDot}></div> Live Interactions
        </h1>
        <p className={styles.pageSubtitle}>Watch the auction floor pulse with real-time bids, comments, and heat.</p>
        
        {loading ? (
          <div className={styles.statusMsg}>Synchronizing with the auction floor...</div>
        ) : activities.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>No recent activity discovered</h3>
            <p>Check back later or start placing bids to see the floor come alive.</p>
          </div>
        ) : (
          <div className={styles.feedList}>
            {activities.map((act) => {
              const meta = act.metadata || {};
              const userName = meta.userName || 'Someone';
              const carName = meta.carName || act.listings?.Model || 'a vehicle';
              const imgUrl = act.listings?.ImageURL || 'https://via.placeholder.com/150x150?text=No+Image';

              let icon = null;
              let content = '';
              let badgeClass = '';

              if (act.type === 'bid') {
                icon = <FaGavel />;
                badgeClass = 'bid';
                content = (
                  <span className={styles.activityText}>
                    <strong>{userName}</strong> bids <strong>{formatZAR(meta.amount)}</strong> for the <strong>{carName}</strong>
                  </span>
                );
              } else if (act.type === 'like') {
                icon = <FaHeart />;
                badgeClass = 'like';
                content = (
                  <span className={styles.activityText}>
                    <strong>{userName}</strong> liked this <strong>{carName}</strong>
                  </span>
                );
              } else if (act.type === 'comment') {
                icon = <FaComment />;
                badgeClass = 'comment';
                content = (
                  <span className={styles.activityText}>
                    <strong>{userName}</strong> commented on the <strong>{carName}</strong>
                    <div className={styles.commentBubble}>"{meta.commentText}"</div>
                  </span>
                );
              }

              return (
                <div 
                  key={act.id} 
                  className={`${styles.activityCard} ${styles[`type-${act.type}`]}`}
                  onClick={() => navigate(`/listing/${act.listing_id}`)}
                >
                  <img src={imgUrl} alt={carName} className={styles.cardImage} />
                  
                  <div className={styles.cardContent}>
                    <div className={styles.topRow}>
                      <div className={`${styles.iconWrap} ${styles[badgeClass]}`}>
                        {icon}
                      </div>
                      <span className={styles.timestamp}>{formatTimeAgo(act.created_at)}</span>
                    </div>
                    {content}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveFeed;
