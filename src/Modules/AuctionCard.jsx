import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBookmark, FaFire, FaRegComment, FaBolt, FaGavel } from 'react-icons/fa';
import { supabase } from './SupabaseClient';
import styles from '../Pages/AuctionFloor.module.css';
import { buildSrcSet, getTransformUrl } from '../utils/imageCompression';

const AUCTION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 1 week in ms

const useCountdown = (createdAt) => {
  const getTimeLeft = () => {
    const end = new Date(createdAt).getTime() + AUCTION_DURATION_MS;
    const diff = end - Date.now();
    return Math.max(0, diff);
  };

  const [timeLeft, setTimeLeft] = useState(getTimeLeft());

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = getTimeLeft();
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return timeLeft;
};

const formatCountdown = (ms) => {
  if (ms <= 0) return { label: 'ENDED', urgent: true };

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours >= 1) {
    return {
      label: `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`,
      urgent: hours < 6,
    };
  } else {
    return {
      label: `${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`,
      urgent: true,
    };
  }
};

const AuctionCard = ({ listing, currentUser }) => {
  const navigate = useNavigate();
  const timeLeft = useCountdown(listing.created_at);
  const { label: timerLabel, urgent } = formatCountdown(timeLeft);
  const [leaderName, setLeaderName] = useState(null);
  const [highAction, setHighAction] = useState(false);
  const isOwner = currentUser?.id === listing.userid;

  useEffect(() => {
    const fetchCardMeta = async () => {
      // Fetch leading bidder's first name
      const { data: topBid } = await supabase
        .from('bid_history')
        .select('userid')
        .eq('listing_id', listing.id)
        .order('amount', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (topBid?.userid) {
        // Fetch the leading bidder's name from your existing users table
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('firstname')
          .eq('userid', topBid.userid)
          .maybeSingle();

        if (userError) {
          console.error("User fetch error:", userError);
        }

        if (!userError && userData) {
          setLeaderName(userData.firstname);
        }
      }

      // Check for high action: 10+ bids in last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('bid_history')
        .select('*', { count: 'exact', head: true })
        .eq('listing_id', listing.id)
        .gte('created_at', oneHourAgo);

      if (count && count >= 10) {
        setHighAction(true);
      }
    };

    fetchCardMeta();
  }, [listing.id]);

  const formatZAR = (amount) => {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  return (
    <div className={styles.card} onClick={() => navigate(`/listing/${listing.id}`)}>
      <div className={styles.imageArea}>
        <div className={listing.status === 'sold' ? styles.soldTag : styles.liveTag}>
          {listing.status === 'sold' ? 'SOLD' : timeLeft <= 0 ? 'ENDED' : 'LIVE'}
        </div>
        {isOwner && (
          <div className={styles.ownerBadge}>YOUR LISTING</div>
        )}
        {highAction && (
          <div className={styles.highActionBadge}>
            <FaBolt /> HIGH ACTION
          </div>
        )}
        <button className={styles.bookmarkBtn} onClick={(e) => e.stopPropagation()}>
          <FaBookmark />
        </button>
        <img
          src={getTransformUrl(listing.ImageURL, { width: 800 })}
          srcSet={buildSrcSet(listing.ImageURL)}
          sizes="(max-width: 480px) 400px, (max-width: 1024px) 800px, 800px"
          alt={listing.Model}
          className={styles.cardImage}
          style={{ filter: listing.status === 'sold' ? 'grayscale(80%) brightness(0.6)' : 'none' }}
          loading="lazy"
        />
        <div className={styles.cardTitleOverlay}>
          <span className={styles.lotNumber}>LOT #{listing.id.toString().padStart(3, '0')}</span>
          <h3 className={styles.cardTitle}>{listing.Year} {listing.Make} {listing.Model}</h3>
        </div>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.bidRow}>
          <div className={styles.bidCol}>
            <span className={styles.bidLabel}>CURRENT BID</span>
            <span className={styles.bidValue}>{formatZAR(listing.CurrentPrice || listing.StartingPrice)}</span>
            {leaderName && (
              <span className={styles.leaderName}>Leading Bidder: {leaderName}</span>
            )}
          </div>
          <div className={styles.bidCol}>
            <span className={styles.bidLabel}>TIME LEFT</span>
            <span className={`${styles.timeValue} ${urgent ? styles.timeUrgent : ''}`}>
              {timerLabel}
            </span>
          </div>
        </div>

        <div className={styles.cardFooter}>
          <div className={styles.stats}>
            <span className={styles.heatStat}><FaFire /> {listing.likes?.[0]?.count || 0}</span>
            <span><FaRegComment /> {listing.comments?.[0]?.count || 0}</span>
            <span><FaGavel /> {listing.NumberOfBids || 0}</span>
          </div>
          <button 
            className={isOwner ? styles.manageBtn : styles.placeBidBtn}
            onClick={(e) => {
              if (isOwner) {
                e.stopPropagation();
                navigate('/my-listings');
              }
            }}
          >
            {isOwner ? 'MANAGE LISTING' : 'PLACE BID'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuctionCard;
