import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FaPlusCircle } from 'react-icons/fa';
import { supabase } from '../Modules/SupabaseClient';
import { apiClient } from '../utils/apiClient';
import DashboardLayout from '../Modules/DashboardLayout';
import OverviewCards from '../Modules/OverviewCards';
import ActiveListings from '../Modules/ActiveListings';
import BiddingActivity from '../Modules/BiddingActivity';
import RecentNotifications from '../Modules/RecentNotifications';
import styles from './Dashboard.module.css';
import { getTransformUrl } from '../utils/imageCompression';
import { getCurrentUser, sanitizeUserData } from '../utils/authSecurity';

function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [userName, setUserName] = useState('');
  const [listings, setListings] = useState([]);
  const [pendingListings, setPendingListings] = useState([]);
  const [rejectedListings, setRejectedListings] = useState([]);
  const [participatingListings, setParticipatingListings] = useState([]);
  const [failedAuctions, setFailedAuctions] = useState([]);
  const [relistListingId, setRelistListingId] = useState(null);
  const [newReservePrice, setNewReservePrice] = useState('');
  const [relistError, setRelistError] = useState('');
  const [isRelisting, setIsRelisting] = useState(false);
  const [appealListing, setAppealListing] = useState(null);
  const [appealReason, setAppealReason] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // ⬇️⬇️⬇️ SECURE DATA FETCHING WITH AUTH CHECK ⬇️⬇️⬇️
  const getDashboardData = useCallback(async () => {
    try {
      // Use secure user getter instead of direct supabase.auth.getUser()
      const user = await getCurrentUser();
      
      if (!user) {
        navigate('/signup');
        return;
      }

      // Sanitize user data before storing
      const safeUser = sanitizeUserData(user);
      setUser(safeUser);

      // Fetch user profile with sanitized ID
      const { data: userData } = await supabase
        .from('users')
        .select('firstname')
        .eq('userid', safeUser.id)
        .maybeSingle();
      
      if (userData && userData.firstname) {
        setUserName(userData.firstname);
      } else {
        setUserName(safeUser.user_metadata?.firstname || safeUser.email?.split('@')[0] || 'Guest');
      }

      // 1. Fetch User's Own Listings (Seller) - with RLS-safe query
      const { data: listingsData, error: listingsError } = await supabase
        .from('listings')
        .select('*')
        .eq('userid', safeUser.id)
        .order('created_at', { ascending: false });

      if (listingsError) throw listingsError;
      
      // Separate listings into states
      const now = new Date();
      const activeOrSold = [];
      const pending = [];
      const rejected = [];
      const failed = [];
      
      (listingsData || []).forEach(L => {
        if (!L.verified) {
          if (L.status === 'removed') {
            rejected.push(L);
          } else {
            pending.push(L);
          }
        } else if (L.closes_at && new Date(L.closes_at) <= now && L.CurrentPrice < L.ReservePrice && L.status !== 'sold') {
          failed.push(L);
        } else {
          activeOrSold.push(L);
        }
      });
      
      setListings(activeOrSold);
      setPendingListings(pending);
      
      // Fetch appeals for rejected listings to prevent multiple appeals
      let finalRejected = rejected;
      if (rejected.length > 0) {
        const rejectedIds = rejected.map(r => r.id);
        const { data: appealsData } = await supabase.from('listing_appeals').select('*').in('listing_id', rejectedIds);
        if (appealsData) {
          finalRejected = rejected.map(r => ({
            ...r,
            existingAppeal: appealsData.find(a => a.listing_id === r.id)
          }));
        }
      }
      
      setRejectedListings(finalRejected);
      setFailedAuctions(failed);

      // 2. Fetch User's Bidding Activity (Buyer)
      const { data: myBids } = await supabase
        .from('bid_history')
        .select('listing_id')
        .eq('userid', safeUser.id);

      if (myBids && myBids.length > 0) {
        const uniqueIds = [...new Set(myBids.map(b => b.listing_id))];

        const { data: pData } = await supabase
          .from('listings')
          .select('*')
          .in('id', uniqueIds)
          .neq('userid', safeUser.id);

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
              isLeading: topBid?.userid === safeUser.id
            };
          }));
          setParticipatingListings(enriched);
        }
      }

    } catch (err) {
      console.error('Error loading dashboard:', err);
      // If auth error, redirect to signup
      if (err.message?.includes('Authentication required')) {
        navigate('/signup');
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);
  // ⬆️⬆️⬆️ SECURE DATA FETCHING WITH AUTH CHECK ⬆️⬆️⬆️

  useEffect(() => {
    getDashboardData();
  }, [getDashboardData]);

  // Poll every 15s instead of a persistent WebSocket — dashboard bid status
  // doesn't need sub-second latency and a global bid_history channel isn't
  // user-scoped, so it can't be safely shared without client-side filtering.
  useEffect(() => {
    if (!user || participatingListings.length === 0) return;
    const interval = setInterval(() => getDashboardData(), 15_000);
    return () => clearInterval(interval);
  }, [user, participatingListings.length, getDashboardData]);

  const handleRelistSubmit = async () => {
    setRelistError('');
    setIsRelisting(true);
    const priceNum = parseFloat(newReservePrice);
    if (isNaN(priceNum) || priceNum <= 5000) {
      setRelistError('Reserve must be at least R5000.');
      setIsRelisting(false);
      return;
    }
    
    // Find the original listing to see what its StartingPrice was, or just reset to 5000
    try {
      const closingDate = new Date();
      closingDate.setDate(closingDate.getDate() + 7);
      
      const { error } = await supabase.from('listings').update({
        ReservePrice: priceNum,
        CurrentPrice: 5000,
        closes_at: closingDate.toISOString()
      }).eq('id', relistListingId);

      if (error) throw error;
      
      // Resync
      getDashboardData();
      setRelistListingId(null);
      setNewReservePrice('');
    } catch(err) {
      setRelistError(err.message);
    } finally {
      setIsRelisting(false);
    }
  };

  // FILTER BOTH LISTS based on search term - with input sanitization
  const searchStr = searchTerm.toLowerCase().trim();

  // ⬇️⬇️⬇️ SANITIZED SEARCH FILTERING ⬇️⬇️⬇️
  const filteredListings = searchStr
    ? listings.filter(item => {
        // Safe string comparison with null checks
        const make = (item.Make || '').toLowerCase();
        const model = (item.Model || '').toLowerCase();
        const year = (item.Year || '').toString();
        
        return make.includes(searchStr) ||
               model.includes(searchStr) ||
               year.includes(searchStr);
      })
    : listings;

  const filteredParticipating = searchStr
    ? participatingListings.filter(item => {
        // Safe string comparison with null checks
        const make = (item.Make || '').toLowerCase();
        const model = (item.Model || '').toLowerCase();
        const year = (item.Year || '').toString();
        
        return make.includes(searchStr) ||
               model.includes(searchStr) ||
               year.includes(searchStr);
      })
    : participatingListings;
  // ⬆️⬆️⬆️ SANITIZED SEARCH FILTERING ⬆️⬆️⬆️

  // Determine what to show
  const isSearching = searchStr.length > 0;
  const totalResults = filteredListings.length + filteredParticipating.length;
  const hasResults = totalResults > 0;
  const showPendingToast = location.state?.listingStatus === 'pending';

  const submitAppeal = async () => {
    if (!appealReason.trim()) return;
    setSubmittingAppeal(true);
    
    try {
      const response = await apiClient.post('/handle-content', {
        action: 'file-appeal',
        payload: {
          listingId: appealListing.id,
          reason: appealReason
        }
      });

      if (response.error) throw new Error(response.error);

      setAppealListing(null);
      setAppealReason('');
      alert("Your appeal has been submitted successfully. Moderation will review it shortly.");
      
    } catch (err) {
      console.error('Appeal error:', err);
      alert(err.message || "Failed to submit appeal. Please try again.");
    } finally {
      setSubmittingAppeal(false);
    }
  };

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
          <button
            onClick={() => navigate('/add-listing')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '14px 24px',
              fontSize: '14px',
              fontWeight: '700',
              cursor: 'pointer',
              letterSpacing: '0.5px',
              boxShadow: '0 4px 20px rgba(99,102,241,0.45)',
              transition: 'transform 0.2s, box-shadow 0.2s',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(99,102,241,0.65)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,0.45)'; }}
          >
            <FaPlusCircle style={{ fontSize: '16px' }} />
            List a Vehicle
          </button>
        </div>

        {/* --- Pending Submission Toast --- */}
        {showPendingToast && !isSearching && (
          <div style={{ padding: '0 32px', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid #FBCFE8', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>⏳</span>
              <div>
                <h4 style={{ margin: 0, color: '#FCD34D', fontSize: '14px' }}>Listing Submitted Successfully</h4>
                <p style={{ margin: '2px 0 0', color: '#D1D5DB', fontSize: '13px' }}>Your new listing is currently under review by our moderation team. You will receive a notification once it is verified and live on the auction floor.</p>
              </div>
            </div>
          </div>
        )}

        {/* --- Pending Review List --- */}
        {!isSearching && pendingListings.length > 0 && (
          <div style={{ padding: '0 32px', marginBottom: '16px' }}>
            <h3 style={{ color: '#FCD34D', fontSize: '16px', marginTop: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#FCD34D'}}></div>Pending Moderation ({pendingListings.length})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {pendingListings.map(L => (
                 <div key={L.id} style={{ background: '#1F2937', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '8px', border: '1px solid #374151' }}>
                    <img src={getTransformUrl(L.ImageURL, { width: 80, height: 50 })} alt={L.Model} style={{ width: '60px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                       <div style={{ fontWeight: 600, color: '#F9FAFB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{L.Year} {L.Make} {L.Model}</div>
                       <div style={{ fontSize: '12px', color: '#9CA3AF' }}>Submitted {new Date(L.created_at).toLocaleDateString()}</div>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#FCD34D', background: 'rgba(251,191,36,0.1)', padding: '4px 8px', borderRadius: '4px' }}>Reviewing</div>
                 </div>
              ))}
            </div>
          </div>
        )}

        {/* --- Rejected List / Appeals --- */}
        {!isSearching && rejectedListings.length > 0 && (
          <div style={{ padding: '0 32px', marginBottom: '24px' }}>
             <h3 style={{ color: '#EF4444', fontSize: '16px', marginTop: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><FaPlusCircle style={{transform:'rotate(45deg)'}}/> Moderation Action Required ({rejectedListings.length})</h3>
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
              {rejectedListings.map(L => (
                 <div key={L.id} style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <img src={getTransformUrl(L.ImageURL, { width: 100, height: 60 })} alt={L.Model} style={{ width: '80px', height: '50px', objectFit: 'cover', borderRadius: '4px' }} />
                      <div style={{ flex: 1 }}>
                         <div style={{ fontWeight: 600, color: '#F9FAFB', fontSize: '15px' }}>{L.Year} {L.Make} {L.Model}</div>
                         <div style={{ fontSize: '13px', color: '#EF4444', marginTop: '2px', fontWeight: 500 }}>Rejected by Moderation</div>
                         {L.admin_note && <div style={{ fontSize: '12px', color: '#D1D5DB', marginTop: '4px', fontStyle: 'italic' }}>"{L.admin_note}"</div>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                       <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Deletes automatically in 48h unless appealed.</div>
                       {L.existingAppeal ? (
                         <div style={{ fontSize: '12px', fontWeight: 600, color: L.existingAppeal.status === 'denied' ? '#EF4444' : '#FCD34D' }}>
                           {L.existingAppeal.status === 'denied' ? 'Appeal Denied - Deleting Soon' : 'Appeal Pending'}
                         </div>
                       ) : (
                         <button 
                           onClick={() => setAppealListing(L)}
                           style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                         >
                           File Appeal
                         </button>
                       )}
                    </div>
                 </div>
              ))}
            </div>
          </div>
        )}

        {/* --- Failed Auctions Banner --- */}
        {!isSearching && failedAuctions.length > 0 && (
          <div style={{ padding: '0 32px', marginBottom: '24px' }}>
            {failedAuctions.map(listing => (
              <div key={listing.id} style={{
                background: 'rgba(239, 68, 68, 0.1)', 
                border: '1px solid #EF4444', 
                padding: '16px', 
                borderRadius: '8px', 
                marginBottom: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <h4 style={{ margin: 0, color: '#EF4444' }}>Auction Concluded: Reserve Not Met</h4>
                  <p style={{ margin: '4px 0 0', color: '#E5E7EB', fontSize: '14px' }}>Your {listing.Make} {listing.Model} closed at R{listing.CurrentPrice?.toLocaleString()} which is below your reserve.</p>
                </div>
                <button 
                  onClick={() => setRelistListingId(listing.id)}
                  style={{ background: '#EF4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Relist Item
                </button>
              </div>
            ))}
          </div>
        )}

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

      {/* Relist Modal */}
      {relistListingId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#1F2937', padding: '32px', borderRadius: '12px', width: '400px', maxWidth: '90%' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '20px', color: '#fff' }}>Relist Vehicle</h2>
            <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#9CA3AF' }}>Set a new lower reserve price to encourage bidding. The listing will reopen at R5,000 for 7 days.</p>
            
            <label style={{ display: 'block', fontSize: '12px', color: '#9CA3AF', marginBottom: '8px' }}>New Reserve Price (ZAR)</label>
            <input 
              type="number" 
              value={newReservePrice}
              onChange={(e) => setNewReservePrice(e.target.value)}
              placeholder="e.g. 500000"
              style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #374151', background: '#111827', color: '#fff', marginBottom: '16px' }}
            />
            
            {relistError && <div style={{ color: '#EF4444', fontSize: '13px', marginBottom: '16px' }}>{relistError}</div>}
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setRelistListingId(null)}
                style={{ padding: '8px 16px', background: 'transparent', color: '#9CA3AF', border: 'none', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleRelistSubmit}
                disabled={isRelisting}
                style={{ padding: '8px 16px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                {isRelisting ? 'Relisting...' : 'Confirm Relist'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Appeal Modal */}
      {appealListing && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#1F2937', padding: '32px', borderRadius: '12px', width: '450px', maxWidth: '90%', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 style={{ margin: '0 0 12px', fontSize: '20px', color: '#EF4444' }}>Appeal Listing Rejection</h2>
            <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#9CA3AF', lineHeight: 1.5 }}>
              You are appealing the moderation decision for your <strong>{appealListing.Make} {appealListing.Model}</strong>. If you believe this was an error, or if you have resolved the issue (e.g. corrected the VIN or lowered the price), please explain below.
            </p>
            
            <textarea 
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              placeholder="Explain why this listing should be approved..."
              rows={4}
              style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #374151', background: '#111827', color: '#fff', marginBottom: '20px', resize: 'vertical', boxSizing: 'border-box' }}
            />
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => { setAppealListing(null); setAppealReason(''); }}
                style={{ background: 'transparent', color: '#9CA3AF', border: '1px solid #374151', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button 
                onClick={submitAppeal}
                disabled={submittingAppeal || !appealReason.trim()}
                style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, opacity: (submittingAppeal || !appealReason.trim()) ? 0.5 : 1 }}
              >
                {submittingAppeal ? 'Submitting...' : 'Submit Appeal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default Dashboard;