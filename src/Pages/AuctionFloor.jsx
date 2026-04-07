import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '../Modules/SupabaseClient';
import styles from './AuctionFloor.module.css';
import AuctionCard from '../Modules/AuctionCard';
import FilterSidebar from '../Modules/FilterSidebar';
import UniversalHeader from '../Modules/UniversalHeader';
// ⬇️⬇️⬇️ IMPORT UTILITIES ⬇️⬇️⬇️
import { createCursorQuery, processCursorResults } from '../utils/pagination';
import { formatZAR } from '../utils/bidValidation';
import { getCurrentUser } from '../utils/authSecurity';
// ⬆️⬆️⬆️ IMPORT UTILITIES ⬆️⬆️⬆️

const PAGE_SIZE = 20;

const AuctionFloor = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const incoming = location.state || {}; // Filters passed from Home.jsx search
  const [user, setUser] = useState(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  
  // Filter state — seeded from Home page search if present
  const [filters, setFilters] = useState({
    brands: incoming.selectedBrands || [],
    models: incoming.selectedModels || [],
    minPrice: incoming.minPrice || 0,
    maxPrice: incoming.maxPrice || 10000000,
    minYear: incoming.minYear || 1990,
    maxYear: incoming.maxYear || 2026,
    location: incoming.selectedLocation || 'All',
    sortBy: 'newest',
    search: '',
  });

  // ⬇️⬇️⬇️ DEBOUNCED SEARCH STATE (for query efficiency) ⬇️⬇️⬇️
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 500);
    return () => clearTimeout(timer);
  }, [filters.search]);
  // ⬆️⬆️⬆️ DEBOUNCED SEARCH STATE ⬆️⬆️⬆️

  // Available filter options (populated from data)
  const [availableBrands, setAvailableBrands] = useState([]);

  // Get current user on mount
  useEffect(() => {
    const fetchUser = async () => {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    };
    fetchUser();
  }, []);

  // ⬇️⬇️⬇️ INFINITE QUERY WITH CURSOR PAGINATION ⬇️⬇️⬇️
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['listings', 'auction', filters.brands, filters.models, filters.minPrice, filters.maxPrice, filters.minYear, filters.maxYear, filters.location, filters.sortBy, debouncedSearch],
    queryFn: async ({ pageParam = null }) => {
      // Build base query
      let query = supabase
        .from('listings')
        .select(`
          *,
          bid_history(count),
          likes(count),
          bookmarks(count)
        `)
        .eq('status', 'active')
        .eq('verified', true);

      // Apply search term if present
      if (debouncedSearch) {
        query = query.or(`Make.ilike.%${debouncedSearch}%,Model.ilike.%${debouncedSearch}%,Year.ilike.%${debouncedSearch}%`);
      }

      // Apply filters server-side
      if (filters.brands.length > 0) {
        query = query.in('Make', filters.brands);
      }
      
      if (filters.models.length > 0) {
        query = query.in('Model', filters.models);
      }

      // Price range
      if (filters.minPrice > 0) {
        query = query.gte('CurrentPrice', filters.minPrice);
      }
      if (filters.maxPrice < 10000000) {
        query = query.lte('CurrentPrice', filters.maxPrice);
      }

      // Year range
      if (filters.minYear > 1990) {
        query = query.gte('Year', filters.minYear);
      }
      if (filters.maxYear < 2026) {
        query = query.lte('Year', filters.maxYear);
      }

      // Location
      if (filters.location !== 'All') {
        query = query.eq('location', filters.location);
      }

      // Determine sort field and direction
      let sortField = 'created_at';
      let sortDirection = 'desc';

      switch (filters.sortBy) {
        case 'high-to-low':
          sortField = 'CurrentPrice';
          sortDirection = 'desc';
          break;
        case 'low-to-high':
          sortField = 'CurrentPrice';
          sortDirection = 'asc';
          break;
        case 'newest':
        default:
          sortField = 'created_at';
          sortDirection = 'desc';
      }

      // Apply cursor pagination
      const paginatedQuery = createCursorQuery(query, {
        cursor: pageParam,
        limit: PAGE_SIZE,
        sortBy: sortField,
        sortDir: sortDirection,
      });

      const { data: listings, error: queryError } = await paginatedQuery;

      if (queryError) throw queryError;

      return processCursorResults(listings, PAGE_SIZE, sortField);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null,
    staleTime: 30 * 1000, // 30 seconds fresh
    gcTime: 2 * 60 * 1000, // Memory mgmt: 2 min cache
    maxPages: 10, // Memory mgmt: Keep only 200 listings in RAM
    refetchOnWindowFocus: false,
    retry: 2,
  });
  // ⬆️⬆️⬆️ INFINITE QUERY WITH CURSOR PAGINATION ⬆️⬆️⬆️

  // Flatten all pages into single array
  const allListings = data?.pages.flatMap(page => page.data) ?? [];

  // ⬇️⬇️⬇️ FETCH FILTER OPTIONS (BRANDS/MODELS) ⬇️⬇️⬇️
  useEffect(() => {
    const fetchFilterOptions = async () => {
      // Get distinct brands and models
      const { data: listingsData } = await supabase
        .from('listings')
        .select('Make, Model')
        .eq('status', 'active');

      if (listingsData) {
        const brandModelsMap = {};
        listingsData.forEach(l => {
          if (!l.Make) return;
          if (!brandModelsMap[l.Make]) brandModelsMap[l.Make] = new Set();
          if (l.Model) brandModelsMap[l.Make].add(l.Model);
        });

        const mappedBrands = Object.keys(brandModelsMap).map(make => ({
          make,
          models: Array.from(brandModelsMap[make]).sort()
        })).sort((a,b) => a.make.localeCompare(b.make));

        setAvailableBrands(mappedBrands);
      }
    };

    fetchFilterOptions();
  }, []);
  // ⬆️⬆️⬆️ FETCH FILTER OPTIONS ⬆️⬆️⬆️

  // ⬇️⬇️⬇️ INFINITE SCROLL OBSERVER ⬇️⬇️⬇️
  const observerRef = useRef();
  const lastListingRef = useCallback((node) => {
    if (isFetchingNextPage) return;
    
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage) {
        fetchNextPage();
      }
    });
    
    if (node) observerRef.current.observe(node);
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);
  // ⬆️⬆️⬆️ INFINITE SCROLL OBSERVER ⬆️⬆️⬆️

  // Filter change handlers
  const handleBrandToggle = (brand) => {
    setFilters(prev => {
      const newBrands = prev.brands.includes(brand)
        ? prev.brands.filter(b => b !== brand)
        : [...prev.brands, brand];
      
      // Clear models when brand changes
      return { ...prev, brands: newBrands, models: [] };
    });
  };

  const handleModelToggle = (model) => {
    setFilters(prev => ({
      ...prev,
      models: prev.models.includes(model)
        ? prev.models.filter(m => m !== model)
        : [...prev.models, model]
    }));
  };

  const handlePriceChange = (type, value) => {
    setFilters(prev => ({
      ...prev,
      [type]: parseInt(value) || 0
    }));
  };

  const handleYearChange = (type, value) => {
    setFilters(prev => ({
      ...prev,
      [type]: parseInt(value) || 1990
    }));
  };

  const handleLocationChange = (location) => {
    setFilters(prev => ({ ...prev, location }));
  };

  const handleSortChange = (sortBy) => {
    setFilters(prev => ({ ...prev, sortBy }));
  };

  const clearFilters = () => {
    setFilters({
      brands: [],
      models: [],
      minPrice: 0,
      maxPrice: 10000000,
      minYear: 1990,
      maxYear: 2026,
      location: 'All',
      sortBy: 'newest',
    });
  };

  // Count active filters
  const activeFilterCount = 
    filters.brands.length + 
    filters.models.length + 
    (filters.minPrice > 0 ? 1 : 0) +
    (filters.maxPrice < 10000000 ? 1 : 0) +
    (filters.minYear > 1990 ? 1 : 0) +
    (filters.maxYear < 2026 ? 1 : 0) +
    (filters.location !== 'All' ? 1 : 0);

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Loading auction floor...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className={styles.container}>
        <div className={styles.errorContainer}>
          <h3>Failed to load listings</h3>
          <p>{error?.message || 'Please try again'}</p>
          <button onClick={() => refetch()} className={styles.retryBtn}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <UniversalHeader 
        searchTerm={filters.search} 
        onSearch={(val) => setFilters(prev => ({ ...prev, search: val }))} 
      />
      {/* Page Title removed as per request */}

      <div className={styles.mainContent}>
        <div className={styles.layoutBody}>
        {/* Sidebar Filters */}
        <aside className={`${styles.sidebar} ${showMobileFilters ? styles.mobileOpen : ''}`}>
          <FilterSidebar
            filters={filters}
            availableBrands={availableBrands}
            onBrandToggle={handleBrandToggle}
            onModelToggle={handleModelToggle}
            onPriceChange={handlePriceChange}
            onYearChange={handleYearChange}
            onLocationChange={handleLocationChange}
            onSortChange={handleSortChange}
            onClear={clearFilters}
            activeCount={activeFilterCount}
          />
        </aside>

        {/* Main Grid */}
        <main>
          {/* Sort bar */}
          <div className={styles.sortBar}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <span className={styles.resultsCount}>
                {allListings.length} {allListings.length === 1 ? 'vehicle' : 'vehicles'}
              </span>
              <button 
                className={styles.mobileFilterBtn}
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                style={{ display: 'none' /* handled by media query in CSS */, padding: '6px 12px', fontSize: '10px' }}
              >
                Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
              </button>
            </div>
            
            <div className={styles.sortControls}>
              <label>Sort by:</label>
              <select 
                value={filters.sortBy} 
                onChange={(e) => handleSortChange(e.target.value)}
              >
                <option value="newest">Newest First</option>
                <option value="high-to-low">Price: High to Low</option>
                <option value="low-to-high">Price: Low to High</option>
              </select>
            </div>
          </div>

          {/* Listings Grid */}
          {allListings.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🔍</div>
              <h3>No vehicles found</h3>
              <p>Try adjusting your filters or check back later.</p>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className={styles.clearBtn}>
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className={styles.auctionGrid}>
              {allListings.map((listing, index) => (
                <div
                  key={listing.id}
                  ref={index === allListings.length - 1 ? lastListingRef : null}
                  className={styles.listingWrapper}
                >
                  <AuctionCard
                    listing={listing}
                    currentUser={user}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Loading more indicator */}
          {isFetchingNextPage && (
            <div className={styles.loadingMore}>
              <div className={styles.spinnerSmall}></div>
              <span>Loading more vehicles...</span>
            </div>
          )}

          {/* End of results */}
          {!hasNextPage && allListings.length > 0 && (
            <div className={styles.endOfResults}>
              <span>You've seen all {allListings.length} vehicles</span>
            </div>
          )}
        </main>
      </div>
    </div>
    </div>
  );
};

export default AuctionFloor;