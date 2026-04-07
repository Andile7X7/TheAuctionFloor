/**
 * realtimeManager.js
 * Singleton that manages shared Supabase Realtime channels.
 *
 * Instead of each component opening its own WebSocket, components
 * register callbacks here. The manager creates exactly ONE channel
 * per unique key (e.g. "listing:42", "user:{userId}") and routes
 * incoming events to all registered callbacks.
 *
 * Connection count goes from N×components → 1 per channel key.
 */
import { supabase } from '../Modules/SupabaseClient';

// Map<channelKey, { channel, refs: number, listeners: Map<eventType, Set<fn>> }>
const registry = new Map();

/**
 * Subscribe to a shared channel.
 *
 * @param {'listing' | 'user' | 'global'} type  - Channel category
 * @param {string | number} id                   - Listing ID, user ID, or a fixed name
 * @param {string} event                         - Logical event name (e.g. 'bid', 'notification')
 * @param {function} callback                    - Called with the Supabase payload
 * @returns {function} Unsubscribe function — call this on component unmount
 */
export function realtimeSubscribe(type, id, event, callback) {
  const channelKey = `${type}:${id}`;

  if (!registry.has(channelKey)) {
    // First subscriber — create the channel
    const listeners = new Map();
    const channel = _buildChannel(type, id, listeners);
    registry.set(channelKey, { channel, refs: 0, listeners });
  }

  const entry = registry.get(channelKey);
  entry.refs += 1;

  if (!entry.listeners.has(event)) {
    entry.listeners.set(event, new Set());
  }
  entry.listeners.get(event).add(callback);

  // Return the unsubscribe function
  return () => {
    const e = registry.get(channelKey);
    if (!e) return;

    e.listeners.get(event)?.delete(callback);
    e.refs -= 1;

    // Tear down when last subscriber leaves
    if (e.refs <= 0) {
      supabase.removeChannel(e.channel);
      registry.delete(channelKey);
    }
  };
}

// ─── Internal channel builders ────────────────────────────────────────────────

function _buildChannel(type, id, listeners) {
  switch (type) {
    case 'listing':
      return _buildListingChannel(id, listeners);
    case 'user':
      return _buildUserChannel(id, listeners);
    case 'global':
      return _buildGlobalChannel(id, listeners);
    default:
      throw new Error(`[realtimeManager] Unknown channel type: ${type}`);
  }
}

/** One shared channel for all viewers of a single listing. */
function _buildListingChannel(listingId, listeners) {
  return supabase
    .channel(`listing:${listingId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'listings', filter: `id=eq.${listingId}` },
      (payload) => _dispatch(listeners, 'listing_update', payload)
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'bid_history', filter: `listing_id=eq.${listingId}` },
      (payload) => _dispatch(listeners, 'bid', payload)
    )
    .subscribe();
}

/** Per-user private channel — handles notifications for one user. */
function _buildUserChannel(userId, listeners) {
  return supabase
    .channel(`user:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${userId}`,
      },
      (payload) => _dispatch(listeners, 'notification', payload)
    )
    .subscribe();
}

/** Shared global channel (e.g. public activity feed — no per-user filter). */
function _buildGlobalChannel(name, listeners) {
  return supabase
    .channel(`global:${name}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'activities' },
      (payload) => _dispatch(listeners, 'activity', payload)
    )
    .subscribe();
}

function _dispatch(listeners, event, payload) {
  listeners.get(event)?.forEach((cb) => {
    try { cb(payload); } catch (err) {
      console.error(`[realtimeManager] Error in ${event} callback:`, err);
    }
  });
}
