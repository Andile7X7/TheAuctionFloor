import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../Modules/SupabaseClient';
import styles from './PersonalizedFeed.module.css';
import { FaGavel, FaHeart, FaComment, FaEye, FaFire } from 'react-icons/fa';
import UniversalHeader from '../Modules/UniversalHeader';
// ⬇️⬇️⬇️ IMPORT UTILITIES ⬇️⬇️⬇️
import { formatZAR } from '../utils/bidValidation';
import { getCurrentUser } from '../utils/authSecurity';
import { createCursorQuery, processCursorResults } from '../utils/pagination';
// ⬆️⬆️⬆️ IMPORT UTILITIES ⬆️⬆️⬆️

const ACTIVITY_PAGE_SIZE = 20;

const PersonalizedLiveFeed = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'all'; // 'all', 'bid', 'like', 'comment'

  // Refs for realtime subscription
  const subscriptionRef = useRef(null);
  const watchedIdsRef = useRef([]);

  // ⬇️⬇️⬇️ FETCH CURRENT USER ⬇️⬇️⬇️
  useEffect(() => {
    const fetchUser = async () => {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    };
    fetchUser();
  }, []);
  // ⬆️⬆️⬆️ FETCH CURRENT USER ⬆️⬆️⬆️

  // ⬇️⬇️⬇️ FETCH WATCHED LISTINGS (LIKES, BOOKMARKS, BIDS) ⬇️⬇️⬇️
  const {
    data: watchedListings,
    isLoading: watchedLoading,
    isError: watchedError,
  } = useQuery({
    queryKey: ['watched-listings', user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Parallel fetch of all user's interactions
      const [
        { data: likes },
        { data: bookmarks },
        { data: bids },
      ] = await Promise.all([
        supabase.from('likes').select('listing_id').eq('userid', user.id),
        supabase.from('bookmarks').select('listing_id').eq('userid', user.id),
        supabase.from('bid_history').select('listing_id').eq('userid', user.id),
      ]);

      // Collect unique listing IDs
      const listingIds = [
        ...new Set([
          ...(likes?.map(l => l.listing_id) || []),
          ...(bookmarks?.map(b => b.listing_id) || []),
          ...(bids?.map(b => b.listing_id) || []),
        ]),
      ].filter(Boolean);

      if (listingIds.length === 0) return [];

      // Store for subscription filtering
      watchedIdsRef.current = listingIds;

      // Fetch full listing details with current stats
      const { data: listings } = await supabase
        .from('listings')
        .select(`
          id,
          Make,
          Model,
          Year,
          CurrentPrice,
          StartingPrice,
          ImageURL,
          status,
          created_at,
          bid_history(count),
          likes(count)
        `)
        .in('id', listingIds)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      // Enrich with user's relationship to each
      const enriched = await Promise.all(
        (listings || []).map(async (listing) => {
          const [{ data: userBid }, { data: userLike }, { data: userBookmark }] = await Promise.all([
            supabase
              .from('bid_history')
              .select('amount')
              .eq('listing_id', listing.id)
              .eq('userid', user.id)
              .order('amount', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('likes')
              .select('id')
              .eq('listing_id', listing.id)
              .eq('userid', user.id)
              .maybeSingle(),
            supabase
              .from('bookmarks')
              .select('id')
              .eq('listing_id', listing.id)
              .eq('userid', user.id)
              .maybeSingle(),
          ]);

          return {
            ...listing,
            userBid: userBid?.amount || null,
            hasLiked: !!userLike,
            hasBookmarked: !!userBookmark,
            isLeading: false, // Will be updated by realtime
          };
        })
      );

      return enriched;
    },
    enabled: !!user,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
  // ⬆️⬆️⬆️ FETCH WATCHED LISTINGS ⬆️⬆️⬆️

  // ⬇️⬇️⬇️ FETCH RECENT ACTIVITY FOR WATCHED LISTINGS ⬇️⬇️⬇️
  const {
    data: activityData,
    isLoading: activityLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['personalized-activity', user?.id, activeTab],
    queryFn: async ({ pageParam = null }) => {
      if (!user || watchedIdsRef.current.length === 0) {
        return { data: [], nextCursor: null, hasMore: false };
      }

      let query = supabase
        .from('activities')
        .select(`
          *,
          listings:listing_id (
            id,
            Make,
            Model,
            Year,
            CurrentPrice,
            ImageURL
          )
        `)
        .in('listing_id', watchedIdsRef.current);

      // Filter by activity type if tab selected
      if (activeTab !== 'all') {
        query = query.eq('type', activeTab);
      }

      // Cursor pagination
      const paginatedQuery = createCursorQuery(query, {
        cursor: pageParam,
        limit: ACTIVITY_PAGE_SIZE,
        sortBy: 'created_at',
        sortDir: 'desc',
      });

      const { data: activities, error } = await paginatedQuery;
      if (error) throw error;

      return processCursorResults(activities, ACTIVITY_PAGE_SIZE);
    },
    enabled: !!user && watchedIdsRef.current.length > 0,
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 10 * 1000, // 10 seconds - "live" feel
    refetchInterval: 30 * 1000, // Poll every 30 seconds as backup
  });
  // ⬆️⬆️⬆️ FETCH RECENT ACTIVITY ⬆️⬆️⬆️

  // Flatten activity pages
  const allActivities = activityData?.pages.flatMap(page => page.data) ?? [];

  // ⬇️⬇️⬇️ REALTIME SUBSCRIPTION FOR LIVE UPDATES ⬇️⬇️⬇️
  useEffect(() => {
    if (!user || watchedIdsRef.current.length === 0) return;

    // Clean up previous subscription
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
    }

    // Create new subscription
    const channel = supabase
      .channel(`personalized-feed-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activities',
          filter: `listing_id=in.(${watchedIdsRef.current.join(',')})`,
        },
        (payload) => {
          const newActivity = payload.new;

          // Optimistic update - add to cache immediately
          queryClient.setQueryData(
            ['personalized-activity', user.id, activeTab],
            (oldData) => {
              if (!oldData) return oldData;

              const newPage = {
                data: [newActivity],
                nextCursor: null,
                hasMore: false,
              };

              // Prepend to first page, keep max 50 items
              return {
                pages: [
                  {
                    ...oldData.pages[0],
                    data: [newActivity, ...oldData.pages[0].data].slice(0, 50),
                  },
                  ...oldData.pages.slice(1),
                ],
                pageParams: oldData.pageParams,
              };
            }
          );

          // Also invalidate watched listings to refresh stats
          queryClient.invalidateQueries({
            queryKey: ['watched-listings', user.id],
            exact: false,
          });
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [user, watchedListings?.length, activeTab, queryClient]);
  // ⬆️⬆️⬆️ REALTIME SUBSCRIPTION ⬆️⬆️⬆️

  // ⬇️⬇️⬇️ INFINITE SCROLL OBSERVER ⬇️⬇️⬇️
  const observerRef = useRef();
  const lastActivityRef = useCallback((node) => {
    if (isFetchingNextPage) return;

    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage) {
        fetchNextPage();
      }
    });

    if (node) observerRef.current.observe(node);
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);
  // ⬆️⬆️⬆️ INFINITE SCROLL OBSERVER ⬆️⬆️⬆️

  // ⬇️⬇️⬇️ ACTIVITY RENDERING ⬇️⬇️⬇️
  const getActivityIcon = (type) => {
    switch (type) {
      case 'bid':
        return <FaGavel className={styles.iconBid} />;
      case 'like':
        return <FaHeart className={styles.iconLike} />;
      case 'comment':
        return <FaComment className={styles.iconComment} />;
      case 'view':
        return <FaEye className={styles.iconView} />;
      case 'hot':
        return <FaFire className={styles.iconHot} />;
      default:
        return <FaGavel />;
    }
  };

  const getActivityText = (activity) => {
    const meta = activity.metadata || {};
    const carName = `${activity.listings?.Make} ${activity.listings?.Model}`;

    switch (activity.type) {
      case 'bid':
        return (
          <>
            <strong>{meta.userName || 'Someone'}</strong> bid{' '}
            <strong>{formatZAR(meta.amount)}</strong> on your watched{' '}
            <strong>{carName}</strong>
          </>
        );
      case 'like':
        return (
          <>
            <strong>{meta.userName || 'Someone'}</strong> liked{' '}
            <strong>{carName}</strong>
          </>
        );
      case 'comment':
        return (
          <>
            <strong>{meta.userName || 'Someone'}</strong> commented on{' '}
            <strong>{carName}</strong>: "{meta.commentText?.substring(0, 50)}
            {meta.commentText?.length > 50 ? '...' : ''}"
          </>
        );
      case 'hot':
        return (
          <>
            🔥 <strong>{carName}</strong> is heating up! {meta.bidCount} bids in the last hour
          </>
        );
      default:
        return <>Activity on <strong>{carName}</strong></>;
    }
  };

  const getTimeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);

    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  };
  // ⬆️⬆️⬆️ ACTIVITY RENDERING ⬆️⬆️⬆️

  // Loading state
  if (watchedLoading) {
    return (
      <>
        <UniversalHeader />
        <div className={styles.feedContainer}>
          <div className={styles.loadingState}>
            <div className={styles.spinner}></div>
            <p>Loading your watchlist...</p>
          </div>
        </div>
      </>
    );
  }

  // Empty state - no watched listings
  if (!watchedLoading && watchedListings?.length === 0) {
    return (
      <>
        <UniversalHeader />
        <div className={styles.feedContainer}>
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>👀</div>
            <h2>Start Watching to See Activity</h2>
            <p>
              Like, bookmark, or bid on cars to track them here. You'll see live
              updates on bids, new favorites, and comments.
            </p>
            <button
              className={styles.browseBtn}
              onClick={() => navigate('/auction-floor')}
            >
              Browse Auction Floor
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <UniversalHeader />
      <div className={styles.feedContainer}>
      {/* Header */}
      <div className={styles.header}>
        <h1>Your Watchlist</h1>
        <p className={styles.subtitle}>
          Live updates on {watchedListings?.length || 0} vehicles you're tracking
        </p>
      </div>

      {/* Watched Cars Summary */}
      <div className={styles.watchedGrid}>
        {watchedListings?.slice(0, 6).map((listing) => (
          <div
            key={listing.id}
            className={styles.watchedCard}
            onClick={() => navigate(`/listing/${listing.id}`)}
          >
            <img
              src={listing.ImageURL}
              alt={`${listing.Make} ${listing.Model}`}
              className={styles.watchedImage}
              loading="lazy"
            />
            <div className={styles.watchedInfo}>
              <h4>{listing.Make} {listing.Model}</h4>
              <p className={styles.watchedPrice}>{formatZAR(listing.CurrentPrice)}</p>
              <div className={styles.watchedBadges}>
                {listing.userBid !== null && (
                  <span className={`${styles.badgeBid} ${listing.userBid >= listing.CurrentPrice ? styles.badgeLeading : styles.badgeOutbid}`}>
                    {listing.userBid >= listing.CurrentPrice ? 'Leading' : 'Outbid'} ({formatZAR(listing.userBid)})
                  </span>
                )}
                {!listing.userBid && listing.hasLiked && (
                  <span className={styles.badgeLiked}><FaHeart /> Liked</span>
                )}
                {!listing.userBid && !listing.hasLiked && listing.hasBookmarked && (
                  <span className={styles.badgeBookmarked}>🔖 Bookmarked</span>
                )}
              </div>
            </div>
          </div>
        ))}

        {watchedListings?.length > 6 && (
          <button
            className={styles.viewAllWatched}
            onClick={() => navigate('/my-watchlist')}
          >
            +{watchedListings.length - 6} more
          </button>
        )}
      </div>

      {/* Activity Feed */}
      <div className={styles.feedSection}>
        <div className={styles.feedHeader}>
          <h2>Recent Activity</h2>

          {/* Filter Tabs */}
          <div className={styles.filterTabs}>
            {[
              { key: 'all', label: 'All', icon: null },
              { key: 'bid', label: 'Bids', icon: <FaGavel /> },
              { key: 'like', label: 'Likes', icon: <FaHeart /> },
              { key: 'comment', label: 'Comments', icon: <FaComment /> },
            ].map((tab) => (
              <button
                key={tab.key}
                className={`${styles.tab} ${activeTab === tab.key ? styles.activeTab : ''}`}
                onClick={() => setSearchParams({ tab: tab.key })}
              >
                {tab.icon && <span className={styles.tabIcon}>{tab.icon}</span>}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Activity List */}
        {activityLoading ? (
          <div className={styles.loadingActivities}>
            <div className={styles.spinnerSmall}></div>
            <span>Loading activity...</span>
          </div>
        ) : allActivities.length === 0 ? (
          <div className={styles.noActivity}>
            <p>No recent activity on your watched cars.</p>
            <span>Check back soon or browse more listings!</span>
          </div>
        ) : (
          <div className={styles.activityList}>
            {allActivities.map((activity, index) => (
              <div
                key={`${activity.id}-${index}`}
                ref={index === allActivities.length - 1 ? lastActivityRef : null}
                className={`${styles.activityItem} ${styles[activity.type]}`}
                onClick={() => navigate(`/listing/${activity.listing_id}`)}
              >
                <div className={styles.activityIcon}>
                  {getActivityIcon(activity.type)}
                </div>

                <div className={styles.activityContent}>
                  <div className={styles.activityText}>
                    {getActivityText(activity)}
                  </div>
                  <div className={styles.activityMeta}>
                    <span className={styles.timeAgo}>{getTimeAgo(activity.created_at)}</span>
                    {activity.listings?.ImageURL && (
                      <img
                        src={activity.listings.ImageURL}
                        alt=""
                        className={styles.activityThumb}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isFetchingNextPage && (
              <div className={styles.loadingMore}>
                <div className={styles.spinnerSmall}></div>
                <span>Loading more...</span>
              </div>
            )}

            {!hasNextPage && allActivities.length > 0 && (
              <div className={styles.endOfFeed}>
                <span>You're all caught up!</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
};

export default PersonalizedLiveFeed;