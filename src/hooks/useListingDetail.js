// hooks/useListingDetail.js
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../Modules/SupabaseClient';

const fetchListingDetail = async ({ listingId, userId }) => {
  if (!listingId) return null;

  const listingIdNum = parseInt(listingId, 10);

  

  const [
    listingResult,
    commentsResult,
    bidHistoryResult,
    likesResult,
    bookmarksResult,
    likesCountResult
  ] = await Promise.all([
    supabase.from('listings').select('*').eq('id', listingIdNum).single(),
    supabase.from('comments').select(`id, content, created_at, userid, parent_id, users!inner(firstname, avatar_url, avatar_bg)`).eq('listing_id', listingIdNum).order('created_at', { ascending: false }),
    supabase.from('bid_history').select('id, amount, userid, created_at').eq('listing_id', listingIdNum).order('amount', { ascending: false }).limit(50),
    userId ? supabase.from('likes').select('id').eq('listing_id', listingIdNum).eq('userid', userId).maybeSingle() : Promise.resolve({ data: null }),
    userId ? supabase.from('bookmarks').select('id').eq('listing_id', listingIdNum).eq('userid', userId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('likes').select('*', { count: 'exact', head: true }).eq('listing_id', listingIdNum)
  ]);

  if (listingResult.error) throw listingResult.error;

  // Fetch comment likes
  const commentIds = commentsResult.data?.map(c => c.id) || [];
  let commentLikes = {};
  
  if (commentIds.length > 0) {
    const { data: likesData } = await supabase
      .from('comment_likes')
      .select('comment_id, userid')
      .in('comment_id', commentIds);
    
    commentLikes = (likesData || []).reduce((acc, like) => {
      if (!acc[like.comment_id]) acc[like.comment_id] = [];
      acc[like.comment_id].push(like.userid);
      return acc;
    }, {});
  }

  const commentsWithLikes = commentsResult.data?.map(c => ({
    ...c,
    firstname: c.users?.firstname,
    avatar_url: c.users?.avatar_url,
    avatar_bg: c.users?.avatar_bg,
    users: undefined,
    likes: commentLikes[c.id] || []
  })) || [];

  return {
    listing: listingResult.data,
    comments: commentsWithLikes,
    bid_history: bidHistoryResult.data || [],
    is_liked: !!likesResult.data,
    is_bookmarked: !!bookmarksResult.data,
    likes_count: likesCountResult.count || 0
  };
};

export const useListingDetail = (listingId, userId) => {
  return useQuery({
    queryKey: ['listing-detail', listingId, userId],
    queryFn: () => fetchListingDetail({ listingId, userId }),
    enabled: !!listingId,
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // 30 seconds
    retry: 3
  });
};