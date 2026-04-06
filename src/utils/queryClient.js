// src/utils/queryClient.js

import { QueryClient } from '@tanstack/react-query';

/**
 * Creates a configured QueryClient for the auction platform
 * Optimized for: listings, activities, user data with different stale times
 */
export const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      // Data fresh for 60 seconds - no background refetch in this window
      staleTime: 60 * 1000,
      
      // Keep inactive data for 10 minutes before garbage collection
      gcTime: 10 * 60 * 1000,
      
      // Don't refetch on window focus (saves bandwidth)
      refetchOnWindowFocus: false,
      
      // Don't refetch on reconnect (we have realtime subscriptions)
      refetchOnReconnect: false,
      
      // Retry failed queries with exponential backoff
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // Default page size for infinite queries
      placeholderData: (previousData) => previousData,
    },
    mutations: {
      // Be careful with mutations - not idempotent
      retry: 1,
      
      // Optimistic updates should roll back on error
      onError: (error, variables, context) => {
        console.error('Mutation failed:', error);
      },
    },
  },
});

/**
 * Query key factory for type-safe cache management
 * Use these keys to ensure consistent cache invalidation
 */
export const queryKeys = {
  // Listings
  listings: {
    all: ['listings'],
    auction: (filters) => ['listings', 'auction', filters],
    detail: (id) => ['listings', 'detail', id],
    search: (query, filters) => ['listings', 'search', query, filters],
    watched: (userId) => ['listings', 'watched', userId],
    trending: () => ['listings', 'trending'],
  },
  
  // Activities / Feed
  activities: {
    all: ['activities'],
    feed: (userId) => ['activities', 'feed', userId],
    byListing: (id) => ['activities', 'listing', id],
    personalized: (userId) => ['activities', 'personalized', userId],
  },
  
  // User data
  user: {
    profile: (id) => ['user', 'profile', id],
    bids: (id) => ['user', 'bids', id],
    listings: (id) => ['user', 'listings', id],
  },
  
  // Bids
  bids: {
    all: ['bids'],
    byListing: (id) => ['bids', 'listing', id],
    history: (userId) => ['bids', 'history', userId],
  },
  
  // Notifications
  notifications: {
    all: ['notifications'],
    unread: (userId) => ['notifications', 'unread', userId],
  },
};

/**
 * Helper to invalidate multiple related caches
 */
export const invalidateRelatedCaches = (queryClient, primaryKey) => {
  // Invalidate listings when bids change
  if (primaryKey.includes('bids')) {
    queryClient.invalidateQueries({ queryKey: ['listings'] });
    queryClient.invalidateQueries({ queryKey: ['activities'] });
  }
  
  // Invalidate activities when listings change
  if (primaryKey.includes('listings')) {
    queryClient.invalidateQueries({ queryKey: ['activities'] });
  }
};