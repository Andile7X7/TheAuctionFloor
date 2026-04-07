# CarBidPlatform — Improvement Plan

> Generated: 2026-04-06
> Status: Ready for execution
> Approach: Fix-by-fix, priority-ordered

---

## How to Use This Document

Each issue follows this structure:

| Field | Meaning |
|---|---|
| **Priority** | P0 (do now), P1 (this week), P2 (this month), P3 (next quarter) |
| **Effort** | Estimated time to implement |
| **Impact** | What this fixes and why it matters |
| **Why It's Not Rated Higher** | Root cause analysis |
| **Future Impact** | What happens if you ignore it |
| **Implementation Plan** | Step-by-step fix, validated against your architecture |
| **Files Affected** | Which files need changes |
| **Verification** | How to confirm the fix works |
| **Status** | Track your progress: `[ ]` → `[~]` → `[x]` |

Work through P0 items first. Each item is self-contained — you can fix them independently.

---

# PRIORITY 0 — Immediate (Week 1)

---

## P0-1: Consolidate ListingDetail Queries into Single RPC

**Effort:** 2 days
**Impact:** 3-5x faster page load, reduced database load
**Files:** `src/utils/listingQueries.js` (new), `src/Pages/ListingDetail.jsx`, Supabase SQL Editor

### Why It's Not Rated Higher
`ListingDetail.jsx:106-254` executes 7+ sequential queries: user session, user profile, listing, likes, bookmarks, comments, user profiles for comment authors, comment likes, bid history. Each waits for the previous. On a 100ms connection that's 900ms minimum; on mobile/international, 4-5 seconds.

### Future Impact
- Page feels sluggish, users bounce before content loads
- Each page view = 9 queries. At 1,000 concurrent users, that's 9,000 queries per page load cycle
- Supabase compute usage spikes, increasing costs
- Becomes the single biggest bottleneck as traffic grows

### Implementation Plan

**Step 1 — Create the RPC function in Supabase SQL Editor:**

```sql
CREATE OR REPLACE FUNCTION get_listing_detail(p_listing_id bigint, p_user_id uuid DEFAULT NULL)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'listing', (SELECT row_to_json(l) FROM listings l WHERE l.id = p_listing_id),
    'likes_count', (SELECT count(*) FROM likes WHERE listing_id = p_listing_id),
    'is_liked', (SELECT EXISTS(SELECT 1 FROM likes WHERE listing_id = p_listing_id AND userid = p_user_id)),
    'is_bookmarked', (SELECT EXISTS(SELECT 1 FROM bookmarks WHERE listing_id = p_listing_id AND userid = p_user_id)),
    'comments', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', c.id,
          'content', c.content,
          'created_at', c.created_at,
          'userid', c.userid,
          'parent_id', c.parent_id,
          'firstname', COALESCE(u.firstname, 'User_' || substring(c.userid::text, 1, 5)),
          'avatar_url', u.avatar_url,
          'avatar_bg', u.avatar_bg,
          'likes', (SELECT COALESCE(json_agg(cl.userid), '[]'::json) FROM comment_likes cl WHERE cl.comment_id = c.id)
        )
      ), '[]'::json)
      FROM comments c
      LEFT JOIN users u ON u.userid = c.userid
      WHERE c.listing_id = p_listing_id
      ORDER BY c.created_at DESC
      LIMIT 100
    ),
    'bid_history', (
      SELECT COALESCE(json_agg(row_to_json(b)), '[]'::json)
      FROM (
        SELECT * FROM bid_history
        WHERE listing_id = p_listing_id
        ORDER BY created_at DESC
        LIMIT 50
      ) b
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Step 2 — Create a custom hook:**

```js
// src/hooks/useListingDetail.js
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../Modules/SupabaseClient';
import { queryKeys } from '../utils/queryClient';

export const useListingDetail = (listingId, userId) => {
  return useQuery({
    queryKey: queryKeys.listings.detail(listingId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_listing_detail', {
        p_listing_id: Number(listingId),
        p_user_id: userId || null,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!listingId,
    staleTime: 30 * 1000,
  });
};
```

**Step 3 — Replace the waterfall in ListingDetail.jsx:**

Replace lines 106-254 with:
```js
const { data: detail, isLoading, error } = useListingDetail(id, user?.id);

// Then access data as:
// detail.listing, detail.likes_count, detail.is_liked, detail.is_bookmarked,
// detail.comments, detail.bid_history
```

### Verification
- Open Network tab, reload a listing page
- Confirm only 1 RPC call instead of 7+ sequential queries
- Page load time should drop from 2-5s to <1s
- All data (likes, bookmarks, comments, bid history) still displays correctly

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

## P0-2: Optimize Home.jsx — Stop Loading All Listings

**Effort:** 1 day
**Impact:** Fixes O(n) bottleneck, prevents page crash at scale
**Files:** `src/Pages/Home.jsx`

### Why It's Not Rated Higher
`Home.jsx:32` fetches EVERY active listing with no limit. At 100 listings = ~50KB (fine). At 10,000 = ~5MB (3-5s on mobile). At 100,000 = ~50MB (page crashes). Then client-side filtering runs on all of them.

### Future Impact
- Home page is the first impression — if slow, users leave
- Bandwidth costs scale with data size
- Mobile users on slow connections experience timeouts
- The `likes(count)` and `comments(count)` joins multiply payload size

### Implementation Plan

**Step 1 — Replace the single fetch with targeted queries:**

```js
// Replace lines 29-45 in Home.jsx

useEffect(() => {
    const fetchData = async () => {
        try {
            // 1. Recent listings for trending (fetch 50, pick top 5 by interaction)
            const { data: recentListings, error: listingsError } = await supabase
                .from('listings')
                .select('*, likes(count), comments(count)')
                .eq('status', 'active')
                .eq('verified', true)
                .order('created_at', { ascending: false })
                .limit(50);

            if (listingsError) throw listingsError;
            setListings(recentListings || []);

            // 2. Total count for "SHOW X AVAILABLE" button
            const { count, error: countError } = await supabase
                .from('listings')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'active')
                .eq('verified', true);

            if (countError) throw countError;
            setTotalCount(count);

        } catch (err) {
            console.error('Error fetching home data:', err);
        } finally {
            setLoading(false);
        }
    };
    fetchData();
}, []);
```

**Step 2 — Create a materialized view for trending (Supabase SQL Editor):**

```sql
-- Refresh this every 15 minutes via a cron job or manually
CREATE MATERIALIZED VIEW trending_listings AS
SELECT
    l.*,
    COALESCE((SELECT count(*) FROM likes WHERE listing_id = l.id), 0) as likes_count,
    COALESCE((SELECT count(*) FROM comments WHERE listing_id = l.id), 0) as comments_count,
    COALESCE((SELECT count(*) FROM bid_history WHERE listing_id = l.id), 0) as bids_count,
    (COALESCE((SELECT count(*) FROM likes WHERE listing_id = l.id), 0) +
     COALESCE((SELECT count(*) FROM comments WHERE listing_id = l.id), 0) +
     COALESCE((SELECT count(*) FROM bid_history WHERE listing_id = l.id), 0)) as interaction_score
FROM listings l
WHERE l.status = 'active' AND l.verified = true
ORDER BY interaction_score DESC
LIMIT 20;

