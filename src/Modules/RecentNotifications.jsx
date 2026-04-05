import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../Modules/SupabaseClient';
import styles from './RecentNotifications.module.css';
import { FaBell, FaGavel, FaFire, FaHeart, FaComment, FaBookmark } from 'react-icons/fa';

const RecentNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchRecentNotifications = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('notifications')
          .select('*, listings(ImageURL)')
          .eq('recipient_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5); // Only fetch the 5 most recent

        if (error) throw error;
        setNotifications(data || []);
      } catch (err) {
        console.error('Error fetching recent notifications:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentNotifications();

    // Setup realtime subscription
    const channel = supabase
      .channel('recent_notifications_feed')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications'
      }, async (payload) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && payload.new.recipient_id === user.id) {
            setNotifications(prev => {
                const updated = [payload.new, ...prev];
                return updated.slice(0, 5); // keep it at 5 max
            });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getIcon = (type) => {
    switch (type) {
      case 'bid': return <FaGavel style={{ color: '#F59E0B' }} />;
      case 'like': return <FaFire style={{ color: '#ffb480' }} />;
      case 'comment': return <FaComment style={{ color: '#3B82F6' }} />;
      case 'bookmark': return <FaBookmark style={{ color: '#10B981' }} />;
      default: return <FaBell style={{ color: '#9CA3AF' }} />;
    }
  };

  const formatTimeAgo = (timestamp) => {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    let interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return "Just now";
  };

  if (loading) {
    return (
      <div className={styles.container}>
         <div className={styles.header}>
            <h2 className={styles.title}>Recent Activity</h2>
         </div>
         <div className={styles.loading}>Loading notifications...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Recent Activity</h2>
        <span className={styles.viewAll} onClick={() => navigate('/dashboard/notifications')}>
          View All
        </span>
      </div>

      <div className={styles.list}>
        {notifications.length === 0 ? (
          <div className={styles.empty}>
             <FaBell className={styles.emptyIcon} />
             <p>No recent activity on your listings.</p>
          </div>
        ) : (
          notifications.map(n => (
            <div 
              key={n.id} 
              className={`${styles.item} ${!n.is_read ? styles.unread : ''}`}
              onClick={() => n.link_url && navigate(n.link_url)}
            >
              <div className={styles.iconWrap}>
                {getIcon(n.type)}
                {!n.is_read && <div className={styles.unreadDot} />}
              </div>
              <div className={styles.content} style={{ flex: 1 }}>
                <p className={styles.message}>{n.message}</p>
                <span className={styles.time}>{formatTimeAgo(n.created_at)}</span>
              </div>
              {n.listings?.ImageURL && (
                <div style={{ marginLeft: '12px', flexShrink: 0 }}>
                  <img src={n.listings.ImageURL} alt="Car" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RecentNotifications;
