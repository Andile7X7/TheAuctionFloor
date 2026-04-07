import React, { 
  useState, 
  useEffect, 
  useRef, 
  useCallback, 
  useMemo,
  memo
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../Modules/SupabaseClient';
import styles from './ListingDetail.module.css';
import UniversalHeader from '../Modules/UniversalHeader';
import { 
  FaBookmark, 
  FaShareAlt, 
  FaShieldAlt, 
  FaFire, 
  FaTimes, 
  FaChevronLeft, 
  FaChevronRight, 
  FaArrowLeft, 
  FaChevronDown, 
  FaChevronUp 
} from 'react-icons/fa';
import AuthPromptModal from '../Modules/AuthPromptModal';
import LoadingScreen from '../Modules/LoadingScreen';
import BidConfirmToast from '../Modules/BidConfirmToast';
import BidConfirmModal from '../Modules/BidConfirmModal';
import UserAvatar from '../Modules/UserAvatar';
import { 
  sanitizeBidAmount, 
  checkBidRateLimit,
  getDynamicMinBid,
  formatZAR 
} from '../utils/bidValidation';
import { sanitizeContent } from '../utils/contentSanitizer';
import { useListingDetail } from '../hooks/useListingDetail';
import { apiClient } from '../utils/apiClient';
import ReportModal from '../Modules/ReportModal';
import CountdownTimer from '../Modules/CountdownTimer';

// ==========================================
// OPTIMIZED COMMENT NODE - Memoized
// ==========================================
const CommentNode = memo(({ 
  comment, 
  handleReply, 
  handleLike, 
  handleDelete, 
  currentUserId, 
  listingOwnerId, 
  styles 
}) => {
  const hasLiked = comment.likes?.includes(currentUserId);
  
  return (
    <div className={styles.comment}>
      <UserAvatar 
        name={comment.firstname} 
        src={comment.avatar_url} 
        bgColor={comment.avatar_bg} 
        size={36} 
        style={{ marginRight: '16px' }} 
      />
      <div className={styles.commentBody}>
        <div className={styles.commentTop}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className={styles.commentAuthor}>{comment.firstname}</span>
            {comment.userid === listingOwnerId && (
              <span className={styles.sellerBadge}>Seller</span>
            )}
          </div>
          <span className={styles.commentTime}>
            {new Date(comment.created_at).toLocaleDateString()}
          </span>
        </div>
        <div className={styles.commentText}>{comment.content}</div>
        <div className={styles.commentActions}>
          <button 
            className={`${styles.replyBtn} ${hasLiked ? styles.heatActiveSmall : ''}`} 
            onClick={() => handleLike(comment)}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <FaFire style={{ color: hasLiked ? '#ffb480' : 'inherit' }} /> 
            {comment.likes?.length > 0 ? comment.likes.length : 'HEAT'}
          </button>
          <button 
            className={styles.replyBtn} 
            onClick={() => handleReply(comment)}
          >
            REPLY
          </button>
          {comment.userid === currentUserId && (
            <button 
              className={styles.replyBtn} 
              onClick={() => handleDelete(comment.id)} 
              style={{ color: '#EF4444' }}
            >
              DELETE
            </button>
          )}
        </div>
        
        {comment.replies?.length > 0 && (
          <div className={styles.repliesContainer}>
            {comment.replies.map(reply => (
              <CommentNode 
                key={reply.id} 
                comment={reply} 
                handleReply={handleReply} 
                handleLike={handleLike} 
                handleDelete={handleDelete} 
                currentUserId={currentUserId} 
                listingOwnerId={listingOwnerId} 
                styles={styles} 
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.comment.id === nextProps.comment.id &&
    prevProps.comment.likes?.length === nextProps.comment.likes?.length &&
    prevProps.comment.content === nextProps.comment.content &&
    prevProps.currentUserId === nextProps.currentUserId &&
    prevProps.listingOwnerId === nextProps.listingOwnerId
  );
});

// ==========================================
// LISTING DETAIL COMPONENT
// ==========================================
const ListingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const commentInputRef = useRef(null);
  const commentsSectionRef = useRef(null);
  
  // ==========================================
  // ALL STATE HOOKS FIRST - No conditions, no returns before this
  // ==========================================
  
  const [user, setUser] = useState(null);
  const [currentUserName, setCurrentUserName] = useState('');
  const [userLoading, setUserLoading] = useState(true);
  
  // Data fetching hook
  const { 
    data: detail, 
    isLoading: detailLoading, 
    error: detailError, 
    mutate: refreshDetail 
  } = useListingDetail(id, user?.id);
  
  // UI state
  const [bidAmount, setBidAmount] = useState('');
  const [bidding, setBidding] = useState(false);
  const [bidError, setBidError] = useState('');
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [heatCount, setHeatCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [comments, setComments] = useState([]);
  const [bidHistory, setBidHistory] = useState([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [timeRemainingObj, setTimeRemainingObj] = useState(null);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  
  // Modal state
  const [authPrompt, setAuthPrompt] = useState({ visible: false, message: '' });
  const [bidConfirm, setBidConfirm] = useState(null);
  const [showBidModal, setShowBidModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showReport, setShowReport] = useState(false);
  
  // Comment state
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [isPostingComment, setIsPostingComment] = useState(false);
  
  // Constants
  const VISIBLE_COMMENTS = 3;
  
  // ==========================================
  // DERIVED VALUES - After all state hooks
  // ==========================================
  
  const listing = detail?.listing || null;
  const isOwner = user?.id && listing?.userid && user.id === listing.userid;
  
  // ==========================================
  // IMAGE GALLERY - All image-related hooks together
  // ==========================================
  
  const allImages = useMemo(() => {
    if (!listing) return [];
    return [
      listing.ImageURL, 
      listing.image2url, 
      listing.image3url, 
      listing.image4url,
      listing.image5url, 
      listing.image6url, 
      listing.image7url
    ].filter(Boolean);
  }, [listing]);
  
  const imageCount = allImages.length;
  
  // Reset image index when listing changes
  useEffect(() => {
    setActiveImageIndex(0);
  }, [listing?.id]);
  
  const currentImageNum = imageCount > 0 ? activeImageIndex + 1 : 0;
  const currentImage = allImages[activeImageIndex] || null;
  
  // ==========================================
  // CALLBACKS - After all hooks they depend on
  // ==========================================
  
  const goToPrev = useCallback(() => {
    setActiveImageIndex(i => {
      if (imageCount === 0) return 0;
      return (i - 1 + imageCount) % imageCount;
    });
  }, [imageCount]);
  
  const goToNext = useCallback(() => {
    setActiveImageIndex(i => {
      if (imageCount === 0) return 0;
      return (i + 1) % imageCount;
    });
  }, [imageCount]);
  
  const showAuthPrompt = useCallback((message) => {
    setAuthPrompt({ visible: true, message });
  }, []);
  
  const closeAuthPrompt = useCallback(() => {
    setAuthPrompt({ visible: false, message: '' });
  }, []);
  
  const formatZARLocal = useCallback((amount) => {
    return new Intl.NumberFormat('en-ZA', { 
      style: 'currency', 
      currency: 'ZAR', 
      maximumFractionDigits: 0 
    }).format(amount || 0);
  }, []);
  
  // ==========================================
  // USER FETCHING EFFECT
  // ==========================================
  
  useEffect(() => {
    let mounted = true;
    
    const fetchUser = async () => {
      try {
        const { data: { user: authUser }, error } = await supabase.auth.getUser();
        
        if (error || !authUser || !mounted) {
          if (mounted) setUserLoading(false);
          return;
        }
        
        const profilePromise = supabase
          .from('users')
          .select('firstname, lastname')
          .eq('userid', authUser.id)
          .maybeSingle();
          
        const [profileResult] = await Promise.all([profilePromise]);
        
        if (!mounted) return;
        
        const profileData = profileResult.data;
        const displayName = profileData 
          ? `${profileData.firstname || ''} ${profileData.lastname || ''}`.trim() 
          : authUser.email?.split('@')[0] || 'Someone';
          
        setUser(authUser);
        setCurrentUserName(displayName);
      } catch (err) {
        console.error('User fetch error:', err);
      } finally {
        if (mounted) setUserLoading(false);
      }
    };
    
    fetchUser();
    
    return () => { mounted = false; };
  }, []);
  
  // ==========================================
  // DATA SYNC EFFECT
  // ==========================================
  
  useEffect(() => {
    if (!detail) return;
    
    setHeatCount(detail.likes_count || 0);
    setIsLiked(detail.is_liked || false);
    setIsBookmarked(detail.is_bookmarked || false);
    setComments(detail.comments || []);
    setBidHistory(detail.bid_history || []);
    
    if (listing) {
      const dynamicInc = getDynamicMinBid(listing.CurrentPrice || listing.StartingPrice || 0);
      const nextIncrement = (listing.CurrentPrice || listing.StartingPrice || 0) + dynamicInc;
      setBidAmount(nextIncrement.toString());
    }
  }, [detail, listing]);
  
  // ==========================================
  // COMMENT TREE MEMO
  // ==========================================
  
  const processedComments = useMemo(() => {
    if (!comments?.length) return [];
    
    const commentMap = new Map();
    const rootComments = [];
    
    for (const c of comments) {
      commentMap.set(c.id, { ...c, replies: [] });
    }
    
    for (const c of comments) {
      const node = commentMap.get(c.id);
      if (c.parent_id && commentMap.has(c.parent_id)) {
        commentMap.get(c.parent_id).replies.push(node);
      } else {
        rootComments.push(node);
      }
    }
    
    rootComments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return rootComments;
  }, [comments]);
  
  const visibleComments = useMemo(() => 
    commentsExpanded 
      ? processedComments 
      : processedComments.slice(0, VISIBLE_COMMENTS),
    [processedComments, commentsExpanded]
  );
  
  const hiddenCount = processedComments.length - VISIBLE_COMMENTS;
  
  // ==========================================
  // REALTIME SUBSCRIPTIONS
  // ==========================================
  
  useEffect(() => {
    if (!id) return;
    
    const channel = supabase
      .channel(`listing:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'listings',
          filter: `id=eq.${id}`,
        },
        () => refreshDetail()
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bid_history',
          filter: `listing_id=eq.${id}`,
        },
        (payload) => {
          if (payload.new) {
            setBidHistory(prev => {
              if (prev.some(b => b.id === payload.new.id)) return prev;
              return [payload.new, ...prev].slice(0, 50);
            });
          }
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, refreshDetail]);
  
  // ==========================================
  // COUNTDOWN TIMER
  // ==========================================
  
  useEffect(() => {
    if (!listing?.closes_at) return;
    
    const calculateTime = () => {
      const diff = new Date(listing.closes_at) - new Date();
      
      if (diff <= 0) return { closed: true };
      
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);
      
      return {
        closed: false,
        d,
  // Keep timeRemainingObj state for isClosed check, but countdown timer is handled by separate component
  // CountdownTimer handles its own interval - this state is only for initial closed status
  
  // ==========================================
  // ACTION HANDLERS
  // ==========================================
  
  const toggleBookmark = useCallback(async () => {
    if (!user) {
      showAuthPrompt('Log in to save this vehicle to your watchlist.');
      return;
    }
    
    const listingId = Number(id);
    const previousState = isBookmarked;
    
    setIsBookmarked(!previousState);
    
    try {
      if (previousState) {
        const { error } = await supabase
          .from('bookmarks')
          .delete()
          .eq('listing_id', listingId)
          .eq('userid', user.id);
          
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('bookmarks')
          .insert({ listing_id: listingId, userid: user.id });
          
        if (error) throw error;
        sendNotification('bookmark', `followed your ${listing.Year} ${listing.Make} ${listing.Model}`);
      }
    } catch (err) {
      setIsBookmarked(previousState);
      console.error('Bookmark error:', err);
      alert(previousState ? 'Could not remove bookmark' : 'Could not save bookmark');
    }
  }, [user, id, isBookmarked, listing, currentUserName, showAuthPrompt]);
  
  const toggleHeat = useCallback(async () => {
    if (!user) {
      showAuthPrompt('Log in to show some heat on this listing.');
      return;
    }
    
    const listingId = Number(id);
    const previousLiked = isLiked;
    const previousCount = heatCount;
    
    setIsLiked(!previousLiked);
    setHeatCount(previousLiked ? Math.max(0, previousCount - 1) : previousCount + 1);
    
    try {
      if (previousLiked) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('listing_id', listingId)
          .eq('userid', user.id);
          
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('likes')
          .insert({ listing_id: listingId, userid: user.id });
          
        if (error) throw error;
        
        Promise.all([
          supabase.from('activities').insert({
            userid: user.id,
            type: 'like',
            listing_id: listingId,
            entitytype: 'car',
            metadata: { 
              userName: currentUserName, 
              carName: `${listing.Make} ${listing.Model}` 
            }
          }),
          sendNotification('like', `liked your ${listing.Year} ${listing.Make} ${listing.Model}`)
        ]).catch(console.error);
      }
    } catch (err) {
      setIsLiked(previousLiked);
      setHeatCount(previousCount);
      console.error('Heat error:', err);
      alert('Could not update heat');
    }
  }, [user, id, isLiked, heatCount, listing, currentUserName, showAuthPrompt]);
  
  const sendNotification = useCallback(async (type, message) => {
    if (!listing?.userid || !user || listing.userid === user.id) return;
    
    try {
      await supabase.from('notifications').insert({
        recipient_id: listing.userid,
        actor_id: user.id,
        listing_id: Number(id),
        type,
        message: `${currentUserName} ${message}`,
        is_read: false
      });
    } catch (err) {
      console.error('Notification error:', err);
    }
  }, [listing?.userid, user, id, currentUserName]);
  
  const handleCommentLike = useCallback(async (comment) => {
    if (!user) {
      showAuthPrompt('Log in to show heat on comments.');
      return;
    }
    
    const hasLiked = comment.likes?.includes(user.id);
    const commentId = comment.id;
    
    setComments(prev => prev.map(c => {
      if (c.id !== commentId) return c;
      
      const newLikes = hasLiked
        ? (c.likes || []).filter(uid => uid !== user.id)
        : [...(c.likes || []), user.id];
        
      return { ...c, likes: newLikes };
    }));
    
    try {
      if (hasLiked) {
        await supabase
          .from('comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('userid', user.id);
      } else {
        await supabase.from('comment_likes').insert({ 
          comment_id: commentId, 
          userid: user.id, 
          listing_id: Number(id) 
        });
        
        if (comment.userid !== user.id) {
          const snippet = comment.content.substring(0, 30) + (comment.content.length > 30 ? '...' : '');
          
          supabase.from('notifications').insert({
            recipient_id: comment.userid,
            actor_id: user.id,
            listing_id: Number(id),
            type: 'like',
            message: `${currentUserName} showed some heat on your comment: "${snippet}"`,
            is_read: false
          }).catch(console.error);
        }
      }
    } catch (err) {
      setComments(prev => prev.map(c => {
        if (c.id !== commentId) return c;
        const revertedLikes = hasLiked
          ? [...(c.likes || []), user.id]
          : (c.likes || []).filter(uid => uid !== user.id);
        return { ...c, likes: revertedLikes };
      }));
      console.error('Comment like error:', err);
    }
  }, [user, id, currentUserName, showAuthPrompt]);
  
  const postComment = useCallback(async () => {
    if (!user) {
      showAuthPrompt('Log in to join the discussion on this vehicle.');
      return;
    }
    if (!newComment.trim() || isPostingComment) return;
    
    setIsPostingComment(true);

    try {
      const response = await apiClient.post('/handle-content', {
        action: 'post-comment',
        payload: {
          listingId: Number(id),
          content: newComment,
          parentId: replyingTo?.id || null
        }
      });

      if (response.error) throw new Error(response.error);

      const { comment } = response;
      comment.firstname = currentUserName;
      comment.likes = [];
      comment.replies = [];

      setComments(prev => [comment, ...prev]);
      setNewComment('');
      setReplyingTo(null);
      
    } catch (err) {
      console.error('Comment post error:', err);
      alert(err.message || 'Failed to post comment');
    } finally {
      setIsPostingComment(false);
    }
  }, [user, id, newComment, isPostingComment, replyingTo, currentUserName, showAuthPrompt]);
  
  const handleDeleteComment = useCallback(async (commentId) => {
    const previousComments = comments;
    
    setComments(prev => prev.filter(c => c.id !== commentId));
    
    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);
        
      if (error) throw error;
    } catch (err) {
      setComments(previousComments);
      console.error('Delete failed:', err);
      alert('Could not delete comment');
    }
  }, [comments]);
  
  const handleReplyClick = useCallback((comment) => {
    setReplyingTo(comment);
    requestAnimationFrame(() => {
      commentInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        const textarea = commentInputRef.current?.querySelector('textarea');
        textarea?.focus();
      }, 350);
    });
  }, []);
  
  const handleBidInput = useCallback((e) => {
    const rawValue = e.target.value;
    const cleaned = rawValue
      .replace(/[^\d.]/g, '')
      .replace(/(\..*)\./g, '$1')
      .replace(/^0+(?=\d)/, '');
      
    setBidAmount(cleaned);
    if (bidError) setBidError('');
  }, [bidError]);
  
  const handlePlaceBid = useCallback(() => {
    setBidError('');
    
    if (!user) {
      showAuthPrompt('You need to be logged in to place a bid on this vehicle.');
      return;
    }
    if (isOwner) {
      setBidError('You cannot bid on your own listing.');
      return;
    }
    if (timeRemainingObj?.closed) {
      setBidError('Auction has closed.');
      return;
    }
    
    const currentHighest = listing?.CurrentPrice || listing?.StartingPrice || 0;
    const validation = sanitizeBidAmount(bidAmount, currentHighest);
    
    if (!validation.valid) {
      setBidError(validation.error);
      return;
    }
    
    setBidError('');
    setShowBidModal(true);
  }, [user, isOwner, timeRemainingObj, listing, bidAmount, showAuthPrompt]);
  
  const submitBid = useCallback(async () => {
    setShowBidModal(false);
    setBidding(true);
    setBidError('');
    
    const proposedBid = parseFloat(bidAmount);
    const previousPrice = listing?.CurrentPrice;
    
    try {
      // 1. Call the Secure API for the bidding transaction
      const response = await apiClient.post('/place-bid', {
        p_listing_id: Number(id),
        p_bid_amount: proposedBid
      });

      if (!response.success) {
        throw new Error(response.error || 'Bid failed');
      }
      
      // 2. Successful Bid! Show confirmation
      setBidConfirm({ 
        amount: proposedBid, 
        listingName: `${listing?.Make} ${listing?.Model}` 
      });
      setBidAmount('');

      // 3. Update local state via refresh
      await refreshDetail();
      
    } catch (err) {
      if (listing) listing.CurrentPrice = previousPrice;
      setBidError(err.message || 'Bid failed. Please try again.');
      // Re-show modal if it was a validation error (optional)
    } finally {
      setBidding(false);
    }
  }, [bidAmount, listing, id, refreshDetail]);
  
  // ==========================================
  // EARLY RETURNS - ONLY AFTER ALL HOOKS
  // ==========================================
  
  if (userLoading || detailLoading) {
    return <LoadingScreen message="Loading vehicle details..." />;
  }
  
  if (detailError) {
    return (
      <div style={{ color: 'white', padding: '40px', textAlign: 'center' }}>
        Error loading vehicle: {detailError.message}
      </div>
    );
  }
  
  if (!listing) {
    return (
      <div style={{ color: 'white', padding: '40px', textAlign: 'center' }}>
        Vehicle not found.
      </div>
    );
  }
  
  const isClosed = listing?.status === 'sold' || timeRemainingObj?.closed;
  
  // ==========================================
  // MAIN RENDER
  // ==========================================
  
  return (
    <div className={styles.pageWrapper}>
      <UniversalHeader />
      
      {authPrompt.visible && (
        <AuthPromptModal 
          message={authPrompt.message} 
          onClose={closeAuthPrompt} 
        />
      )}
      
      {bidConfirm && (
        <BidConfirmToast 
          amount={bidConfirm.amount} 
          listingName={bidConfirm.listingName} 
          onClose={() => setBidConfirm(null)} 
        />
      )}
      
      {showReport && (
        <ReportModal 
          targetType="listing" 
          targetId={String(id)} 
          onClose={() => setShowReport(false)} 
        />
      )}
      
      <div className={styles.mainContainer}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          <FaArrowLeft /> Back to Auction Floor
        </button>
        
        <div className={styles.titleRow}>
          <h1 className={styles.title}>
            {listing.Make} <span>{listing.Model}</span>
          </h1>
          
          <div className={styles.actionIcons}>
            <div className={styles.heatWrap}>
              <button 
                className={`${styles.iconBtn} ${isLiked ? styles.heatActive : ''}`} 
                onClick={toggleHeat}
                aria-label={isLiked ? 'Unlike' : 'Like'}
              >
                <FaFire />
              </button>
              <span className={styles.heatCount}>{heatCount}</span>
            </div>
            
            <button 
              className={`${styles.iconBtn} ${isBookmarked ? styles.bookmarked : ''}`} 
              onClick={toggleBookmark}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
            >
              <FaBookmark />
            </button>
            
            <button className={styles.iconBtn} aria-label="Share">
              <FaShareAlt />
            </button>
            
            {user && listing?.userid !== user?.id && (
              <button 
                className={styles.iconBtn} 
                onClick={() => setShowReport(true)} 
                title="Report this listing" 
                style={{ color: '#6B7280', fontSize: '13px' }}
                aria-label="Report"
              >
                <FaTimes style={{ transform: 'rotate(45deg)' }} />
              </button>
            )}
          </div>
        </div>
        
        {/* Gallery - Fixed */}
        <div className={styles.gallerySection}>
          <div className={styles.mainImageContainer}>
            {isClosed ? (
              <div className={styles.liveBadge} style={{ backgroundColor: '#EF4444' }}>
                CLOSED
              </div>
            ) : (
              <div className={styles.liveBadge}>
                <div className={styles.dot}></div> LIVE AUCTION
              </div>
            )}
            
            {currentImage ? (
              <img 
                src={currentImage} 
                alt={`${listing.Year} ${listing.Make} ${listing.Model}`} 
                className={styles.mainImage} 
                style={{ filter: isClosed ? 'grayscale(80%) brightness(0.7)' : 'none' }} 
              />
            ) : (
              <div className={styles.noImagePlaceholder}>No Image Available</div>
            )}
            
            {imageCount > 1 && (
              <>
                <button 
                  className={`${styles.galleryNav} ${styles.galleryNavLeft}`} 
                  onClick={goToPrev}
                  aria-label="Previous image"
                >
                  <FaChevronLeft />
                </button>
                <button 
                  className={`${styles.galleryNav} ${styles.galleryNavRight}`} 
                  onClick={goToNext}
                  aria-label="Next image"
                >
                  <FaChevronRight />
                </button>
                <div className={styles.imageCounter}>
                  {currentImageNum} / {imageCount}
                </div>
              </>
            )}
          </div>
          
          {imageCount > 1 && (
            <div className={styles.thumbnailStrip}>
              {allImages.map((url, i) => (
                <div 
                  key={i} 
                  className={`${styles.thumbnail} ${i === activeImageIndex ? styles.thumbnailActive : ''}`} 
                  onClick={() => setActiveImageIndex(i)}
                  role="button"
                  tabIndex={0}
                  aria-label={`View image ${i + 1}`}
                >
                  <img 
                    src={url} 
                    alt={`Thumbnail ${i + 1}`} 
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Specs */}
        <div className={styles.specsBanner}>
          {[
            { label: 'Year', value: listing.Year },
            { label: 'Mileage', value: listing.mileage },
            { label: 'Engine', value: listing.engine },
            { label: 'Transmission', value: listing.transmission },
            { label: 'Location', value: listing.location }
          ].map(spec => (
            <div key={spec.label} className={styles.specBlock}>
              <span className={styles.specLabel}>{spec.label}</span>
              <span className={styles.specValue}>{spec.value || '—'}</span>
            </div>
          ))}
        </div>
        
        {/* Bid Panel */}
        <div className={styles.bidPanelFullWidth}>
          <div className={styles.bidPanelContent}>
            <div className={styles.bidHeaderRow}>
              <div className={styles.bidLabelGroup}>
                <span className={styles.bidLabel}>Current Bid</span>
                <h3 className={styles.bidAmount}>
                  {formatZARLocal(listing.CurrentPrice || listing.StartingPrice)}
                </h3>
                {listing.ReservePrice > 0 && (
                  <span style={{
                    fontSize: '12px', 
                    fontWeight: 'bold', 
                    marginTop: '4px', 
                    display: 'inline-block', 
                    color: (listing.CurrentPrice || 0) >= listing.ReservePrice ? '#10B981' : '#F59E0B'
                  }}>
                    {(listing.CurrentPrice || 0) >= listing.ReservePrice ? '✓ Reserve Met' : '⚠ Reserve Not Met'}
                  </span>
                )}
              </div>
              
              <div className={styles.bidLabelGroup} style={{ textAlign: 'right' }}>
                <span className={styles.bidLabel}>Time Left</span>
                <CountdownTimer 
                  closesAt={listing?.closes_at} 
                  onClose={() => setTimeRemainingObj({ closed: true })}
                />
              </div>
            </div>
            
            <div className={styles.bidInputArea}>
              <span className={styles.maxBidLabel}>
                {isClosed ? 'Auction Closed' : 
                 isOwner ? 'Your Showroom Listing' : 
                 'Enter Your Max Bid'}
              </span>
              
              {!isClosed && !isOwner && (
                <>
                  <div className={styles.bidInputWrap}>
                    <span className={styles.currencySymbol}>R</span>
                    <input 
                      value={bidAmount} 
                      onChange={handleBidInput} 
                      type="text" 
                      inputMode="decimal" 
                      pattern="^\d+(\.\d{1,2})?$" 
                      maxLength={12} 
                      autoComplete="off" 
                      placeholder="0.00"
                      aria-label="Bid amount"
                    />
                  </div>
                  
                  {bidError && <div className={styles.bidErrorMsg}>{bidError}</div>}
                  
                  <button 
                    onClick={handlePlaceBid} 
                    disabled={bidding} 
                    className={styles.placeBidBtn}
                  >
                    {bidding ? 'PROCESSING...' : 'PLACE BID'}
                  </button>
                </>
              )}
              
              {isClosed && (
                <div className={styles.ownerNotice} style={{ color: '#EF4444' }}>
                  Bidding has concluded. This vehicle's auction has closed.
                </div>
              )}
              
              {isOwner && !isClosed && (
                <div className={styles.ownerNotice}>
                  This is your listing. You can manage it from the My Inventory page, but self-bidding is restricted.
                </div>
              )}
            </div>
            
            <div className={styles.escrowNote}>
              <FaShieldAlt /> Escrow Protection Guaranteed
            </div>
            
            <div className={styles.activitySection}>
              <h4 className={styles.activityHeader}>Latest Activity</h4>
              {bidHistory.length > 0 ? (
                bidHistory.slice(0, 3).map(bid => (
                  <div key={bid.id} className={styles.activityRow}>
                    <span className={styles.activityUser}>
                      User_{bid.userid?.substring(0, 5) || 'XXXXX'}
                    </span>
                    <span>{formatZARLocal(bid.amount)}</span>
                  </div>
                ))
              ) : (
                <p style={{ color: '#9CA3AF', fontSize: '12px' }}>No bids placed yet.</p>
              )}
              <button 
                className={styles.viewHistory} 
                onClick={() => setShowHistoryModal(true)}
              >
                VIEW FULL HISTORY
              </button>
            </div>
          </div>
        </div>
        
        {/* Content Grid */}
        <div className={styles.contentGrid} ref={commentsSectionRef}>
          <div className={styles.commentsColumn}>
            <div className={styles.pitLaneHeader}>
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                The Pit Lane <span className={styles.commentCount}>({comments.length} Comments)</span>
              </h2>
              <button className={styles.sortBtn}>&#8644; RECENT</button>
            </div>
            
            <div className={styles.commentsList}>
              {visibleComments.map(cx => (
                <CommentNode 
                  key={cx.id} 
                  comment={cx} 
                  handleReply={handleReplyClick} 
                  handleLike={handleCommentLike} 
                  handleDelete={handleDeleteComment} 
                  currentUserId={user?.id} 
                  listingOwnerId={listing.userid} 
                  styles={styles} 
                />
              ))}
              
              {comments.length === 0 && (
                <p style={{ color: '#9CA3AF', marginBottom: '32px', fontSize: '14px' }}>
                  Be the first to start the discussion!
                </p>
              )}
            </div>
            
            {!commentsExpanded && hiddenCount > 0 && (
              <button 
                className={styles.expandCommentsBtn} 
                onClick={() => setCommentsExpanded(true)}
              >
                <FaChevronDown /> Show {hiddenCount} more comment{hiddenCount !== 1 ? 's' : ''}
              </button>
            )}
            
            <div className={styles.commentInputBox} ref={commentInputRef}>
              {replyingTo && (
                <div className={styles.replyingToBanner}>
                  <span>Replying to {replyingTo.firstname}</span>
                  <button 
                    className={styles.cancelReplyBtn} 
                    onClick={() => setReplyingTo(null)}
                    aria-label="Cancel reply"
                  >
                    <FaTimes />
                  </button>
                </div>
              )}
              
              <textarea 
                placeholder={replyingTo ? "Write your reply..." : "Join the discussion..."} 
                className={styles.commentTextArea} 
                value={newComment} 
                onChange={(e) => setNewComment(e.target.value)}
                disabled={isPostingComment}
                maxLength={1000}
              />
              
              <button 
                className={styles.postBtn} 
                onClick={postComment}
                disabled={isPostingComment || !newComment.trim()}
              >
                {isPostingComment ? 'POSTING...' : 'POST COMMENT'}
              </button>
            </div>
          </div>
          
          <div className={styles.infoColumn}>
            <h2 className={styles.sectionTitle}>Curator's Note</h2>
            <p className={styles.curatorText}>
              This {listing.Year} {listing.Make} {listing.Model} is a masterpiece of aerodynamic engineering. 
              Finished in stunning paintwork over premium trim, this example features the high performance 
              package which adds lightweight wheels and exposed carbon fiber elements. Delivered new to 
              the current owner, it has been maintained in a climate-controlled facility with zero track time recorded.
            </p>
          </div>
        </div>
      </div>
      
      {commentsExpanded && comments.length > VISIBLE_COMMENTS && (
        <button 
          className={styles.stickyCollapseBtn} 
          onClick={() => { 
            setCommentsExpanded(false); 
            commentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); 
          }}
        >
          <FaChevronUp /> Collapse Comments
        </button>
      )}
      
      {showHistoryModal && (
        <div className={styles.modalOverlay} onClick={() => setShowHistoryModal(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalTitle}>
              Bid History 
              <button 
                className={styles.closeBtn} 
                onClick={() => setShowHistoryModal(false)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
              {bidHistory.map(bid => (
                <div 
                  key={bid.id} 
                  className={styles.activityRow} 
                  style={{ 
                    fontSize: '14px', 
                    borderBottom: '1px solid rgba(255,255,255,0.05)', 
                    paddingBottom: '12px' 
                  }}
                >
                  <span className={styles.activityUser}>
                    User_{bid.userid?.substring(0, 5) || 'XXXXX'}
                  </span>
                  <span style={{ color: '#fff', fontWeight: 'bold' }}>
                    {formatZARLocal(bid.amount)}
                  </span>
                </div>
              ))}
              
              {bidHistory.length === 0 && (
                <p style={{ color: '#9CA3AF' }}>No bids yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
      
      {showBidModal && listing && (
        <BidConfirmModal 
          amount={parseFloat(bidAmount)} 
          currentPrice={listing.CurrentPrice || listing.StartingPrice || 0} 
          listingName={`${listing.Year} ${listing.Make} ${listing.Model}`} 
          onConfirm={submitBid} 
          onCancel={() => setShowBidModal(false)} 
        />
      )}
    </div>
  );
};

export default ListingDetail;