-- Create index on the materialized view
CREATE UNIQUE INDEX idx_trending_listings_id ON trending_listings(id);

-- Refresh command (run via cron or Edge Function):
-- REFRESH MATERIALIZED VIEW CONCURRENTLY trending_listings;
```

**Step 3 — Use the materialized view for trending:**

```js
const { data: trending } = await supabase
    .from('trending_listings')
    .select('*')
    .limit(5);
```

### Verification
- Network tab shows limited payload (<200KB) regardless of database size
- Home page loads in <1s even with 10,000+ listings in database
- Trending section still shows most interactive cars
- "SHOW X AVAILABLE" count is accurate

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

## P0-3: Fix XSS Vulnerability in Sanitization Utilities

**Effort:** 1 day
**Impact:** Prevents stored XSS across comments, listings, and notifications
**Files:** `src/utils/bidValidation.js`, `src/utils/authSecurity.js`, `src/Pages/ListingDetail.jsx`, `src/Pages/AddListing.jsx`

### Why It's Not Rated Higher
The `sanitizeBidMetadata()` function in `bidValidation.js:99-125` has broken HTML entity encoding — it double-encodes `&` first, which means `&lt;` becomes `&amp;lt;` and renders as literal `&lt;` instead of `<`. Additionally, comment content, listing fields, and notification messages are inserted without any sanitization.

### Future Impact
- Stored XSS: malicious content persists in database and renders for every viewer
- Polyglot XSS: content safe in React JSX becomes dangerous in email notifications, admin dashboards, or mobile app WebViews
- Data integrity: null bytes, control characters, or extremely long content can break downstream systems
- Fails basic security audits and compliance requirements

### Implementation Plan

**Step 1 — Fix the broken HTML entity encoding in bidValidation.js:**

The order matters. `&` must be escaped LAST, not first:

```js
// Replace lines 113-119 in bidValidation.js

// WRONG (current):
// sanitized = sanitized
//   .replace(/&/g, '&amp;')    // This runs first, corrupting subsequent replacements
//   .replace(/</g, '&lt;')
//   ...

// CORRECT:
sanitized = sanitized
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#x27;')
  .replace(/\//g, '&#x2F;')
  .replace(/&/g, '&amp;');    // & must be last
```

**Step 2 — Create a general-purpose content sanitizer:**

```js
// Add to src/utils/contentSanitizer.js

export const CONTENT_CONFIG = {
  comment: { maxLength: 2000 },
  listing: { maxLength: 500 },
  notification: { maxLength: 500 },
  username: { maxLength: 100 },
};

export const sanitizeContent = (text, type = 'comment') => {
  if (!text || typeof text !== 'string') {
    return { valid: true, sanitized: '' };
  }

  const config = CONTENT_CONFIG[type] || CONTENT_CONFIG.comment;

  let sanitized = text.trim();

  // Length check
  if (sanitized.length > config.maxLength) {
    return { valid: false, error: `Text exceeds maximum length of ${config.maxLength} characters` };
  }

  // Remove dangerous HTML tags entirely (not just escape — strip them)
  sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  sanitized = sanitized.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
  sanitized = sanitized.replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '');
  sanitized = sanitized.replace(/<embed[^>]*>[\s\S]*?<\/embed>/gi, '');
  sanitized = sanitized.replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=/gi, ''); // Remove event handlers like onclick=

  // Escape remaining HTML entities (order matters: & last)
  sanitized = sanitized
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/&/g, '&amp;');

  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return { valid: true, sanitized };
};
```

**Step 3 — Apply to comment submission in ListingDetail.jsx:**

```js
// In postComment(), replace line 440:
const sanitized = sanitizeContent(newComment, 'comment');
if (!sanitized.valid) {
  alert(sanitized.error);
  return;
}

const payload = {
  listing_id: Number(id),
  userid: user.id,
  content: sanitized.sanitized,  // Use sanitized version
};
```

**Step 4 — Apply to listing form fields in AddListing.jsx:**

```js
// In handleSubmit(), before the insert:
const { sanitizeContent } from '../utils/contentSanitizer';

const sanitizedMake = sanitizeContent(formData.Make, 'listing');
const sanitizedModel = sanitizeContent(formData.Model, 'listing');

if (!sanitizedMake.valid || !sanitizedModel.valid) {
  throw new Error('Invalid input in listing fields');
}

// Use sanitizedMake.sanitized and sanitizedModel.sanitized in the insert
```

### Verification
- Submit a comment with `<script>alert('xss')</script>` — it should render as escaped text, not execute
- Submit a listing with `<iframe src="evil.com">` — tags should be stripped
- Check database directly — stored content should be sanitized, not raw HTML
- Test notification messages — no HTML injection possible

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

## P0-4: Add Content Security Policy (CSP) Headers

**Effort:** 1 hour
**Impact:** Security baseline, prevents XSS execution even if injection occurs
**Files:** `public/_headers` (new), `netlify.toml`

### Why It's Not Rated Higher
Zero CSP configuration exists. No `<meta>` tag in `index.html`, no headers in `netlify.toml`. Any injected `<script>` executes, inline scripts are allowed, resources can load from any domain.

### Future Impact
- As the app grows and more contributors add code, attack surface expands
- Third-party scripts (analytics, ads, widgets) could be injected by compromised dependencies
- Compliance requirements (GDPR, PCI-DSS) often mandate CSP
- Browser security features like Trusted Types can't be enabled without CSP baseline

### Implementation Plan

**Step 1 — Create `public/_headers`:**

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-XSS-Protection: 0
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

**Note on CSP directives:**
- `'unsafe-inline'` is required for React's inline styles and Vite's HMR in dev
- `'unsafe-eval'` is NOT included — remove it entirely from any existing config
- `connect-src` restricts API calls to your Supabase project only
- `frame-ancestors: 'none'` prevents clickjacking
- `Permissions-Policy` disables unused browser features

**Step 2 — Tighten for production (post-launch):**

Once you've audited all inline scripts, create a production-specific CSP:

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

This removes `'unsafe-inline'` from scripts, requiring all JS to be in bundled files (which Vite already does for production builds).

### Verification
- Open DevTools → Console, check for CSP violation warnings
- Try injecting `<script>alert(1)</script>` via browser console — should be blocked
- Run a CSP scanner (like `csp-evaluator` from Google) against your deployed site
- Verify no functionality breaks (images load, API calls work, realtime connects)

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

## P0-5: Add Database Constraints for Data Integrity

**Effort:** 2 hours
**Impact:** Server-side validation that cannot be bypassed
**Files:** Supabase SQL Editor

### Why It's Not Rated Higher
Every validation in the app is client-side. A user can open DevTools, copy the Supabase anon key, and insert any data directly into any table via `curl` or a script. The `place_bid` RPC protects bids, but listings, comments, notifications, bookmarks, likes, and activities all go through direct `.insert()` calls.

### Future Impact
- Data corruption: malicious or buggy clients insert invalid data that breaks the UI
- Business logic bypass: someone could manipulate prices or create fake listings
- Financial risk in a real auction platform: price manipulation, fake bids
- No safety net if client-side validation has bugs

### Implementation Plan

Run these in Supabase SQL Editor:

```sql
-- Listings: price constraints
ALTER TABLE listings ADD CONSTRAINT chk_positive_starting_price
  CHECK (StartingPrice > 0);

