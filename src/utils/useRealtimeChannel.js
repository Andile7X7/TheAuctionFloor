/**
 * useRealtimeChannel.js
 * React hook wrapping realtimeManager — auto-unsubscribes on unmount.
 *
 * Usage:
 *   useRealtimeChannel('listing', listingId, 'bid', (payload) => { ... })
 *   useRealtimeChannel('user', userId, 'notification', (payload) => { ... })
 */
import { useEffect } from 'react';
import { realtimeSubscribe } from './realtimeManager';

/**
 * @param {'listing' | 'user' | 'global'} type
 * @param {string | number | null | undefined} id  - When falsy, no subscription is created
 * @param {string} event
 * @param {function} callback
 */
export function useRealtimeChannel(type, id, event, callback) {
  useEffect(() => {
    if (!id) return; // Don't subscribe until ID is available (e.g. user not yet loaded)

    const unsubscribe = realtimeSubscribe(type, id, event, callback);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id, event]); // callback intentionally omitted — callers pass stable refs or inline fns
}
