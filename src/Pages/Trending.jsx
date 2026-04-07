import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../Modules/SupabaseClient';
import NotificationBell from '../Modules/NotificationBell';
import styles from './Trending.module.css';
import { FaFire, FaBolt, FaHeart } from 'react-icons/fa';
import { getTransformUrl } from '../utils/imageCompression';
import UniversalHeader from '../Modules/UniversalHeader';

const Trending = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('trending');

  const [intenseCars, setIntenseCars] = useState([]);
  const [highCars, setHighCars] = useState([]);
  const [popularCars, setPopularCars] = useState([]);
  const [loading, setLoading] = useState(true);

  // Helper to format currency
  const formatZAR = (amount) => {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  useEffect(() => {
    const fetchTrendingData = async () => {
      setLoading(true);
      try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        // 1. Fetch Bids from the last hour
        const { data: recentBids, error: bidError } = await supabase
          .from('bid_history')
          .select('listing_id, amount')
          .gte('created_at', oneHourAgo);

        if (bidError) throw bidError;

        // Group bids by listing_id
        const bidCounts = {};
        const currentPrices = {};

        if (recentBids) {
          recentBids.forEach(bid => {
            if (!bidCounts[bid.listing_id]) {
              bidCounts[bid.listing_id] = 0;
              currentPrices[bid.listing_id] = 0;
            }
            bidCounts[bid.listing_id]++;
            // Track highest bid in the last hour as the current price proxy (or we can just fetch from listings later)
            if (bid.amount > currentPrices[bid.listing_id]) {
              currentPrices[bid.listing_id] = bid.amount;
            }
          });
        }

        // 2. Fetch all Likes to calculate popularity
        const { data: allLikes, error: likeError } = await supabase
          .from('likes')
          .select('listing_id');

        if (likeError) throw likeError;

        const likeCounts = {};
        if (allLikes) {
          allLikes.forEach(like => {
            if (!likeCounts[like.listing_id]) {
              likeCounts[like.listing_id] = 0;
            }
            likeCounts[like.listing_id]++;
          });
        }

        // Determine which listings need fetching
        const intenseIds = Object.keys(bidCounts).filter(id => bidCounts[id] >= 50).map(Number);
        const highIds = Object.keys(bidCounts).filter(id => bidCounts[id] >= 10 && bidCounts[id] < 50).map(Number);
        const popularIds = Object.keys(likeCounts).filter(id => likeCounts[id] >= 10).map(Number);

        // Combine all unique IDs to fetch listing details in one go
        const combinedIds = [...new Set([...intenseIds, ...highIds, ...popularIds])];

        if (combinedIds.length > 0) {
          const { data: listingsData, error: listingsError } = await supabase
            .from('listings')
            .select('id, Make, Model, ImageURL, CurrentPrice, status')
            .in('id', combinedIds);

          if (listingsError) throw listingsError;

          // Map the raw listings data into our 3 categorical arrays
          const intense = [];
          const high = [];
          const popular = [];

          listingsData.forEach(listing => {
            // Optional: Filter out 'sold' cars from trending, or keep them? Let's hide sold cars.
            if (listing.status === 'sold') return;

            const enriched = {
              ...listing,
              bidsLastHour: bidCounts[listing.id] || 0,
              totalLikes: likeCounts[listing.id] || 0
            };

            if (intenseIds.includes(listing.id)) intense.push(enriched);
            if (highIds.includes(listing.id)) high.push(enriched);
            if (popularIds.includes(listing.id)) popular.push(enriched);
          });

          // Sort arrays by highest activity
          setIntenseCars(intense.sort((a, b) => b.bidsLastHour - a.bidsLastHour));
          setHighCars(high.sort((a, b) => b.bidsLastHour - a.bidsLastHour));
          setPopularCars(popular.sort((a, b) => b.totalLikes - a.totalLikes));
        }

      } catch (err) {
        console.error("Error fetching trending data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTrendingData();

    // Set up a simple 30-second interval refresh for the trending data.
    // For full real-time we would subscribe to 'bid_history' inserts.
    const interval = setInterval(fetchTrendingData, 30000);
    return () => clearInterval(interval);

  }, []);

  return (
    <div className={styles.trendingPage}>
      <UniversalHeader />

      <main className={styles.mainContainer}>

        <h1 className={styles.pageTitle}>
          <FaFire style={{ color: '#f97316' }} /> TRENDING NOW
        </h1>
        <p className={styles.pageSubtitle}>
          Real-time analysis of the most highly anticipated and heavily contested vehicles on the auction floor right now.
        </p>

        {loading ? (
          <div style={{ color: '#9CA3AF', padding: '40px 0' }}>Analyzing market activity...</div>
        ) : (
          <>
            {/* INTENSE ACTION (50+ Bids) */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <FaBolt className={styles.intenseIcon} /> INTENSE ACTION
                <span className={styles.pulseDot}></span>
              </h2>

              {intenseCars.length > 0 ? (
                <div className={styles.grid}>
                  {intenseCars.map(car => (
                    <div key={car.id} className={`${styles.trendingCard} ${styles.cardIntense}`} onClick={() => navigate(`/listing/${car.id}`)}>
                      <div className={styles.cardLeft}>
                        <img src={getTransformUrl(car.ImageURL, { width: 400 })} alt={car.Model} className={styles.cardImage} />
                      </div>
                      <div className={styles.cardRight}>
                        <div>
                          <h3 className={styles.carName}>{car.Make} {car.Model}</h3>
                          <div className={styles.carPrice}>{formatZAR(car.CurrentPrice)}</div>
                        </div>
                        <div className={`${styles.metricBadge} ${styles.metricIntense}`}>
                          <FaBolt /> {car.bidsLastHour} Bids Last Hour
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <h3>No intense bidding wars right now</h3>
                  <p>Check back during peak hours to see vehicles taking heavy fire.</p>
                </div>
              )}
            </div>

            {/* HIGH ACTION (10-49 Bids) */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <FaFire className={styles.highIcon} /> HIGH ACTION
              </h2>

              {highCars.length > 0 ? (
                <div className={styles.grid}>
                  {highCars.map(car => (
                    <div key={car.id} className={`${styles.trendingCard} ${styles.cardHigh}`} onClick={() => navigate(`/listing/${car.id}`)}>
                      <div className={styles.cardLeft}>
                        <img src={getTransformUrl(car.ImageURL, { width: 400 })} alt={car.Model} className={styles.cardImage} />
                      </div>
                      <div className={styles.cardRight}>
                        <div>
                          <h3 className={styles.carName}>{car.Make} {car.Model}</h3>
                          <div className={styles.carPrice}>{formatZAR(car.CurrentPrice)}</div>
                        </div>
                        <div className={`${styles.metricBadge} ${styles.metricHigh}`}>
                          <FaFire /> {car.bidsLastHour} Bids Last Hour
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <h3>The floor is relatively calm</h3>
                  <p>Vehicles with 10+ recent bids will appear here automatically.</p>
                </div>
              )}
            </div>

            {/* POPULAR CARS (10+ Likes) */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <FaHeart className={styles.popularIcon} /> MOST LOVED
              </h2>

              {popularCars.length > 0 ? (
                <div className={styles.grid}>
                  {popularCars.map(car => (
                    <div key={car.id} className={`${styles.trendingCard} ${styles.cardPopular}`} onClick={() => navigate(`/listing/${car.id}`)}>
                      <div className={styles.cardLeft}>
                        <img src={getTransformUrl(car.ImageURL, { width: 400 })} alt={car.Model} className={styles.cardImage} />
                      </div>
                      <div className={styles.cardRight}>
                        <div>
                          <h3 className={styles.carName}>{car.Make} {car.Model}</h3>
                          <div className={styles.carPrice}>{formatZAR(car.CurrentPrice)}</div>
                        </div>
                        <div className={`${styles.metricBadge} ${styles.metricPopular}`}>
                          <FaHeart /> {car.totalLikes} Curators watching
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <h3>No heavily favorited vehicles yet</h3>
                  <p>Vehicles amassing large numbers of likes enter this curated collection.</p>
                </div>
              )}
            </div>
          </>
        )}

      </main>
    </div>
  );
};

export default Trending;
