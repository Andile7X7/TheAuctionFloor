import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../Modules/SupabaseClient';
import DashboardLayout from '../Modules/DashboardLayout';
import styles from './Notifications.module.css';
import { FaBell, FaCheck, FaTrash, FaCircle, FaGavel, FaFire, FaComment, FaBookmark, FaChevronRight } from 'react-icons/fa';

const Notifications = () => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchNotifications = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate('/signup');
                return;
            }
            setUser(user);

            const { data, error } = await supabase
                .from('notifications')
                .select('*, listings(ImageURL)')
                .eq('recipient_id', user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching notifications:', error);
            } else {
                setNotifications(data || []);
            }
            setLoading(false);
        };

        fetchNotifications();

        // Realtime listener for new notifications
        const channel = supabase
            .channel('notifications_feed')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'notifications',
                filter: `recipient_id=eq.${user?.id}`
            }, payload => {
                setNotifications(prev => [payload.new, ...prev]);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [navigate, user?.id]);

    const markAsRead = async (id) => {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);

        if (!error) {
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        }
    };

    const markAllAsRead = async () => {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('recipient_id', user.id)
            .eq('is_read', false);

        if (!error) {
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        }
    };

    const deleteNotification = async (id) => {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', id);

        if (!error) {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'bid': return <FaGavel className={styles.bidIcon} />;
            case 'like': return <FaFire className={styles.likeIcon} />;
            case 'comment': return <FaComment className={styles.commentIcon} />;
            case 'bookmark': return <FaBookmark className={styles.bookmarkIcon} />;
            default: return <FaBell />;
        }
    };

    return (
        <DashboardLayout user={user}>
            <div className={styles.pageContainer}>
                <div className={styles.header}>
                    <h1 className={styles.title}>Notifications</h1>
                    {notifications.some(n => !n.is_read) && (
                        <button className={styles.markAllBtn} onClick={markAllAsRead}>
                            <FaCheck /> Mark all as read
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className={styles.statusMsg}>Loading notifications...</div>
                ) : notifications.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}><FaBell /></div>
                        <h3>No notifications yet</h3>
                        <p>When buyers interact with your listings, you'll see them here.</p>
                    </div>
                ) : (
                    <div className={styles.notificationList}>
                        {notifications.map((n) => (
                            <div 
                                key={n.id} 
                                className={`${styles.notificationItem} ${!n.is_read ? styles.unread : ''} ${n.link_url ? styles.clickable : ''}`}
                                onClick={() => {
                                    markAsRead(n.id);
                                    if (n.link_url) navigate(n.link_url);
                                }}
                            >
                                <div className={styles.iconArea}>
                                    {getIcon(n.type)}
                                </div>
                                <div className={styles.content}>
                                    <div className={styles.messageText}>
                                        {n.message}
                                    </div>
                                    <div className={styles.meta}>
                                        <span className={styles.timestamp}>
                                            {new Date(n.created_at).toLocaleDateString()} at {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        {n.link_url && (
                                            <button 
                                                className={styles.viewBtn} 
                                                onClick={(e) => { e.stopPropagation(); markAsRead(n.id); navigate(n.link_url); }}
                                            >
                                                View Listing <FaChevronRight />
                                            </button>
                                        )}
                                    </div>
                                    {n.listings?.ImageURL && (
                                        <div style={{marginLeft: '16px'}}>
                                            <img src={n.listings.ImageURL} alt="Car" style={{width: '60px', height: '40px', objectFit: 'cover', borderRadius: '4px'}} />
                                        </div>
                                    )}
                                </div>
                                <div className={styles.actions}>
                                    {!n.is_read && <FaCircle className={styles.unreadDot} />}
                                    <button 
                                        className={styles.deleteBtn} 
                                        onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                                        title="Delete"
                                    >
                                        <FaTrash />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
};

export default Notifications;
