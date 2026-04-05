import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../Modules/SupabaseClient';
import DashboardLayout from '../Modules/DashboardLayout';
import OverviewCards from '../Modules/OverviewCards';
import ActiveListings from '../Modules/ActiveListings';
import BiddingActivity from '../Modules/BiddingActivity';
import RecentNotifications from '../Modules/RecentNotifications';
import styles from './Dashboard.module.css';

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userName, setUserName] = useState('');
  const [listings, setListings] = useState([]);
  const [participatingListings, setParticipatingListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const getDashboardData = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
          navigate('/signup');
          return;
        }

        setUser(user);

        const { data: userData } = await supabase.from('users').select('firstname').eq('userid', user.id).maybeSingle();
        if (userData && userData.firstname) {
          setUserName(userData.firstname);
        } else {
          setUserName(user?.user_metadata?.firstname || user?.email?.split('@')[0] || 'Guest');
        }

        // 1. Fetch User's Own Listings (Seller)
        const { data: listingsData, error: listingsError } = await supabase
          .from('listings')
          .select('*')
          .eq('userid', user.id)
          .order('created_at', { ascending: false });

        if (listingsError) throw listingsError;
        setListings(listingsData || []);

        // 2. Fetch User's Bidding Activity (Buyer)
        const { data: myBids } = await supabase
          .from('bid_history')
          .select('listing_id')
          .eq('userid', user.id);

        if (myBids && myBids.length > 0) {
          const uniqueIds = [...new Set(myBids.map(b => b.listing_id))];

          const { data: pData } = await supabase
            .from('listings')
            .select('*')
            .in('id', uniqueIds)
            .neq('userid', user.id);

          if (pData) {
            const enriched = await Promise.all(pData.map(async (l) => {
              const { data: topBid } = await supabase
                .from('bid_history')
                .select('userid')
                .eq('listing_id', l.id)
                .order('amount', { ascending: false })
                .limit(1)
                .maybeSingle();

              return {
                ...l,
                isLeading: topBid?.userid === user.id
              };
            }));
            setParticipatingListings(enriched);
          }
        }

      } catch (err) {
        console.error('Error loading dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    getDashboardData();
  }, [navigate]);

  // 3. Realtime Bidding Status Updates
  useEffect(() => {
    if (!user || participatingListings.length === 0) return;

    const channel = supabase
      .channel('dashboard_bidding_activity')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bid_history'
      }, async (payload) => {
        const { listing_id, userid } = payload.new;

        setParticipatingListings(prev => prev.map(item => {
          if (item.id === listing_id) {
            return {
              ...item,
              isLeading: userid === user.id
            };
          }
          return item;
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, participatingListings.length]);

  // FILTER BOTH LISTS based on search term
  const searchStr = searchTerm.toLowerCase().trim();

  const filteredListings = searchStr
    ? listings.filter(item =>
      item.Make.toLowerCase().includes(searchStr) ||
      item.Model.toLowerCase().includes(searchStr) ||
      item.Year.toString().includes(searchStr)
    )
    : listings;

  const filteredParticipating = searchStr
    ? participatingListings.filter(item =>
      item.Make.toLowerCase().includes(searchStr) ||
      item.Model.toLowerCase().includes(searchStr) ||
      item.Year.toString().includes(searchStr)
    )
    : participatingListings;

  // Determine what to show
  const isSearching = searchStr.length > 0;
  const totalResults = filteredListings.length + filteredParticipating.length;
  const hasResults = totalResults > 0;

  if (loading) {
    return (
      <DashboardLayout user={user} searchTerm={searchTerm} onSearch={setSearchTerm}>
        <div className={styles.loadingContainer}>
          <p>Loading your overview...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout user={user} searchTerm={searchTerm} onSearch={setSearchTerm}>
      <div className={styles.dashboardRoot}>
        <div className={styles.titleArea}>
          <div>
            <h1 className={styles.pageTitle}>
              Welcome back, {userName}!
            </h1>
            <p className={styles.pageSubtitle}>
              Here's what's happening with your inventory and bids today.
            </p>
          </div>
        </div>

        {/* Show OverviewCards only when NOT searching, OR show result summary when searching */}
        {!isSearching ? (
          <OverviewCards listings={listings} participating={participatingListings} />
        ) : (
          <div className={styles.searchSummary}>
            <div className={styles.searchResultInfo}>
              <span className={styles.resultCount}>{totalResults}</span>
              <span className={styles.resultText}>result{totalResults !== 1 ? 's' : ''} for "</span>
              <span className={styles.searchQuery}>{searchTerm}</span>
              <span className={styles.resultText}>"</span>
            </div>
            <button
              className={styles.clearSearchBtn}
              onClick={() => setSearchTerm('')}
            >
              Clear search
            </button>
          </div>
        )}

        <div className={styles.middleSection}>
          <div className={styles.mainContentCol}>
            {/* Show bidding activity only if not searching OR if there are participating results */}
            {(!isSearching || filteredParticipating.length > 0) && (
              <BiddingActivity
                listings={filteredParticipating}
                isFiltered={isSearching}
              />
            )}

            {/* Show active listings only if not searching OR if there are listing results */}
            {(!isSearching || filteredListings.length > 0) && (
              <ActiveListings
                listings={filteredListings}
                isFiltered={isSearching}
              />
            )}

            {/* Empty state when searching but no results */}
            {isSearching && !hasResults && (
              <div className={styles.emptySearchState}>
                <div className={styles.emptyIcon}>🔍</div>
                <h3>No vehicles match "{searchTerm}"</h3>
                <p>Try adjusting your search terms or check your spelling.</p>
                <button
                  className={styles.clearSearchBtn}
                  onClick={() => setSearchTerm('')}
                >
                  Clear search
                </button>
              </div>
            )}
          </div>

          {/* Hide notifications when searching to focus on results */}
          {!isSearching && <RecentNotifications />}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default Dashboard;