ALTER TABLE listings ADD CONSTRAINT chk_positive_reserve_price
  CHECK (ReservePrice > 0);

ALTER TABLE listings ADD CONSTRAINT chk_current_price_positive
  CHECK (CurrentPrice >= StartingPrice);

ALTER TABLE listings ADD CONSTRAINT chk_max_bid_amount
  CHECK (CurrentPrice < 1000000000);

-- Listings: year constraints
ALTER TABLE listings ADD CONSTRAINT chk_valid_year
  CHECK (Year BETWEEN 1900 AND EXTRACT(YEAR FROM NOW()) + 1);

-- Listings: text field length limits
ALTER TABLE listings ADD CONSTRAINT chk_make_length
  CHECK (char_length(Make) <= 100 AND char_length(Make) > 0);

ALTER TABLE listings ADD CONSTRAINT chk_model_length
  CHECK (char_length(Model) <= 150 AND char_length(Model) > 0);

ALTER TABLE listings ADD CONSTRAINT chk_location_length
  CHECK (char_length(location) <= 100);

ALTER TABLE listings ADD CONSTRAINT chk_mileage_length
  CHECK (char_length(mileage) <= 50);

ALTER TABLE listings ADD CONSTRAINT chk_transmission_length
  CHECK (char_length(transmission) <= 100);

ALTER TABLE listings ADD CONSTRAINT chk_engine_length
  CHECK (char_length(engine) <= 150);

-- Comments: length limit
ALTER TABLE comments ADD CONSTRAINT chk_comment_length
  CHECK (char_length(content) <= 2000 AND char_length(content) > 0);

-- Bid history: amount constraints
ALTER TABLE bid_history ADD CONSTRAINT chk_bid_amount_positive
  CHECK (amount > 0);

ALTER TABLE bid_history ADD CONSTRAINT chk_bid_amount_max
  CHECK (amount < 1000000000);

-- Notifications: length limit
ALTER TABLE notifications ADD CONSTRAINT chk_notification_message_length
  CHECK (char_length(message) <= 500);

-- Users: name length limits
ALTER TABLE users ADD CONSTRAINT chk_firstname_length
  CHECK (char_length(firstname) <= 100);

ALTER TABLE users ADD CONSTRAINT chk_lastname_length
  CHECK (char_length(lastname) <= 100);
```

### Verification
- Try inserting a listing with `Year: 9999` via Supabase dashboard — should fail
- Try inserting a comment with 3,000 characters — should fail
- Try inserting a bid with negative amount — should fail
- Confirm existing valid data passes all constraints (run `SELECT * FROM listings WHERE Year > 2030;` to check)

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

# PRIORITY 1 — This Week

---

## P1-1: Add Database Indexes

**Effort:** 2 hours
**Impact:** 10x faster queries on filtered listings
**Files:** Supabase SQL Editor

### Why It's Not Rated Higher
Without indexes, every query does a full table scan. On 10,000 listings, `WHERE status = 'active' AND verified = true` scans all 10,000 rows. Query time grows linearly with data size.

### Future Impact
- At 100,000 listings, the AuctionFloor query could take 5-10 seconds
- Supabase compute usage spikes, potentially hitting plan limits
- Database CPU becomes the bottleneck before anything else

### Implementation Plan

```sql
-- Most impactful: covers the AuctionFloor query
CREATE INDEX idx_listings_active_verified_created
  ON listings(status, verified, created_at DESC)
  WHERE status = 'active' AND verified = true;

-- Search filters
CREATE INDEX idx_listings_make ON listings(Make) WHERE status = 'active';
CREATE INDEX idx_listings_model ON listings(Model) WHERE status = 'active';
CREATE INDEX idx_listings_price ON listings(CurrentPrice) WHERE status = 'active';
CREATE INDEX idx_listings_year ON listings(Year) WHERE status = 'active';

-- Listing detail page
CREATE INDEX idx_likes_listing ON likes(listing_id);
CREATE INDEX idx_bookmarks_listing ON bookmarks(listing_id);
CREATE INDEX idx_comments_listing ON comments(listing_id, created_at DESC);
CREATE INDEX idx_bid_history_listing ON bid_history(listing_id, created_at DESC);
CREATE INDEX idx_comment_likes_comment ON comment_likes(comment_id);

-- Notifications
CREATE INDEX idx_notifications_recipient_read
  ON notifications(recipient_id, is_read, created_at DESC);

-- Trending calculations
CREATE INDEX idx_likes_created ON likes(created_at DESC);
CREATE INDEX idx_comments_created ON comments(created_at DESC);
CREATE INDEX idx_bid_history_created ON bid_history(created_at DESC);

-- Dashboard queries
CREATE INDEX idx_listings_user ON listings(userid, created_at DESC);
CREATE INDEX idx_bookmarks_user ON bookmarks(userid, listing_id);
CREATE INDEX idx_bid_history_user ON bid_history(userid, created_at DESC);

-- Admin queries
CREATE INDEX idx_users_created ON users(created_at DESC);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_seller_verified ON users(seller_verified);
```

**Monitor index usage after 30 days:**

```sql
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY tablename, indexname;
```

Drop any index with 0 scans after a month of production traffic.

### Verification
- Run `EXPLAIN ANALYZE` on the AuctionFloor query before and after — should show "Index Scan" instead of "Seq Scan"
- AuctionFloor page load time should improve noticeably
- Check `pg_stat_user_indexes` to confirm indexes are being used

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

## P1-2: Code Splitting with React.lazy

**Effort:** 2 hours
**Impact:** 40-60% reduction in initial bundle size
**Files:** `src/App.jsx`

### Why It's Not Rated Higher
`App.jsx` imports all 16+ page components at the top level. Vite bundles everything into a single JavaScript file. The initial download includes admin panel code (needed by <1% of users), AddListing code (needed only when creating a listing), etc.

### Future Impact
- Initial bundle size grows with every new page
- First Contentful Paint delayed by unnecessary code download
- Mobile users on 3G pay for data they'll never use
- Lighthouse performance score drops

### Implementation Plan

**Step 1 — Replace static imports with lazy imports in App.jsx:**

```jsx
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

// Lazy-loaded pages
const Home = lazy(() => import('./Pages/Home'));
const AuctionFloor = lazy(() => import('./Pages/AuctionFloor'));
const SignUpPage = lazy(() => import('./Pages/SignUpPage'));
const AuthCallback = lazy(() => import('./Pages/AuthCallback'));
const ListingDetail = lazy(() => import('./Pages/ListingDetail'));
const Trending = lazy(() => import('./Pages/Trending'));
const Notifications = lazy(() => import('./Pages/Notifications'));
const Dashboard = lazy(() => import('./Pages/Dashboard'));
const AddListing = lazy(() => import('./Pages/AddListing'));
const MyListings = lazy(() => import('./Pages/MyListings'));
const ActivityTracking = lazy(() => import('./Pages/ActivityTracking'));
const PersonalizedFeed = lazy(() => import('./Pages/PersonalizedFeed'));
const Profile = lazy(() => import('./Pages/Profile'));
const AdminLayout = lazy(() => import('./Pages/Admin/AdminLayout'));
const Overview = lazy(() => import('./Pages/Admin/Overview'));
const ListingManagement = lazy(() => import('./Pages/Admin/ListingManagement'));
const UserManagement = lazy(() => import('./Pages/Admin/UserManagement'));
const Reports = lazy(() => import('./Pages/Admin/Reports'));
const ActionLog = lazy(() => import('./Pages/Admin/ActionLog'));
const BannedKeywords = lazy(() => import('./Pages/Admin/BannedKeywords'));

// Guards (keep as static imports — they're small and always needed)
import SecureRoute from './Modules/SecureRoute';
import AdminRoute from './Modules/AdminRoute';

// Loading fallback
const PageLoader = () => (
  <div style={{
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0d14',
    color: '#9CA3AF',
    fontSize: '14px',
  }}>
    <div style={{
      width: '32px',
      height: '32px',
      border: '2px solid #6b82ff',
      borderTopColor: 'transparent',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
    <span style={{ marginLeft: '12px' }}>Loading...</span>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/auction-floor" element={<AuctionFloor />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/listing/:id" element={<ListingDetail />} />
        <Route path="/trending" element={<Trending />} />
        <Route path="/live-feed" element={<Navigate to="/personalized-feed" replace />} />

        {/* Auth-protected */}
        <Route path="/personalized-feed" element={<SecureRoute><PersonalizedFeed /></SecureRoute>} />
        <Route path="/dashboard" element={<SecureRoute><Dashboard /></SecureRoute>} />
        <Route path="/add-listing" element={<SecureRoute><AddListing /></SecureRoute>} />
        <Route path="/my-listings" element={<SecureRoute><MyListings /></SecureRoute>} />
        <Route path="/profile" element={<SecureRoute><Profile /></SecureRoute>} />
        <Route path="/dashboard/notifications" element={<SecureRoute><Notifications /></SecureRoute>} />
        <Route path="/dashboard/activity" element={<SecureRoute><ActivityTracking /></SecureRoute>} />

        {/* Admin */}
        <Route path="/admin" element={<AdminRoute minRole="support_agent"><AdminLayout /></AdminRoute>}>
          <Route index element={<Overview />} />
          <Route path="listings" element={<ListingManagement />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="reports" element={<Reports />} />
          <Route path="log" element={<AdminRoute minRole="admin"><ActionLog /></AdminRoute>} />
          <Route path="keywords" element={<AdminRoute minRole="moderator"><BannedKeywords /></AdminRoute>} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
```

**Step 2 — Add route preloading on hover (optional but recommended):**

```jsx
// Add this utility
const preloadRoute = (importFn) => {
  let loaded = false;
  return () => {
    if (!loaded) {
      loaded = true;
      importFn();
    }
  };
};

// Usage: preload on hover for links
const preloadListingDetail = preloadRoute(() => import('./Pages/ListingDetail'));
// <Link to={`/listing/${id}`} onMouseEnter={preloadListingDetail}>
```

### Verification
- Run `npm run build` and check the `dist/assets/` directory — should see multiple JS chunks instead of one
- Initial chunk should be <100KB (gzipped)
- Open Network tab, navigate to home page — only Home chunk loads
- Click "Auction Floor" — AuctionFloor chunk loads on demand
- Lighthouse score for Performance should improve

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

## P1-3: Image Optimization with Supabase Transformations

**Effort:** 2 hours
**Impact:** 80% reduction in image bandwidth, faster page loads
**Files:** `src/Modules/AuctionCard.jsx`, `src/Pages/Home.jsx`, `src/Pages/ListingDetail.jsx`

### Why It's Not Rated Higher
Images are uploaded as JPEG at 1920x1080 (good compression), but served at full resolution everywhere. AuctionFloor thumbnails display 1920px images at 300px. A page with 20 listing cards downloads 20 × 1920px images = ~40MB of unnecessary data.

### Future Impact
- Mobile users download desktop-sized images
- Bandwidth costs scale with image size, not display size
- Page load time dominated by image downloads
- High bounce rate on slow connections

### Implementation Plan

**Step 1 — Verify bucket is public or use public URLs:**

Check your Supabase Storage bucket `Images` settings. If it's public, use Supabase Image Transformations directly. If it's private, you'll need to either:
- Make it public with unguessable paths (you already use random prefixes — this is safe)
- Or generate signed URLs with transformation parameters

**Step 2 — Add transformations to all image displays:**

```jsx
// In AuctionCard.jsx — thumbnails
<img
  src={`${listing.ImageURL}?width=400&height=300&resize=cover&quality=80`}
  alt={`${listing.Make} ${listing.Model}`}
  loading="lazy"
/>

// In Home.jsx — trending cards
<img
  src={`${car.ImageURL}?width=300&height=200&resize=cover&quality=75`}
  alt={`${car.Make} ${car.Model}`}
  loading="lazy"
/>

// In ListingDetail.jsx — main image
<img
  src={`${allImages[activeImageIndex]}?width=1200&height=800&resize=cover&quality=90`}
  alt={listing.Model}
/>

// In ListingDetail.jsx — thumbnails
<img
  src={`${url}?width=100&height=75&resize=cover&quality=60`}
  alt={`View ${i + 1}`}
  loading="lazy"
/>
```

**Step 3 — Add responsive images for the main listing image:**

```jsx
<img
  srcSet={`
    ${url}?width=400&quality=75 400w,
    ${url}?width=800&quality=80 800w,
    ${url}?width=1200&quality=90 1200w
  `}
  sizes="(max-width: 640px) 400px, (max-width: 1024px) 800px, 1200px"
  src={`${url}?width=800&quality=80`}
  alt={listing.Model}
  loading="lazy"
/>
```

**Step 4 — Add `loading="lazy"` to all images below the fold:**

Search for all `<img>` tags and add `loading="lazy"` except for above-the-fold images (hero, main listing image on first paint).

### Verification
- Network tab: thumbnail requests should show query parameters `?width=400&height=300...`
- Image payload per thumbnail: ~30-50KB instead of ~500KB-2MB
- Page with 20 thumbnails: ~1MB total instead of ~40MB
- First Contentful Paint: should improve by 1-2 seconds on mobile

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

## P1-4: Control Infinite Scroll Memory Growth

**Effort:** 1 day
**Impact:** Prevents memory leaks and janky scrolling at depth
**Files:** `src/Pages/AuctionFloor.jsx`, `src/utils/queryClient.js`

### Why It's Not Rated Higher
`useInfiniteQuery` with `gcTime: 5 * 60 * 1000` keeps all loaded pages in memory. At 50 pages scrolled (1,000 listings), all 1,000 cards are rendered in the DOM simultaneously. Each card has images, timers, event listeners, and React component instances.

### Future Impact
- Memory usage grows linearly with scroll depth
- At 500+ listings in DOM, scrolling becomes janky (60fps → 30fps)
- Mobile browsers may kill the tab due to memory pressure
- React reconciliation slows as the component tree grows

### Implementation Plan

**Note:** Virtualization (`@tanstack/react-virtual`) is NOT recommended for CSS grid layouts — it breaks the grid structure and adds complexity. Instead, use cache management:

**Step 1 — Reduce gcTime and add maxPages for infinite queries:**

```js
// In AuctionFloor.jsx, update the useInfiniteQuery config:

const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error, refetch } = useInfiniteQuery({
  queryKey: ['listings', 'auction', filters],
  queryFn: async ({ pageParam = null }) => {
    // ... existing query logic
  },
  getNextPageParam: (lastPage) => lastPage.nextCursor,
  initialPageParam: null,
  staleTime: 30 * 1000,
  gcTime: 2 * 60 * 1000,        // Reduced from 5 min to 2 min
  maxPages: 10,                  // Keep only last 10 pages in cache (200 listings)
  refetchOnWindowFocus: false,
  retry: 2,
});
```

**Step 2 — Implement a "Load More" button instead of pure infinite scroll (optional):**

For better memory control, replace the IntersectionObserver with explicit "Load More" buttons:

```jsx
// Replace the IntersectionObserver logic with:
{hasNextPage && (
  <button
    onClick={() => fetchNextPage()}
    disabled={isFetchingNextPage}
    className={styles.loadMoreBtn}
  >
    {isFetchingNextPage ? 'Loading...' : 'Load More Vehicles'}
  </button>
)}
```

**Step 3 — Add a "Back to Top" button that clears cache:**

```jsx
const handleBackToTop = () => {
  // Clear the query cache to free memory
  queryClient.removeQueries({ queryKey: ['listings', 'auction', filters] });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  refetch();
};
```

### Verification
- Scroll through 20+ pages, check browser memory usage — should plateau, not grow indefinitely
- Memory profiler shows <200 listing cards in DOM at any time
- Scrolling remains smooth (60fps) at any depth
- No tab crashes on mobile after extended scrolling

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

## P1-5: Sanitize Comment Content

**Effort:** 1 hour
**Impact:** Prevents stored XSS via comments
**Files:** `src/Pages/ListingDetail.jsx`, `src/utils/contentSanitizer.js` (from P0-3)

### Why It's Not Rated Higher
`ListingDetail.jsx:437-446` inserts `newComment` directly into the database without sanitization. While React's JSX auto-escaping protects against basic XSS in the comment display, the same content is stored in `activities.metadata` and `notifications.message`, which may be rendered differently by other components or systems.

### Future Impact
- Polyglot XSS: content safe in React JSX becomes dangerous in email notifications, admin dashboards, or mobile app WebViews
- Data integrity: null bytes, control characters, or extremely long comments could break downstream systems
- Compliance: user-generated content without sanitization fails basic security audits

### Implementation Plan

This is covered by P0-3 (Fix XSS Vulnerability). Once `contentSanitizer.js` is created, apply it to the comment submission:

```js
// In ListingDetail.jsx, postComment function:

import { sanitizeContent } from '../utils/contentSanitizer';

const postComment = async () => {
  if (!user) return showAuthPrompt('Log in to join the discussion on this vehicle.');
  if (!newComment.trim()) return;

  // Sanitize before submission
  const sanitized = sanitizeContent(newComment, 'comment');
  if (!sanitized.valid) {
    alert(sanitized.error);
    return;
  }

  try {
    const payload = {
      listing_id: Number(id),
      userid: user.id,
      content: sanitized.sanitized,  // Use sanitized content
    };
    if (replyingTo) {
      payload.parent_id = replyingTo.id;
    }

    const { data, error } = await supabase.from('comments').insert(payload).select().single();
    // ... rest of the function
  } catch(err) { alert(err.message); }
};
```

### Verification
- Submit a comment with `<script>alert('xss')</script>` — should be stored as escaped text
- Submit a comment with 3,000 characters — should be rejected with error message
- Check database directly — stored content should be sanitized
- Verify comment displays correctly in the UI

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

# PRIORITY 2 — This Month

---

## P2-1: Harden Row-Level Security (RLS) Policies

**Effort:** 1 day
**Impact:** Prevents privilege escalation and data manipulation
**Files:** Supabase SQL Editor

### Why It's Not Rated Higher
RLS policies are the last line of defense between the client and the database. If any policy has a gap, a malicious user with the anon key can access or modify any data. Currently, there's no explicit policy preventing users from setting their own admin role or inserting notifications for other users.

### Future Impact
- Privilege escalation: user sets `role: 'super_admin'` directly
- Data manipulation: user inserts notifications, activities, or bids for other users
- Complete database compromise if RLS is misconfigured

### Implementation Plan

```sql
-- Prevent users from changing their own role
CREATE POLICY users_cannot_change_own_role ON users
  FOR UPDATE
  USING (
    userid = auth.uid()
    AND role IS NOT DISTINCT FROM (SELECT role FROM users WHERE userid = auth.uid())
  );

-- Prevent users from inserting notifications for other users
CREATE POLICY users_cannot_fake_notifications ON notifications
  FOR INSERT
  WITH CHECK (actor_id = auth.uid());

-- Prevent users from inserting activities for other users
CREATE POLICY users_cannot_fake_activities ON activities
  FOR INSERT
  WITH CHECK (userid = auth.uid());

-- Prevent users from updating other users' profiles
CREATE POLICY users_can_only_update_own_profile ON users
  FOR UPDATE
  USING (userid = auth.uid());

-- Prevent users from deleting other users' comments
CREATE POLICY users_can_only_delete_own_comments ON comments
  FOR DELETE
  USING (userid = auth.uid());

-- Prevent users from updating other users' listings
CREATE POLICY users_can_only_update_own_listings ON listings
  FOR UPDATE
  USING (userid = auth.uid());

-- Admin-only policies (require role check)
CREATE POLICY admin_can_update_any_role ON users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE userid = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Ensure bid_history can only be inserted via RPC (no direct inserts)
ALTER TABLE bid_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY no_direct_bid_inserts ON bid_history
  FOR INSERT
  WITH CHECK (false);  -- Blocks all direct inserts, only RPC works

-- Allow reads on bid_history
CREATE POLICY anyone_can_read_bids ON bid_history
  FOR SELECT
  USING (true);
```

### Verification
- Try updating your own role via Supabase dashboard — should fail
- Try inserting a notification with a different `actor_id` — should fail
- Try inserting a bid directly (not via RPC) — should fail
- Confirm normal operations still work (users can update own profile, post own comments, etc.)

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

## P2-2: Implement Notification Cleanup (Hard Delete)

**Effort:** 2 hours
**Impact:** Prevents unbounded table growth, keeps queries fast
**Files:** Supabase SQL Editor, Supabase Dashboard (cron setup)

### Why It's Not Rated Higher
The `notifications` table only grows. After 1 year of moderate usage: ~2,000,000 rows. Query performance degrades, backup times increase, storage costs grow. Soft deletes complicate every query — hard deletes are cleaner.

### Future Impact
- Query performance degrades as tables grow
- Backup/restore times increase
- Storage costs grow linearly
- `count: 'exact'` queries on large tables become slow

### Implementation Plan

**Step 1 — Set up a cron job to delete old notifications:**

In Supabase Dashboard → Database → Cron Jobs:

```sql
-- Delete notifications older than 90 days
-- Run daily at 3 AM
DELETE FROM notifications
WHERE created_at < NOW() - INTERVAL '90 days';
```

**Step 2 — For bid_history and activities, implement the same pattern:**

```sql
-- Delete bid history older than 1 year (run monthly)
DELETE FROM bid_history
WHERE created_at < NOW() - INTERVAL '1 year';

-- Delete activities older than 6 months (run weekly)
DELETE FROM activities
WHERE created_at < NOW() - INTERVAL '6 months';
```

**Step 3 — When tables exceed 1 million rows, implement partitioning:**

```sql
-- Only do this when bid_history exceeds 1M rows
-- Create partitioned table
CREATE TABLE bid_history_new (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id bigint NOT NULL,
  userid uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE bid_history_2026_04 PARTITION OF bid_history_new
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE bid_history_2026_05 PARTITION OF bid_history_new
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- Migrate data (do this during low-traffic period)
INSERT INTO bid_history_new SELECT * FROM bid_history;

-- Rename tables
ALTER TABLE bid_history RENAME TO bid_history_old;
ALTER TABLE bid_history_new RENAME TO bid_history;

-- Drop old table after verification
DROP TABLE bid_history_old;
```

### Verification
- Check table row counts before and after cleanup
- Query performance on notifications table should improve
- Cron job runs successfully (check Supabase logs)
- No data loss for recent notifications (last 90 days intact)

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

## P2-3: Add Unit Tests for Core Utilities

**Effort:** 2 days
**Impact:** Catch regressions, enable safe refactoring
**Files:** `src/utils/bidValidation.test.js`, `src/utils/imageSecurity.test.js`, `src/utils/contentSanitizer.test.js`, `vitest.config.js` (new)

### Why It's Not Rated Higher
Zero tests exist. No unit tests, no integration tests, no E2E tests. Every change could break existing functionality without anyone knowing. Developers avoid improving code because they can't verify it still works.

### Future Impact
- Regression risk: every change could break existing functionality
- Refactoring fear: developers avoid improving code
- Onboarding cost: new developers learn by breaking things
- Deployment anxiety: every release is a gamble

### Implementation Plan

**Step 1 — Install testing dependencies:**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**Step 2 — Add test scripts to package.json:**

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Step 3 — Create vitest.config.js:**

```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
});
```

**Step 4 — Create test setup file:**

```js
// src/test/setup.js
import '@testing-library/jest-dom';
```

**Step 5 — Write tests for bidValidation.js:**

```js
// src/utils/bidValidation.test.js
import { describe, it, expect } from 'vitest';
import { sanitizeBidAmount, formatZAR, sanitizeBidMetadata, checkBidRateLimit, getDynamicMinBid } from './bidValidation';

describe('sanitizeBidAmount', () => {
  it('rejects null/undefined/empty input', () => {
    expect(sanitizeBidAmount(null, 1000)).toEqual({ valid: false, error: 'Bid amount is required' });
    expect(sanitizeBidAmount(undefined, 1000)).toEqual({ valid: false, error: 'Bid amount is required' });
    expect(sanitizeBidAmount('', 1000)).toEqual({ valid: false, error: 'Bid amount is required' });
  });

  it('rejects negative bids', () => {
    expect(sanitizeBidAmount(-100, 1000)).toEqual({ valid: false, error: 'Bid must be greater than zero' });
  });

  it('rejects bids exceeding maximum', () => {
    expect(sanitizeBidAmount(1000000000, 1000)).toEqual({ valid: false, error: expect.stringContaining('exceeds maximum') });
  });

  it('rejects bids with too many decimal places', () => {
    expect(sanitizeBidAmount(1000.123, 1000)).toEqual({ valid: false, error: expect.stringContaining('decimal places') });
  });

  it('enforces minimum increment', () => {
    const result = sanitizeBidAmount(1000, 1000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least');
  });

  it('accepts valid bid above minimum increment', () => {
    const result = sanitizeBidAmount(15000, 10000);
    expect(result.valid).toBe(true);
    expect(result.amount).toBe(15000);
  });

  it('rounds to 2 decimal places', () => {
    const result = sanitizeBidAmount(1000.555, 0);
    expect(result.valid).toBe(true);
    expect(result.amount).toBe(1000.56);
  });

  it('strips non-numeric characters', () => {
    const result = sanitizeBidAmount('abc1000def', 0);
    expect(result.valid).toBe(true);
    expect(result.amount).toBe(1000);
  });
});

describe('formatZAR', () => {
  it('formats positive amounts', () => {
    expect(formatZAR(1000)).toBe('R\u00A01\u2009000,00');
  });

  it('handles null/undefined', () => {
    expect(formatZAR(null)).toBe('R \u2014');
    expect(formatZAR(undefined)).toBe('R \u2014');
  });

  it('handles NaN', () => {
    expect(formatZAR(NaN)).toBe('R \u2014');
  });
});

describe('getDynamicMinBid', () => {
  it('returns R5,000 for prices below R100,000', () => {
    expect(getDynamicMinBid(50000)).toBe(5000);
  });

  it('returns R10,000 for prices R100,000-R999,999', () => {
    expect(getDynamicMinBid(500000)).toBe(10000);
  });

  it('returns R20,000 for prices R1,000,000-R2,999,999', () => {
    expect(getDynamicMinBid(2000000)).toBe(20000);
  });

  it('returns R50,000 for prices R3,000,000+', () => {
    expect(getDynamicMinBid(5000000)).toBe(50000);
  });
});

describe('checkBidRateLimit', () => {
  it('allows first bid', () => {
    const result = checkBidRateLimit('user1', 'listing1');
    expect(result.allowed).toBe(true);
  });

  it('blocks after 10 bids in 1 minute', () => {
    // This test is tricky due to the closure-based Map
    // Consider refactoring to expose the Map for testing
  });
});
```

**Step 6 — Write tests for contentSanitizer.js:**

```js
// src/utils/contentSanitizer.test.js
import { describe, it, expect } from 'vitest';
import { sanitizeContent } from './contentSanitizer';

describe('sanitizeContent', () => {
  it('handles null/undefined/empty input', () => {
    expect(sanitizeContent(null)).toEqual({ valid: true, sanitized: '' });
    expect(sanitizeContent(undefined)).toEqual({ valid: true, sanitized: '' });
    expect(sanitizeContent('')).toEqual({ valid: true, sanitized: '' });
  });

  it('strips script tags', () => {
    const result = sanitizeContent('<script>alert("xss")</script>Hello', 'comment');
    expect(result.valid).toBe(true);
    expect(result.sanitized).not.toContain('<script>');
    expect(result.sanitized).toContain('Hello');
  });

  it('strips iframe tags', () => {
    const result = sanitizeContent('<iframe src="evil.com"></iframe>Content', 'comment');
    expect(result.valid).toBe(true);
    expect(result.sanitized).not.toContain('<iframe>');
  });

  it('removes event handlers', () => {
    const result = sanitizeContent('<img onclick="alert(1)">', 'comment');
    expect(result.sanitized).not.toContain('onclick');
  });

  it('escapes HTML entities', () => {
    const result = sanitizeContent('<b>bold</b>', 'comment');
    expect(result.sanitized).toBe('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('rejects content exceeding max length', () => {
    const longText = 'a'.repeat(2001);
    const result = sanitizeContent(longText, 'comment');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('2000');
  });

  it('removes null bytes and control characters', () => {
    const result = sanitizeContent('Hello\x00World\x01Test', 'comment');
    expect(result.sanitized).toBe('HelloWorldTest');
  });
});
```

### Verification
- Run `npm test` — all tests pass
- Run `npm run test:coverage` — aim for >80% coverage on utility files
- Tests run in CI pipeline (after P2-4 is set up)
- Refactor a utility function, confirm tests catch the breakage

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

## P2-4: Set Up CI/CD Pipeline

**Effort:** 1 day
**Impact:** Automated quality gates, no broken deployments
**Files:** `.github/workflows/ci.yml` (new)

### Why It's Not Rated Higher
Deployment is manual. No automated linting, testing, build verification, or preview deployments. Broken code can reach production. No rollback mechanism.

### Future Impact
- Broken code deployed to production
- No preview of changes before merging
- Inconsistent deployment process across team members
- No automated quality checks

### Implementation Plan

**Step 1 — Create `.github/workflows/ci.yml`:**

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run test:run

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: dist/

  deploy:
    name: Deploy
    needs: [lint, test, build]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: build-output
          path: dist/
      - uses: nwtgck/actions-netlify@v3
        with:
          publish-dir: './dist'
          production-branch: main
          github-token: ${{ secrets.GITHUB_TOKEN }}
          deploy-message: 'Deploy from GitHub Actions'
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

**Step 2 — Add Netlify secrets to GitHub:**

Go to your repo → Settings → Secrets and variables → Actions → Add:
- `NETLIFY_AUTH_TOKEN`: Get from Netlify dashboard (User settings → Applications → Personal access tokens)
- `NETLIFY_SITE_ID`: Get from Netlify dashboard (Site settings → General → Site details)

**Step 3 — Enable preview deployments for PRs:**

The workflow above automatically creates preview deployments for pull requests. Each PR gets a unique URL for review before merging.

### Verification
- Push a branch — CI runs lint, test, and build
- Open a PR — preview deployment URL appears in PR comments
- Merge to main — automatic production deployment
- Break a test — CI fails, merge is blocked

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

# PRIORITY 3 — Next Quarter

---

## P3-1: Break ListingDetail into Smaller Components

**Effort:** 3 days
**Impact:** Maintainability, testability, performance
**Files:** `src/Pages/ListingDetail.jsx` → new component files

### Why It's Not Rated Higher
A 1,023-line component with 20+ state variables and 15+ functions. Changing one feature (comments) can break another (bids) due to shared state. New developers take days to understand it. Unit testing is nearly impossible.

### Future Impact
- Bug risk: shared state causes cross-feature breakage
- Onboarding: new developers struggle with the monolith
- Testing: impossible to unit test in isolation
- Performance: every state change re-renders the entire tree

### Implementation Plan

**Directory structure:**

```
src/Pages/ListingDetail/
├── index.jsx              (orchestrator, ~100 lines)
├── ListingHeader.jsx      (title, heat, bookmark, share, report)
├── ImageGallery.jsx       (main image, thumbnails, navigation)
├── SpecsBanner.jsx        (year, mileage, engine, transmission, location)
├── BidPanel/
│   ├── index.jsx          (current price, time left, bid input)
│   ├── BidInput.jsx       (amount input, validation display)
│   └── BidHistory.jsx     (recent bids, full history modal)
├── Comments/
│   ├── index.jsx          (comment list, input, expand/collapse)
│   ├── CommentNode.jsx    (single comment + replies)
│   └── CommentInput.jsx   (textarea, reply banner, post button)
└── CuratorsNote.jsx       (static description panel)
```

**Custom hooks layer:**

```
src/hooks/
├── useListingDetail.js    (RPC call for listing data)
├── useBidSubmission.js    (bid validation, rate limiting, RPC call)
├── useCommentActions.js   (post, reply, like, delete comments)
├── useBookmarkToggle.js   (bookmark/unbookmark)
├── useHeatToggle.js       (like/unlike listing)
└── useTimeRemaining.js    (countdown timer)
```

**Orchestrator pattern:**

```jsx
// src/Pages/ListingDetail/index.jsx
const ListingDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: detail, isLoading } = useListingDetail(id, user?.id);
  const { mutate: submitBid } = useBidSubmission(id);
  const { mutate: postComment } = useCommentActions(id);
  const { mutate: toggleBookmark } = useBookmarkToggle(id, user?.id);
  const { mutate: toggleHeat } = useHeatToggle(id, user?.id);

  if (isLoading) return <LoadingScreen />;
  if (!detail?.listing) return <NotFound />;

  return (
    <div className={styles.pageWrapper}>
      <UniversalHeader />
      <ListingHeader
        listing={detail.listing}
        isLiked={detail.is_liked}
        isBookmarked={detail.is_bookmarked}
        likesCount={detail.likes_count}
        onHeat={toggleHeat}
        onBookmark={toggleBookmark}
      />
      <ImageGallery images={getImageUrls(detail.listing)} />
      <SpecsBanner listing={detail.listing} />
      <BidPanel
        listing={detail.listing}
        bidHistory={detail.bid_history}
        onBid={submitBid}
        isOwner={user?.id === detail.listing.userid}
      />
      <Comments
        listing={detail.listing}
        comments={detail.comments}
        onComment={postComment}
        currentUserId={user?.id}
      />
      <CuratorsNote listing={detail.listing} />
    </div>
  );
};
```

### Verification
- All existing functionality works after refactoring
- Each component can be rendered in isolation (Storybook or test)
- Lighthouse Performance score improves (smaller component trees re-render)
- New developer can understand a single component in <30 minutes

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

## P3-2: Implement Edge Functions for Critical Operations

**Effort:** 1 week
**Impact:** Server-side validation, rate limiting, API layer foundation
**Files:** `supabase/functions/place-bid/index.ts` (new), `supabase/functions/create-listing/index.ts` (new)

### Why It's Not Rated Higher
Currently all operations go directly from client to Supabase. An Edge Function layer adds server-side validation, rate limiting, and a foundation for future API growth. Only implement when you observe actual abuse patterns or need complex business logic.

### Future Impact
- Without it: client-side only validation, vulnerable to bypass
- With it: centralized business logic, rate limiting, audit logging
- Foundation for future microservices

### Implementation Plan

**Step 1 — Install Supabase CLI:**

```bash
npm install -D supabase
npx supabase init
npx supabase functions new place-bid
```

**Step 2 — Create the place-bid Edge Function:**

```ts
// supabase/functions/place-bid/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { listingId, bidAmount } = await req.json();

    // Validate input
    if (!listingId || !bidAmount) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (bidAmount <= 0 || bidAmount > 999999999.99) {
      return new Response(
        JSON.stringify({ error: 'Invalid bid amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting: check recent bids (last 60 seconds)
    const { count: recentBids } = await supabase
      .from('bid_history')
      .select('*', { count: 'exact', head: true })
      .eq('userid', user.id)
      .eq('listing_id', listingId)
      .gte('created_at', new Date(Date.now() - 60000).toISOString());

    if (recentBids >= 10) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please wait before bidding again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call the place_bid RPC
    const { data, error } = await supabase.rpc('place_bid', {
      p_listing_id: listingId,
      p_bid_amount: bidAmount,
      p_user_id: user.id,
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

**Step 3 — Deploy the function:**

```bash
npx supabase functions deploy place-bid --project-ref your-project-ref
```

**Step 4 — Update client to use the Edge Function:**

```js
// In ListingDetail.jsx, replace the direct RPC call:
const response = await fetch(`${supabaseUrl}/functions/v1/place-bid`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session.access_token}`,
  },
  body: JSON.stringify({
    listingId: Number(id),
    bidAmount: proposedBid,
  }),
});

const result = await response.json();
if (!response.ok) throw new Error(result.error);
```

### Verification
- Bid submission goes through Edge Function instead of direct RPC
- Rate limiting works server-side (refresh page, try again — still blocked)
- Invalid bids are rejected at the Edge Function level
- Function logs appear in Supabase Dashboard → Edge Functions → Logs

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

## P3-3: Add E2E Test for Bid Placement

**Effort:** 2 days
**Impact:** Confidence in critical user flow, regression protection
**Files:** `e2e/bid-placement.spec.js` (new), `playwright.config.js` (new)

### Why It's Not Rated Higher
Unit tests catch logic errors, but E2E tests catch integration failures — the bid flow touches authentication, validation, RPC calls, notifications, and UI updates. One E2E test for the critical path is worth 20 unit tests.

### Future Impact
- Without it: broken bid flow goes undetected until users report it
- With it: automated regression protection for the most important feature

### Implementation Plan

**Step 1 — Install Playwright:**

```bash
npm install -D @playwright/test
npx playwright install
```

**Step 2 — Create playwright.config.js:**

```js
// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 2,
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

**Step 3 — Write the bid placement test:**

```js
// e2e/bid-placement.spec.js
import { test, expect } from '@playwright/test';

test.describe('Bid Placement Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL);
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('user can place a valid bid', async ({ page }) => {
    // Navigate to a listing
    await page.goto('/auction-floor');
    await page.click('.listing-card:first-child');
    await page.waitForURL(/\/listing\/\d+/);

    // Get current price
    const currentPriceText = await page.locator('.bid-amount').textContent();
    const currentPrice = parseInt(currentPriceText.replace(/[^0-9]/g, ''));

    // Enter a valid bid (current + minimum increment)
    const validBid = currentPrice + 5000;
    await page.fill('input[placeholder="0.00"]', validBid.toString());

    // Click place bid
    await page.click('button:has-text("PLACE BID")');

    // Confirm bid in modal
    await page.click('button:has-text("CONFIRM BID")');

    // Wait for success toast
    await expect(page.locator('.bid-confirm-toast')).toBeVisible();

    // Verify bid appears in history
    await expect(page.locator('.bid-history')).toContainText(validBid.toString());
  });

  test('user cannot bid on own listing', async ({ page }) => {
    // Navigate to user's own listing
    await page.goto('/my-listings');
    await page.click('.my-listing:first-child');

    // Should see owner notice, not bid button
    await expect(page.locator('.owner-notice')).toBeVisible();
    await expect(page.locator('button:has-text("PLACE BID")')).not.toBeVisible();
  });

  test('user cannot bid on closed auction', async ({ page }) => {
    // Navigate to a closed listing
    await page.goto('/listing/closed-listing-id');

    // Should see closed message
    await expect(page.locator('.owner-notice')).toContainText('Auction has closed');
  });

  test('user cannot bid below minimum increment', async ({ page }) => {
    await page.goto('/auction-floor');
    await page.click('.listing-card:first-child');
    await page.waitForURL(/\/listing\/\d+/);

    // Enter a bid below minimum
    await page.fill('input[placeholder="0.00"]', '1');
    await page.click('button:has-text("PLACE BID")');

    // Should see error
    await expect(page.locator('.bid-error')).toBeVisible();
  });
});
```

**Step 4 — Add E2E test to CI pipeline:**

```yaml
# Add to .github/workflows/ci.yml
  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
        env:
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
```

### Verification
- Run `npx playwright test` locally — all tests pass
- Tests run in CI pipeline
- Screenshots and videos captured on failure
- Test coverage for the critical bid flow

### Status
[ ] Not started
[~] In progress
[ ] Complete

---

# QUICK REFERENCE: Priority Matrix

| Priority | Issue | Effort | Impact | Do By |
|---|---|---|---|---|
| **P0-1** | Consolidate ListingDetail queries into RPC | 2 days | 3-5x faster page load | Week 1 |
| **P0-2** | Optimize Home.jsx — stop loading all listings | 1 day | Fixes O(n) bottleneck | Week 1 |
| **P0-3** | Fix XSS vulnerability in sanitization utilities | 1 day | Prevents stored XSS | Week 1 |
| **P0-4** | Add CSP headers | 1 hour | Security baseline | Week 1 |
| **P0-5** | Add database constraints | 2 hours | Server-side validation | Week 1 |
| **P1-1** | Add database indexes | 2 hours | 10x faster queries | Week 2 |
| **P1-2** | Code splitting with React.lazy | 2 hours | 40-60% smaller bundle | Week 2 |
| **P1-3** | Image optimization with transformations | 2 hours | 80% less image bandwidth | Week 2 |
| **P1-4** | Control infinite scroll memory growth | 1 day | Prevents memory leaks | Week 2 |
| **P1-5** | Sanitize comment content | 1 hour | Prevents stored XSS | Week 2 |
| **P2-1** | Harden RLS policies | 1 day | Prevents privilege escalation | Month 1 |
| **P2-2** | Implement notification cleanup | 2 hours | Prevents unbounded growth | Month 1 |
| **P2-3** | Add unit tests for utilities | 2 days | Catch regressions | Month 1 |
| **P2-4** | Set up CI/CD pipeline | 1 day | Automated quality gates | Month 1 |
| **P3-1** | Break ListingDetail into components | 3 days | Maintainability | Month 2-3 |
| **P3-2** | Implement Edge Functions | 1 week | API layer foundation | Month 2-3 |
| **P3-3** | Add E2E test for bid placement | 2 days | Regression protection | Month 2-3 |

---

# FUTURE PERFORMANCE PLANNING

## Architecture Evolution

```
Current:     Client → Supabase (Direct)
Phase 1:     Client → Supabase Edge Functions → Supabase DB    (P3-2)
Phase 2:     Client → API Gateway → Edge Functions → DB + Redis Cache
Phase 3:     Client → CDN → API Gateway → Microservices → DB + Redis + Message Queue
```

## Scaling Targets

| Metric | Current | 6 Months | 12 Months |
|---|---|---|---|
| Concurrent Users | ~50 | ~500 | ~5,000 |
| Listings | ~100 | ~5,000 | ~50,000 |
| Bids/Day | ~100 | ~10,000 | ~100,000 |
| Page Load (P75) | ~3s | ~1.5s | ~0.8s |
| WebSocket Channels | ~50 | ~500 | ~5,000 |

## Infrastructure Recommendations

| Need | Recommendation | When |
|---|---|---|
| CDN | Cloudflare or CloudFront for static assets | 1,000+ users |
| Monitoring | Sentry for errors, PostHog for analytics | Now |
| Database | Supabase Pro → Enterprise with read replicas | 10,000+ listings |
| Caching | Redis (Upstash) for query result caching | Edge Functions phase |
| Search | Meilisearch or Algolia for full-text search | 5,000+ listings |
| Image CDN | Cloudinary or Cloudflare Images | Now (Supabase transformations are sufficient for now) |
| CI/CD | GitHub Actions (P2-4) | Now |

---

# NOTES

- **Do not implement everything at once.** Work through P0 items first, verify each fix, then move to P1.
- **Test in staging first.** If you have a staging environment, deploy fixes there before production.
- **Monitor after each change.** Use Supabase Dashboard → Database → Query performance to verify improvements.
- **Back up before database changes.** Run `pg_dump` before adding constraints or indexes.
- **Communicate with users.** If any change affects user experience (e.g., comment sanitization stripping formatting), announce it.

---

*End of document. Total items: 16. Estimated total effort: ~3 weeks for P0+P1, ~2 months for all items.*
