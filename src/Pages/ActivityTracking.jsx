import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../Modules/SupabaseClient';
import DashboardLayout from '../Modules/DashboardLayout';
import AuctionCard from '../Modules/AuctionCard';
import styles from './ActivityTracking.module.css';
import { FaGavel, FaHeart, FaBookmark, FaChevronRight } from 'react-icons/fa';
import { getTransformUrl } from '../utils/imageCompression';

const ActivityTracking = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Get tab from URL query params
  const queryParams = new URLSearchParams(location.search);
  const currentTab = queryParams.get('tab') || 'bids';

  useEffect(() => {
    const fetchActivityData = async () => {
      setLoading(true);
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          navigate('/signup');
          return;
        }
        setUser(user);

        let finalData = [];

        if (currentTab === 'bids') {
          // Fetch user's bid history with listing details
          const { data, error } = await supabase
            .from('bid_history')
            .select(`
              amount,
              created_at,
              listing_id,
              listings (*)
            `)
            .eq('userid', user.id)
            .order('created_at', { ascending: false });

          if (error) throw error;
          
          // Unique by listing_id (keeping most recent/highest)
          const uniqueBids = {};
          data.forEach(bid => {
            if (!uniqueBids[bid.listing_id] || uniqueBids[bid.listing_id].amount < bid.amount) {
              uniqueBids[bid.listing_id] = bid;
            }
          });
          finalData = Object.values(uniqueBids);
        } 
        else if (currentTab === 'likes') {
          const { data, error } = await supabase
            .from('likes')
            .select(`
              listing_id,
              listings (*)
            `)
            .eq('userid', user.id);

          if (error) throw error;
          finalData = data;
        } 
        else if (currentTab === 'bookmarks') {
          const { data, error } = await supabase
            .from('bookmarks')
            .select(`
              listing_id,
              listings (*)
            `)
            .eq('userid', user.id);

          if (error) throw error;
          finalData = data;
        }

        setItems(finalData || []);
      } catch (err) {
        console.error('Activity Tracking Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchActivityData();
  }, [currentTab, navigate]);

  const switchTab = (tab) => {
    navigate(`/dashboard/activity?tab=${tab}`);
  };

  const formatZAR = (amount) => {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  const filteredItems = items.filter(item => {
    const listing = item.listings;
    const searchStr = searchQuery.toLowerCase().trim();
    if (!searchStr) return true;
    return (
      listing.Make.toLowerCase().includes(searchStr) ||
      listing.Model.toLowerCase().includes(searchStr) ||
      listing.Year.toString().includes(searchStr)
    );
  });

  return (
    <DashboardLayout user={user} searchTerm={searchQuery} onSearch={setSearchQuery}>
      <div className={styles.activityContainer}>
        {/* Navigation Tabs */}
        <div className={styles.tabsHeader}>
          <button 
            className={`${styles.tabBtn} ${currentTab === 'bids' ? styles.activeTab : ''}`}
            onClick={() => switchTab('bids')}
          >
            <FaGavel /> MY BIDS
          </button>
          <button 
            className={`${styles.tabBtn} ${currentTab === 'likes' ? styles.activeTab : ''}`}
            onClick={() => switchTab('likes')}
          >
            <FaHeart /> LIKES
          </button>
          <button 
            className={`${styles.tabBtn} ${currentTab === 'bookmarks' ? styles.activeTab : ''}`}
            onClick={() => switchTab('bookmarks')}
          >
            <FaBookmark /> FOLLOWED
          </button>
        </div>

        {/* Content Section */}
        <div className={styles.contentArea}>
          {loading ? (
            <div className={styles.statusMsg}>Loading your activity...</div>
          ) : filteredItems.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>{searchQuery ? `No matches for "${searchQuery}"` : `Nothing to show in ${currentTab}`}</h3>
              <p>{searchQuery ? 'Try adjusting your search terms or check your spelling.' : 'Explore the Auction Floor to start participating!'}</p>
              {searchQuery ? (
                <button className={styles.browseBtn} onClick={() => setSearchQuery('')}>CLEAR SEARCH</button>
              ) : (
                <button className={styles.browseBtn} onClick={() => navigate('/')}>GO TO AUCTIONS</button>
              )}
            </div>
          ) : (
            <div className={styles.cardList}>
              {filteredItems.map((item, idx) => {
                const listing = item.listings;
                const userBid = item.amount;
                const isOutbid = currentTab === 'bids' && listing.CurrentPrice > userBid;

                return (
                  <div key={idx} className={styles.activityCard} onClick={() => navigate(`/listing/${listing.id}`)}>
                    <div className={styles.imgWrap}>
                      <img src={getTransformUrl(listing.ImageURL, { width: 100 })} alt={listing.Model} />
                    </div>
                    <div className={styles.cardDetails}>
                      <div className={styles.cardHeader}>
                        <span className={styles.lotNo}>LOT #{listing.id}</span>
                        <h4 className={styles.carName}>{listing.Year} {listing.Make} {listing.Model}</h4>
                      </div>
                      
                      <div className={styles.dataRow}>
                        <div className={styles.dataPoint}>
                          <span className={styles.label}>CURRENT PRICE</span>
                          <span className={styles.val}>{formatZAR(listing.CurrentPrice || listing.StartingPrice)}</span>
                        </div>
                        {currentTab === 'bids' && (
                          <div className={styles.dataPoint}>
                            <span className={styles.label}>YOUR BID</span>
                            <span className={styles.val}>{formatZAR(userBid)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className={styles.statusAction}>
                      {currentTab === 'bids' && (
                        <div className={`${styles.statusBadge} ${isOutbid ? styles.outbid : styles.leading}`}>
                          {isOutbid ? 'OUTBID' : 'LEADING'}
                        </div>
                      )}
                      <button className={styles.viewBtn}>VIEW <FaChevronRight /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ActivityTracking;
