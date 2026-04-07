-- ============================================================================
-- UNBOUNDED TABLE GROWTH - CLEANUP SQL
-- Run these in Supabase SQL Editor or set up as Cron Jobs in Supabase Dashboard
-- ============================================================================

-- ============================================================================
-- NOTIFICATIONS: Delete older than 90 days (run daily)
-- ============================================================================
DELETE FROM notifications 
WHERE created_at < NOW() - INTERVAL '90 days';

-- ============================================================================
-- ACTIVITIES: Delete older than 180 days (run weekly)
-- ============================================================================
DELETE FROM activities 
WHERE created_at < NOW() - INTERVAL '180 days';

-- ============================================================================
-- BID_HISTORY: Archive older than 1 year (run monthly)
-- Option 1: Hard delete (simpler, recommended for now)
-- ============================================================================
DELETE FROM bid_history 
WHERE created_at < NOW() - INTERVAL '365 days';

-- ============================================================================
-- ADMIN_ACTION_LOG: Delete older than 2 years (run quarterly)
-- ============================================================================
DELETE FROM admin_action_log 
WHERE created_at < NOW() - INTERVAL '730 days';

-- ============================================================================
-- SETUP CRON JOBS IN SUPABASE DASHBOARD:
-- ============================================================================
-- 1. Go to Database → Cron Jobs
-- 2. Create new schedule for each:
--
-- Schedule: cleanup_notifications
-- SQL: DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '90 days';
-- Frequency: Daily at 3:00 AM
--
-- Schedule: cleanup_activities  
-- SQL: DELETE FROM activities WHERE created_at < NOW() - INTERVAL '180 days';
-- Frequency: Weekly on Sunday at 2:00 AM
--
-- Schedule: cleanup_bid_history
-- SQL: DELETE FROM bid_history WHERE created_at < NOW() - INTERVAL '365 days';
-- Frequency: Monthly on the 1st at 1:00 AM
--
-- Schedule: cleanup_admin_log
-- SQL: DELETE FROM admin_action_log WHERE created_at < NOW() - INTERVAL '730 days';
-- Frequency: Quarterly (Jan 1, Apr 1, Jul 1, Oct 1) at 12:00 AM
--
-- ============================================================================
-- MONITORING: Check table sizes
-- ============================================================================
SELECT 
    schemaname,
    relname AS table_name,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) AS total_size,
    n_live_tup AS row_count
FROM pg_stat_user_tables
WHERE relname IN ('notifications', 'activities', 'bid_history', 'admin_action_log')
ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC;