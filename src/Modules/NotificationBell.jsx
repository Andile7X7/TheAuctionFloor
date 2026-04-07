import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBell } from 'react-icons/fa';
import { supabase } from './SupabaseClient';
import styles from './NotificationBell.module.css';
import { useRealtimeChannel } from '../utils/useRealtimeChannel';

const NotificationBell = () => {
  const [user, setUser] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchUnread = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false);
      setUnreadCount(count || 0);
    };

    fetchUnread();
  }, [user]);

  // Shared user channel — all notification listeners for this user share ONE WebSocket
  const handleNotification = useCallback(() => {
    setUnreadCount(prev => prev + 1);
  }, []);

  useRealtimeChannel('user', user?.id, 'notification', handleNotification);

  if (!user) return null;

  return (
    <div className={styles.notificationBellWrap} onClick={() => navigate('/dashboard/notifications')}>
      <FaBell className={styles.headerIcon} />
      {unreadCount > 0 && <span className={styles.notifBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </div>
  );
};

export default NotificationBell;
