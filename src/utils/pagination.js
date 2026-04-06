// src/utils/pagination.js - New utility file

/**
 * Cursor-based pagination for infinite scroll (Auction Floor, Live Feed)
 * O(1) performance regardless of page depth
 */
export const createCursorQuery = (baseQuery, { cursor, limit = 20, sortBy = 'created_at', sortDir = 'desc' }) => {
  let query = baseQuery.limit(limit + 1); // +1 to check for next page
  
  if (cursor) {
    // Keyset pagination - WHERE clause on indexed column
    const operator = sortDir === 'desc' ? 'lt' : 'gt';
    query = query[operator](sortBy, cursor);
  }
  
  return query.order(sortBy, { ascending: sortDir === 'asc' });
};

/**
 * Offset-based pagination for admin/jump-to-page (User Dashboard)
 * Simple but degrades at high offsets
 */
export const createOffsetQuery = (baseQuery, { page = 1, pageSize = 20 }) => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return baseQuery.range(from, to);
};

/**
 * Process cursor results and return next cursor
 * @param {Array} data - Raw results from Supabase
 * @param {number} limit - Page size
 * @param {string} sortBy - The field being sorted on (used as cursor key)
 */
export const processCursorResults = (data, limit, sortBy = 'created_at') => {
  const hasMore = data.length > limit;
  const results = hasMore ? data.slice(0, limit) : data;
  const lastItem = results[results.length - 1];
  const nextCursor = hasMore && lastItem ? lastItem[sortBy] : null;
  
  return {
    data: results,
    nextCursor,
    hasMore
  };
};