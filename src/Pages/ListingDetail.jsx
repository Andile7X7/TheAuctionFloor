import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../Modules/SupabaseClient';
import styles from './ListingDetail.module.css';
import UniversalHeader from '../Modules/UniversalHeader';
import { FaBookmark, FaShareAlt, FaShieldAlt, FaThumbsUp, FaFire, FaTimes, FaChevronLeft, FaChevronRight, FaArrowLeft, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import AuthPromptModal from '../Modules/AuthPromptModal';
import LoadingScreen from '../Modules/LoadingScreen';
import BidConfirmToast from '../Modules/BidConfirmToast';
import BidConfirmModal from '../Modules/BidConfirmModal';
import NotificationBell from '../Modules/NotificationBell';
import UserAvatar from '../Modules/UserAvatar';

const CommentNode = ({ comment, handleReply, handleLike, handleDelete, currentUserId, listingOwnerId, styles }) => {
  return (
    <div className={styles.comment}>
      <UserAvatar name={comment.firstname} src={comment.avatar_url} bgColor={comment.avatar_bg} size={36} style={{ marginRight: '16px' }} />
      <div className={styles.commentBody}>
        <div className={styles.commentTop}>
          <div style={{display: 'flex', alignItems: 'center'}}>
            <span className={styles.commentAuthor}>{comment.firstname}</span>
            {comment.userid === listingOwnerId && <span className={styles.sellerBadge}>Seller</span>}
          </div>
          <span className={styles.commentTime}>{new Date(comment.created_at).toLocaleDateString()}</span>
        </div>
        <div className={styles.commentText}>{comment.content}</div>
        <div className={styles.commentActions}>
           <button 
             className={`${styles.replyBtn} ${comment.likes?.includes(currentUserId) ? styles.heatActiveSmall : ''}`} 
             onClick={() => handleLike(comment)}
             style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
           >
             <FaFire style={{ color: comment.likes?.includes(currentUserId) ? '#ffb480' : 'inherit' }} /> 
             {comment.likes?.length > 0 ? comment.likes.length : 'HEAT'}
           </button>
           <button className={styles.replyBtn} onClick={() => handleReply(comment)}>REPLY</button>
           {comment.userid === currentUserId && (
             <button className={styles.replyBtn} onClick={() => handleDelete(comment.id)} style={{ color: '#EF4444' }}>DELETE</button>
           )}
        </div>
        
        {comment.replies && comment.replies.length > 0 && (
          <div className={styles.repliesContainer}>
            {comment.replies.map(reply => (
              <CommentNode key={reply.id} comment={reply} handleReply={handleReply} handleLike={handleLike} handleDelete={handleDelete} currentUserId={currentUserId} listingOwnerId={listingOwnerId} styles={styles} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ListingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const commentInputRef = useRef(null);
  const commentsSectionRef = useRef(null);
  
  const [listing, setListing] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState('');
  const [bidding, setBidding] = useState(false);
  const [bidError, setBidError] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');

  // New Table States
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [heatCount, setHeatCount] = useState(0);
  const isOwner = user?.id && listing?.userid && user.id === listing.userid;
  const [isLiked, setIsLiked] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [bidHistory, setBidHistory] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authPrompt, setAuthPrompt] = useState({ visible: false, message: '' });
  const [bidConfirm, setBidConfirm] = useState(null);
  const [showBidModal, setShowBidModal] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  
  // Comments collapse state
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const VISIBLE_COMMENTS = 3;

  const showAuthPrompt = (message) => setAuthPrompt({ visible: true, message });
  const closeAuthPrompt = () => setAuthPrompt({ visible: false, message: '' });

  useEffect(() => {
    const fetchListing = async () => {
      // Check auth status so they can use the app headers
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data: profileData } = await supabase
          .from('users')
          .select('firstname, lastname')
          .eq('userid', user.id)
          .maybeSingle();
        if (profileData) {
          setCurrentUserName(`${profileData.firstname || ''} ${profileData.lastname || ''}`.trim() || user.email?.split('@')[0] || 'Someone');
        } else {
          setCurrentUserName(user.email?.split('@')[0] || 'Someone');
        }
      }

      // Fetch the specific listing
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error(error);
      } else {
        setListing(data);
        // Pre-fill input block slightly above current price
        const nextIncrement = (data.CurrentPrice || data.StartingPrice || 0) + 1000;
        setBidAmount(nextIncrement.toString());
      }

      const listingId = Number(id);

      // Fetch Likes
      const { data: likesData, error: likesError } = await supabase.from('likes').select('*').eq('listing_id', listingId);
      if (likesError) console.error('Error fetching likes:', likesError);
      
      if (likesData) {
        setHeatCount(likesData.length);
        if (user) {
          setIsLiked(likesData.some(l => l.userid === user.id));
        } else {
          setIsLiked(false);
        }
      } else {
        setHeatCount(0);
        setIsLiked(false);
      }

      // Fetch Bookmarks
      if (user) {
        const { data: bookmarkData, error: bookmarkError } = await supabase
          .from('bookmarks')
          .select('*')
          .eq('listing_id', listingId)
          .eq('userid', user.id);
          
        if (bookmarkError) console.error('Error fetching bookmarks:', bookmarkError);
        setIsBookmarked(bookmarkData && bookmarkData.length > 0);
      } else {
        setIsBookmarked(false);
      }

      // Fetch Comments
      const { data: cxData, error: cxError } = await supabase
        .from('comments')
        .select('*')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false });
      if (cxError) console.error('Error fetching comments:', cxError);
      
      if (cxData && cxData.length > 0) {
        const userIds = [...new Set(cxData.map(c => c.userid))];
        const commentIds = cxData.map(c => c.id);

        let usersData = [];
        let usersError = null;

        try {
          // Attempt full selection
          const { data, error } = await supabase
            .from('users')
            .select('userid, firstname, avatar_url, avatar_bg')
            .in('userid', userIds);
          
          if (error) throw error;
          usersData = data;
        } catch (err) {
          // Fallback selection
          const { data: basicData, error: basicError } = await supabase
            .from('users')
            .select('userid, firstname')
            .in('userid', userIds);
          
          usersData = basicData || [];
          usersError = basicError;
        }
          
        const { data: likesData, error: likesError } = await supabase
          .from('comment_likes')
          .select('comment_id, userid')
          .in('comment_id', commentIds);

        const likesMap = {};
        if (likesData) {
          likesData.forEach(L => {
            if (!likesMap[L.comment_id]) likesMap[L.comment_id] = [];
            likesMap[L.comment_id].push(L.userid);
          });
        }
          
        if (!usersError && usersData) {
          const profileMap = {};
          usersData.forEach(u => { profileMap[u.userid] = { firstname: u.firstname, avatar_url: u.avatar_url, avatar_bg: u.avatar_bg }; });
          cxData.forEach(c => {
             const prof = profileMap[c.userid];
             c.firstname = prof?.firstname || `User_${c.userid.substring(0,5)}`;
             c.avatar_url = prof?.avatar_url || null;
             c.avatar_bg = prof?.avatar_bg || null;
             c.likes = likesMap[c.id] || [];
          });
        } else {
          cxData.forEach(c => { 
             c.firstname = `User_${c.userid.substring(0,5)}`; 
             c.avatar_url = null;
             c.avatar_bg = null;
             c.likes = likesMap[c.id] || [];
          });
        }
        setComments(cxData);
      } else {
        setComments([]);
      }

      // Fetch Bid History
      const { data: bxData, error: bxError } = await supabase
        .from('bid_history')
        .select('*')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false });
      if (bxError) console.error('Error fetching bid history:', bxError);
      if (bxData) setBidHistory(bxData);

      setLoading(false);
    };
    fetchListing();

    // 1. Subscription for the listing itself (Price, Bid Count)
    const listingSub = supabase
      .channel(`listing_update_${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'listings', filter: `id=eq.${id}` }, payload => {
        if (payload.new) {
          setListing(payload.new);
        }
      })
      .subscribe();

    // 2. Subscription for new bid records (Activity list)
    const bidSub = supabase
      .channel(`bid_history_${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bid_history', filter: `listing_id=eq.${id}` }, payload => {
        if (payload.new) {
          setBidHistory(prev => [payload.new, ...prev]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(listingSub);
      supabase.removeChannel(bidSub);
    };
  }, [id]);

  const toggleBookmark = async () => {
    if (!user) return showAuthPrompt('Log in to save this vehicle to your watchlist.');
    const listingId = Number(id);
    try {
      if (isBookmarked) {
        const { error } = await supabase.from('bookmarks').delete().eq('listing_id', listingId).eq('userid', user.id);
        if (error) {
          console.error('Delete Bookmark Error', error);
          alert("Could not remove bookmark. Check database permissions.");
          return;
        }
        setIsBookmarked(false);
      } else {
        const { error } = await supabase.from('bookmarks').insert({ listing_id: listingId, userid: user.id });
        if (error) {
          console.error('Insert Bookmark Error', error);
          alert("Could not save bookmark: " + error.message);
          return;
        }
        setIsBookmarked(true);
        // Notify Owner
        sendNotification('bookmark', `followed your ${listing.Year} ${listing.Make} ${listing.Model}`);
      }
    } catch(err) { console.error('Bookmark Exception', err); }
  };

  const toggleHeat = async () => {
    if (!user) return showAuthPrompt('Log in to show some heat on this listing.');
    const listingId = Number(id);
    try {
      if (isLiked) {
        const { error } = await supabase.from('likes').delete().eq('listing_id', listingId).eq('userid', user.id);
        if (error) {
          console.error('Delete Heat Error', error);
          alert("Could not remove heat. Check database permissions.");
          return;
        }
        setIsLiked(false);
        setHeatCount(h => Math.max(0, h - 1));
      } else {
        const { error } = await supabase.from('likes').insert({ listing_id: listingId, userid: user.id });
        if (error) {
          console.error('Insert Heat Error', error);
          alert("Could not save heat: " + error.message);
          return;
        }
        setIsLiked(true);
        setHeatCount(h => h + 1);

        await supabase.from('activities').insert({
          userid: user.id,
          type: 'like',
          listing_id: listingId,
          entitytype: 'car',
          metadata: { userName: currentUserName, carName: `${listing.Make} ${listing.Model}` }
        });

        // Notify Owner
        sendNotification('like', `liked your ${listing.Year} ${listing.Make} ${listing.Model}`);
      }
    } catch(err) { console.error('Heat Exception', err); }
  };

  const sendNotification = async (type, message) => {
    if (!listing || !user) return;
    // Don't notify yourself of your own actions
    if (listing.userid === user.id) return;

    try {
      // Fetch the user's real name from the users table
      let userName = 'Someone';
      const { data: profileData, error: profError } = await supabase
        .from('users')
        .select('firstname, lastname')
        .eq('userid', user.id)
        .maybeSingle();

      if (profError) {
        console.error("Profile fetch error in ListingDetail (Init):", profError);
      }

      if (profileData) {
        userName = profileData.firstname || 'Someone';
        if (profileData.lastname) {
          userName += ` ${profileData.lastname}`;
        }
      } else {
        // Fallback: use the part before @ in their email
        userName = user.email?.split('@')[0] || 'Someone';
      }

      await supabase.from('notifications').insert({
        recipient_id: listing.userid,
        actor_id: user.id,
        listing_id: Number(id),
        type: type,
        message: `${userName} ${message}`,
        is_read: false
      });
    } catch (err) {
      console.error('Notification Error:', err);
    }
  };

  const handleCommentLike = async (comment) => {
    if (!user) return showAuthPrompt('Log in to show heat on comments.');
    const hasLiked = comment.likes?.includes(user.id);

    try {
      if (hasLiked) {
        setComments(prev => prev.map(c => c.id === comment.id ? { ...c, likes: c.likes.filter(uid => uid !== user.id) } : c));
        await supabase.from('comment_likes').delete().eq('comment_id', comment.id).eq('userid', user.id);
      } else {
        setComments(prev => prev.map(c => c.id === comment.id ? { ...c, likes: [...(c.likes||[]), user.id] } : c));
        await supabase.from('comment_likes').insert({
          comment_id: comment.id,
          userid: user.id,
          listing_id: Number(id)
        });
        
        if (comment.userid !== user.id) {
          let replySnippet = comment.content.substring(0, 30);
          if (comment.content.length > 30) replySnippet += '...';
          await supabase.from('notifications').insert({
            recipient_id: comment.userid,
            actor_id: user.id,
            listing_id: Number(id),
            type: 'like',
            message: `${currentUserName} showed some heat on your comment: "${replySnippet}"`,
            is_read: false
          });
        }
      }
    } catch (err) {
      console.error('Like error:', err);
    }
  };

  const postComment = async () => {
    if (!user) return showAuthPrompt('Log in to join the discussion on this vehicle.');
    if (!newComment.trim()) return;
    try {
      const payload = {
        listing_id: Number(id),
        userid: user.id,
        content: newComment
      };
      if (replyingTo) {
        payload.parent_id = replyingTo.id;
      }

      const { data, error } = await supabase.from('comments').insert(payload).select().single();
      
      if (error) throw error;
      
      data.firstname = currentUserName;
      
      setComments(prev => [data, ...prev]);
      
      if (!replyingTo) {
        await supabase.from('activities').insert({
          userid: user.id,
          type: 'comment',
          listing_id: Number(id),
          entitytype: 'car',
          metadata: { userName: currentUserName, carName: `${listing.Make} ${listing.Model}`, commentText: newComment }
        });
      }

      if (replyingTo && replyingTo.userid !== user.id) {
         let parentSnippet = replyingTo.content.substring(0, 20);
         if (replyingTo.content.length > 20) parentSnippet += '...';
         
         let newSnippet = newComment.substring(0, 30);
         if (newComment.length > 30) newSnippet += '...';

         await supabase.from('notifications').insert({
           recipient_id: replyingTo.userid,
           actor_id: user.id,
           listing_id: Number(id),
           type: 'comment',
           message: `${currentUserName} replied "${newSnippet}" to your comment "${parentSnippet}"`,
           is_read: false
         });
      }

      // Notify Owner if we aren't replying directly to the owner, to ensure they still get an alert
      if (!replyingTo || (replyingTo && listing.userid !== replyingTo.userid)) {
        sendNotification('comment', `posted a comment on your ${listing.Year} ${listing.Make} ${listing.Model}`);
      }
      
      setNewComment('');
      setReplyingTo(null);
      
    } catch(err) { alert(err.message); }
  };

  const handleDeleteComment = async (commentId) => {
    // Optimistic UI update
    setComments(prev => prev.filter(c => c.id !== commentId));
    try {
      await supabase.from('comments').delete().eq('id', commentId);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  // Handle reply click - scroll to input
  const handleReplyClick = (comment) => {
    setReplyingTo(comment);
    // Scroll to comment input
    if (commentInputRef.current) {
      commentInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Focus the textarea
      setTimeout(() => {
        const textarea = commentInputRef.current.querySelector('textarea');
        if (textarea) textarea.focus();
      }, 300);
    }
  };

  // Step 1: validate inputs and show confirmation modal
  const handlePlaceBid = () => {
    if (!user) {
      showAuthPrompt('You need to be logged in to place a bid on this vehicle.');
      return;
    }
    if (isOwner) {
      setBidError('You cannot bid on your own listing.');
      return;
    }
    const proposedBid = parseFloat(bidAmount);
    const currentHighest = listing.CurrentPrice || listing.StartingPrice || 0;
    if (isNaN(proposedBid) || proposedBid <= currentHighest) {
      setBidError(`Minimum bid must exceed ${formatZAR(currentHighest)}`);
      return;
    }
    setBidError('');
    setShowBidModal(true);
  };

  // Step 2: user confirmed — actually submit the bid
  const submitBid = async () => {
    const proposedBid = parseFloat(bidAmount);
    setShowBidModal(false);
    setBidding(true);
    try {
      // ─── 1. Find the previous highest bidder BEFORE we update (for notification) ───
      const { data: prevBidData } = await supabase
        .from('bid_history')
        .select('userid, amount')
        .eq('listing_id', parseInt(id, 10))
        .order('amount', { ascending: false })
        .limit(1)
        .maybeSingle();

      const prevLeaderId = prevBidData?.userid ?? null;

      // ─── 2. SAFE BIDDING VIA RPC (Transactional) ───
      const { error: rpcError } = await supabase.rpc('place_bid', {
        p_listing_id: parseInt(id),
        p_bid_amount: proposedBid,
        p_user_id: user.id
      });

      if (rpcError) throw new Error(rpcError.message);

      // ─── 3. Successful Bid! Notify previous leader & show confirmation ───
      setBidConfirm({ amount: proposedBid, listingName: `${listing.Make} ${listing.Model}` });
      setBidAmount('');

      await supabase.from('activities').insert({
        userid: user.id,
        type: 'bid',
        listing_id: parseInt(id),
        entitytype: 'car',
        metadata: { userName: currentUserName, carName: `${listing.Make} ${listing.Model}`, amount: proposedBid }
      });

      if (prevLeaderId && prevLeaderId !== user.id) {
        const vehicleName = `${listing.Make} ${listing.Model}`;
        await supabase.from('notifications').insert({
          recipient_id: prevLeaderId,
          actor_id: user.id,
          listing_id: parseInt(id),
          type: 'outbid',
          message: `You've been outbid on the ${vehicleName}! A new bid of ${formatZAR(proposedBid)} has been placed.`,
          link_url: `/listing/${id}`,
          is_read: false
        });
      }

      // Notify Owner
      const vehicleName = `${listing.Make} ${listing.Model}`;
      sendNotification('bid', `placed a bid of ${formatZAR(proposedBid)} on your ${vehicleName}`);

    } catch (err) {
      setBidError(err.message);
    } finally {
      setBidding(false);
    }
  };

  const formatZAR = (amount) => {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  // Process comments for display
  const getProcessedComments = () => {
    const commentMap = {};
    const rootComments = [];
    
    // Sort raw comments by created_at ascending so older are at top, making threads natural
    const sortedComments = [...comments].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

    sortedComments.forEach(c => {
      commentMap[c.id] = { ...c, replies: [] };
    });
    sortedComments.forEach(c => {
      if (c.parent_id && commentMap[c.parent_id]) {
        commentMap[c.parent_id].replies.push(commentMap[c.id]);
      } else {
        rootComments.push(commentMap[c.id]);
      }
    });
    
    // Reverse root comments at the end to keep newer top-level conversations at top
    return rootComments.reverse();
  };

  const processedComments = getProcessedComments();
  const visibleComments = commentsExpanded ? processedComments : processedComments.slice(0, VISIBLE_COMMENTS);
  const hiddenCount = processedComments.length - VISIBLE_COMMENTS;

  if (loading) return <LoadingScreen message="Loading vehicle details..." />;
  if (!listing) return <div style={{color:'white', padding: '40px', textAlign: 'center'}}>Vehicle not found.</div>;

  // Build dynamic image array from all available image columns
  const allImages = [
    listing.ImageURL,
    listing.image2url,
    listing.image3url,
    listing.image4url,
    listing.image5url,
    listing.image6url,
    listing.image7url,
    listing.image8url
  ].filter(Boolean);

  const goToPrev = () => setActiveImageIndex(i => (i - 1 + allImages.length) % allImages.length);
  const goToNext = () => setActiveImageIndex(i => (i + 1) % allImages.length);

  return (
    <div className={styles.pageWrapper}>
      <UniversalHeader />
      
      {/* Auth Prompt Modal */}
      {authPrompt.visible && (
        <AuthPromptModal message={authPrompt.message} onClose={closeAuthPrompt} />
      )}

      {/* Bid Confirmation Toast */}
      {bidConfirm && (
        <BidConfirmToast
          amount={bidConfirm.amount}
          listingName={bidConfirm.listingName}
          onClose={() => setBidConfirm(null)}
        />
      )}

      <div className={styles.mainContainer}>
        {/* Title Block */}
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          <FaArrowLeft /> Back to Auction Floor
        </button>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{listing.Make} <span>{listing.Model}</span></h1>
          <div className={styles.actionIcons}>
            <div className={styles.heatWrap}>
              <button className={`${styles.iconBtn} ${isLiked ? styles.heatActive : ''}`} onClick={toggleHeat}>
                <FaFire />
              </button>
              <span className={styles.heatCount}>{heatCount}</span>
            </div>
            <button className={`${styles.iconBtn} ${isBookmarked ? styles.bookmarked : ''}`} onClick={toggleBookmark}><FaBookmark /></button>
            <button className={styles.iconBtn}><FaShareAlt /></button>
          </div>
        </div>

        {/* Image Gallery */}
        <div className={styles.gallerySection}>
          <div className={styles.mainImageContainer}>
            {listing.status === 'sold' ? (
              <div className={styles.liveBadge} style={{ backgroundColor: '#EF4444' }}>SOLD</div>
            ) : (
              <div className={styles.liveBadge}><div className={styles.dot}></div> LIVE AUCTION</div>
            )}
            <img src={allImages[activeImageIndex]} alt={listing.Model} className={styles.mainImage} style={{ filter: listing.status === 'sold' ? 'grayscale(80%) brightness(0.7)' : 'none' }} />
            {allImages.length > 1 && (
              <>
                <button className={`${styles.galleryNav} ${styles.galleryNavLeft}`} onClick={goToPrev}><FaChevronLeft /></button>
                <button className={`${styles.galleryNav} ${styles.galleryNavRight}`} onClick={goToNext}><FaChevronRight /></button>
                <div className={styles.imageCounter}>{activeImageIndex + 1} / {allImages.length}</div>
              </>
            )}
          </div>
          {allImages.length > 1 && (
            <div className={styles.thumbnailStrip}>
              {allImages.map((url, i) => (
                <div 
                  key={i} 
                  className={`${styles.thumbnail} ${i === activeImageIndex ? styles.thumbnailActive : ''}`}
                  onClick={() => setActiveImageIndex(i)}
                >
                  <img src={url} alt={`View ${i + 1}`} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Specs Banner */}
        <div className={styles.specsBanner}>
          <div className={styles.specBlock}>
            <span className={styles.specLabel}>Year</span>
            <span className={styles.specValue}>{listing.Year}</span>
          </div>
          <div className={styles.specBlock}>
            <span className={styles.specLabel}>Mileage</span>
            <span className={styles.specValue}>{listing.mileage || '—'}</span>
          </div>
          <div className={styles.specBlock}>
            <span className={styles.specLabel}>Engine</span>
            <span className={styles.specValue}>{listing.engine || '—'}</span>
          </div>
          <div className={styles.specBlock}>
            <span className={styles.specLabel}>Transmission</span>
            <span className={styles.specValue}>{listing.transmission || '—'}</span>
          </div>
          <div className={styles.specBlock}>
            <span className={styles.specLabel}>Location</span>
            <span className={styles.specValue}>{listing.location || '—'}</span>
          </div>
        </div>

        {/* BID PANEL - Moved above comments section */}
        <div className={styles.bidPanelFullWidth}>
          <div className={styles.bidPanelContent}>
            <div className={styles.bidHeaderRow}>
              <div className={styles.bidLabelGroup}>
                <span className={styles.bidLabel}>Current Bid</span>
                <h3 className={styles.bidAmount}>{formatZAR(listing.CurrentPrice || listing.StartingPrice)}</h3>
              </div>
              <div className={styles.bidLabelGroup} style={{textAlign: 'right'}}>
                <span className={styles.bidLabel}>Time Left</span>
                <span className={styles.timeLeft}>04d : 12h : 22m</span>
              </div>
            </div>

            <div className={styles.bidInputArea}>
              <span className={styles.maxBidLabel}>
                {listing.status === 'sold' ? 'Auction Closed' : isOwner ? 'Your Showroom Listing' : 'Enter Your Max Bid'}
              </span>
              <div className={styles.bidInputWrap}>
                <span className={styles.currencySymbol}>R</span>
                <input 
                  type="number" 
                  className={styles.bidInput} 
                  value={bidAmount}
                  disabled={isOwner || bidding || listing.status === 'sold'}
                  placeholder={isOwner || listing.status === 'sold' ? '—' : ''}
                  onChange={(e) => {
                    setBidAmount(e.target.value);
                    if (bidError) setBidError('');
                  }}
                />
              </div>
              {bidError && <div className={styles.bidErrorMsg}>{bidError}</div>}
              
              {listing.status === 'sold' ? (
                <div className={styles.ownerNotice} style={{ color: '#EF4444' }}>
                  Bidding has concluded. This vehicle has been marked as SOLD.
                </div>
              ) : isOwner ? (
                <div className={styles.ownerNotice}>
                  This is your listing. You can manage it from the My Inventory page, but self-bidding is restricted.
                </div>
              ) : (
                <button onClick={handlePlaceBid} disabled={bidding} className={styles.placeBidBtn}>
                  {bidding ? 'PROCESSING...' : 'PLACE BID'}
                </button>
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
                    <span className={styles.activityUser}>User_{bid.userid.substring(0,5)}</span>
                    <span>{formatZAR(bid.amount)}</span>
                  </div>
                ))
              ) : (
                <p style={{color: '#9CA3AF', fontSize: '12px'}}>No bids placed yet.</p>
              )}

              <button className={styles.viewHistory} onClick={() => setShowHistoryModal(true)}>VIEW FULL HISTORY</button>
            </div>
          </div>
        </div>

        {/* Content Layout - Comments Section */}
        <div className={styles.contentGrid} ref={commentsSectionRef}>
          
          {/* Left Column - Comments */}
          <div className={styles.commentsColumn}>
            <div className={styles.pitLaneHeader}>
              <h2 className={styles.sectionTitle} style={{margin: 0}}>The Pit Lane <span className={styles.commentCount}>({comments.length} Comments)</span></h2>
              <button className={styles.sortBtn}>&#8644; RECENT</button>
            </div>

            {/* Comments List */}
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
                <p style={{color: '#9CA3AF', marginBottom: '32px', fontSize: '14px'}}>Be the first to start the discussion!</p>
              )}
            </div>

            {/* Expand/Collapse Controls */}
            {!commentsExpanded && hiddenCount > 0 && (
              <button 
                className={styles.expandCommentsBtn} 
                onClick={() => setCommentsExpanded(true)}
              >
                <FaChevronDown /> Show {hiddenCount} more comment{hiddenCount !== 1 ? 's' : ''}
              </button>
            )}

            {/* Comment Input Box */}
            <div className={styles.commentInputBox} ref={commentInputRef}>
              {replyingTo && (
                 <div className={styles.replyingToBanner}>
                    <span>Replying to {replyingTo.firstname}</span>
                    <button className={styles.cancelReplyBtn} onClick={() => setReplyingTo(null)}><FaTimes /></button>
                 </div>
              )}
              <textarea 
                placeholder={replyingTo ? "Write your reply..." : "Join the discussion..."} 
                className={styles.commentTextArea}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              ></textarea>
              <button className={styles.postBtn} onClick={postComment}>POST COMMENT</button>
            </div>

          </div>

          {/* Right Column - Curator's Note (moved from left) */}
          <div className={styles.infoColumn}>
            <h2 className={styles.sectionTitle}>Curator's Note</h2>
            <p className={styles.curatorText}>
              This {listing.Year} {listing.Make} {listing.Model} is a masterpiece of aerodynamic engineering. Finished in 
              stunning paintwork over premium trim, this example features the high performance package which adds lightweight 
              wheels and exposed carbon fiber elements. Delivered new to the current owner, it has been maintained in a 
              climate-controlled facility with zero track time recorded.
            </p>
          </div>

        </div>
      </div>

      {/* Sticky Collapse Button - Only visible when comments are expanded */}
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

      {/* Full Bid History Modal */}
      {showHistoryModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalTitle}>
              Bid History <button className={styles.closeBtn} onClick={() => setShowHistoryModal(false)}><FaTimes /></button>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px'}}>
              {bidHistory.map(bid => (
                <div key={bid.id} className={styles.activityRow} style={{fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px'}}>
                  <span className={styles.activityUser}>User_{bid.userid.substring(0,5)}</span>
                  <span style={{color: '#fff', fontWeight: 'bold'}}>{formatZAR(bid.amount)}</span>
                </div>
              ))}
              {bidHistory.length === 0 && <p style={{color: '#9CA3AF'}}>No bids yet.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Pre-submit Bid Confirmation Modal */}
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