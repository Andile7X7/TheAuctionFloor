// src/Pages/SearchResults.jsx - New comprehensive search page

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '../Modules/SupabaseClient';
import styles from './SearchResults.module.css';
import AuctionCard from '../Modules/AuctionCard';
import { FaSearch, FaTimes, FaFilter, FaSort, FaHistory } from 'react-icons/fa';
// ⬇️⬇️⬇️ IMPORT UTILITIES ⬇️⬇️⬇️
import { formatZAR } from '../utils/bidValidation';
import { getCurrentUser } from '../utils/authSecurity';
import { createCursorQuery, processCursorResults } from '../utils/pagination';
// ⬆️⬆️⬆️ IMPORT UTILITIES ⬆️⬆️⬆️

const PAGE_SIZE = 20;
const RECENT_SEARCHES_KEY = 'recent_searches';

const SearchResults = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  
  // Parse URL params
  const initialQuery = searchParams.get('q') || '';
  const initialFilters = {
    minPrice: parseInt(searchParams.get('minPrice')) || 0,
    maxPrice: parseInt(searchParams.get('maxPrice')) || 10000000,
    minYear: parseInt(searchParams.get('minYear')) || 1990,
    maxYear: parseInt(searchParams.get('maxYear')) || 2026,
    brands: searchParams.get('brands')?.split(',').filter(Boolean) || [],
    location: searchParams.get('location') || 'All',
    sortBy: searchParams.get('sort') || 'relevance', // 'relevance', 'price-asc', 'price-desc', 'newest'
  };

  // Local state
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [filters, setFilters] = useState(initialFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Refs
  const searchInputRef = useRef(null);
  const debounceRef = useRef(null);

  // ⬇️⬇️⬇️ FETCH CURRENT USER ⬇️⬇️⬇️
  useEffect(() => {
    const fetchUser = async () => {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    };
    fetchUser();
  }, []);
  // ⬆️⬆️⬆️ FETCH CURRENT USER ⬆️⬆️⬆️

  // ⬇️⬇️⬇️ LOAD RECENT SEARCHES FROM LOCALSTORAGE ⬇️⬇️⬇️
  useEffect(() => {
    const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved).slice(0, 10));
      } catch (e) {
        console.error('Failed to parse recent searches');
      }
    }
  }, []);
  // ⬆️⬆️⬆️ LOAD RECENT SEARCHES ⬆️⬆️⬆️

  // ⬇️⬇️⬇️ SAVE SEARCH TO HISTORY ⬇️⬇️⬇️
  const saveSearch = useCallback((query) => {
    if (!query.trim()) return;
    
    setRecentSearches(prev => {
      const newSearches = [
        { query, timestamp: Date.now() },
        ...prev.filter(s => s.query !== query)
      ].slice(0, 10);
      
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(newSearches));
      return newSearches;
    });
  }, []);
  // ⬆️⬆️⬆️ SAVE SEARCH TO HISTORY ⬆️⬆️⬆️

  // ⬇️⬇️⬇️ AUTOCOMPLETE SUGGESTIONS ⬇️⬇️⬇️
  const fetchSuggestions = useCallback(async (query) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      // Use fuzzy search for suggestions
      const { data } = await supabase.rpc('fuzzy_search_suggestions', {
        search_term: query,
        limit: 5
      });
      
      setSuggestions(data || []);
    } catch (err) {
      console.error('Suggestions error:', err);
    }
  }, []);
  // ⬆️⬆️⬆️ AUTOCOMPLETE SUGGESTIONS ⬆️⬆️⬆️

  // ⬇️⬇️⬇️ DEBOUNCED INPUT HANDLER ⬇️⬇️⬇️
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value);
      setShowSuggestions(true);
    }, 150);
  };
  // ⬆️⬆️⬆️ DEBOUNCED INPUT HANDLER ⬆️⬆️⬆️

  // ⬇️⬇️⬇️ EXECUTE SEARCH ⬇️⬇️⬇️
  const executeSearch = useCallback((query = inputValue) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    
    setSearchQuery(trimmed);
    setShowSuggestions(false);
    saveSearch(trimmed);
    
    // Update URL
    const params = new URLSearchParams();
    params.set('q', trimmed);
    if (filters.minPrice > 0) params.set('minPrice', filters.minPrice);
    if (filters.maxPrice < 10000000) params.set('maxPrice', filters.maxPrice);
    if (filters.brands.length > 0) params.set('brands', filters.brands.join(','));
    if (filters.location !== 'All') params.set('location', filters.location);
    if (filters.sortBy !== 'relevance') params.set('sort', filters.sortBy);
    
    setSearchParams(params);
  }, [inputValue, filters, setSearchParams, saveSearch]);
  // ⬆️⬆️⬆️ EXECUTE SEARCH ⬆️⬆️⬆️

  // ⬇️⬇️⬇️ MAIN SEARCH QUERY WITH FULL-TEXT SEARCH ⬇️⬇️⬇️
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
    queryKey: ['search', searchQuery, filters],
    queryFn: async ({ pageParam = null }) => {
      if (!searchQuery.trim()) {
        return { data: [], nextCursor: null, hasMore: false };
      }

      // Clean query for full-text search
      const cleanQuery = searchQuery
        .replace(/[^\w\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(word => word.length > 0)
        .join(' & '); // AND operator for tsquery

      let query = supabase
        .from('listings')
        .select(`
          *,
          ts_rank(search_vector, plainto_tsquery('english', $1)) as rank,
          bid_history(count),
          likes(count)
        `, { count: 'exact' })
        .textSearch('search_vector', cleanQuery, {
          type: 'plain',
          config: 'english',
        })
        .eq('status', 'active');

      // Apply filters
      if (filters.minPrice > 0) {
        query = query.gte('CurrentPrice', filters.minPrice);
      }
      if (filters.maxPrice < 10000000) {
        query = query.lte('CurrentPrice', filters.maxPrice);
      }
      if (filters.minYear > 1990) {
        query = query.gte('Year', filters.minYear);
      }
      if (filters.maxYear < 2026) {
        query = query.lte('Year', filters.maxYear);
      }
      if (filters.brands.length > 0) {
        query = query.in('Make', filters.brands);
      }
      if (filters.location !== 'All') {
        query = query.eq('location', filters.location);
      }

      // Sort order
      let sortField = 'rank';
      let sortDir = 'desc';
      
      switch (filters.sortBy) {
        case 'price-asc':
          sortField = 'CurrentPrice';
          sortDir = 'asc';
          break;
        case 'price-desc':
          sortField = 'CurrentPrice';
          sortDir = 'desc';
          break;
        case 'newest':
          sortField = 'created_at';
          sortDir = 'desc';
          break;
        case 'relevance':
        default:
          sortField = 'rank';
          sortDir = 'desc';
      }

      // Apply pagination
      const paginatedQuery = createCursorQuery(query, {
        cursor: pageParam,
        limit: PAGE_SIZE,
        sortBy: sortField,
        sortDir: sortDir,
      });

      const { data: listings, error: searchError, count } = await paginatedQuery;
      
      if (searchError) throw searchError;

      return {
        ...processCursorResults(listings, PAGE_SIZE),
        totalCount: count || 0,
      };
    },
    enabled: !!searchQuery.trim(),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  // ⬆️⬆️⬆️ MAIN SEARCH QUERY ⬆️⬆️⬆️

  // Flatten results
  const allResults = data?.pages.flatMap(page => page.data) ?? [];
  const totalResults = data?.pages[0]?.totalCount ?? 0;

  // ⬇️⬇️⬇️ INFINITE SCROLL ⬇️⬇️⬇️
  const observerRef = useRef();
  const lastResultRef = useCallback((node) => {
    if (isFetchingNextPage) return;
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage) {
        fetchNextPage();
      }
    });
    
    if (node) observerRef.current.observe(node);
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);
  // ⬆️⬆️⬆️ INFINITE SCROLL ⬆️⬆️⬆️

  // ⬇️⬇️⬇️ FILTER HANDLERS ⬇️⬇️⬇️
  const updateFilter = (key, value) => {
    setFilters(prev => {
      const updated = { ...prev, [key]: value };
      // Re-trigger search with new filters
      setTimeout(() => executeSearch(), 0);
      return updated;
    });
  };

  const toggleBrand = (brand) => {
    setFilters(prev => {
      const newBrands = prev.brands.includes(brand)
        ? prev.brands.filter(b => b !== brand)
        : [...prev.brands, brand];
      
      const updated = { ...prev, brands: newBrands };
      setTimeout(() => executeSearch(), 0);
      return updated;
    });
  };

  const clearFilters = () => {
    setFilters({
      minPrice: 0,
      maxPrice: 10000000,
      minYear: 1990,
      maxYear: 2026,
      brands: [],
      location: 'All',
      sortBy: 'relevance',
    });
    setTimeout(() => executeSearch(), 0);
  };

  const clearSearch = () => {
    setInputValue('');
    setSearchQuery('');
    setSearchParams({});
    searchInputRef.current?.focus();
  };
  // ⬆️⬆️⬆️ FILTER HANDLERS ⬆️⬆️⬆️

  // Popular brands for quick filter
  const popularBrands = ['Porsche', 'Ferrari', 'Lamborghini', 'BMW', 'Mercedes-Benz', 'Audi'];

  return (
    <div className={styles.searchContainer}>
      {/* Search Header */}
      <div className={styles.searchHeader}>
        <div className={styles.searchBox}>
          <FaSearch className={styles.searchIcon} />
          <input
            ref={searchInputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search by make, model, year, or keywords..."
            className={styles.searchInput}
            autoComplete="off"
          />
          {inputValue && (
            <button className={styles.clearBtn} onClick={clearSearch}>
              <FaTimes />
            </button>
          )}
          <button 
            className={styles.searchBtn}
            onClick={() => executeSearch()}
          >
            Search
          </button>
        </div>

        {/* Autocomplete Suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <div className={styles.suggestions}>
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                className={styles.suggestionItem}
                onClick={() => {
                  setInputValue(suggestion.display);
                  executeSearch(suggestion.display);
                }}
              >
                <FaSearch />
                <span>{suggestion.display}</span>
                <small>{suggestion.type}</small>
              </button>
            ))}
          </div>
        )}

        {/* Recent Searches */}
        {showSuggestions && !searchQuery && recentSearches.length > 0 && (
          <div className={styles.recentSearches}>
            <h4><FaHistory /> Recent Searches</h4>
            {recentSearches.map((item, i) => (
              <button
                key={i}
                className={styles.recentItem}
                onClick={() => {
                  setInputValue(item.query);
                  executeSearch(item.query);
                }}
              >
                <span>{item.query}</span>
                <small>{new Date(item.timestamp).toLocaleDateString()}</small>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterChips}>
          {/* Quick Brand Filters */}
          {popularBrands.map(brand => (
            <button
              key={brand}
              className={`${styles.chip} ${filters.brands.includes(brand) ? styles.activeChip : ''}`}
              onClick={() => toggleBrand(brand)}
            >
              {brand}
            </button>
          ))}
          
          {filters.brands.length > 0 && (
            <button className={styles.clearChip} onClick={() => updateFilter('brands', [])}>
              Clear brands
            </button>
          )}
        </div>

        <button 
          className={styles.filterToggle}
          onClick={() => setShowFilters(!showFilters)}
        >
          <FaFilter /> Filters {Object.values(filters).some(f => 
            (Array.isArray(f) ? f.length > 0 : f !== 'All' && f !== 0 && f !== 10000000 && f !== 1990 && f !== 2026 && f !== 'relevance')
          ) && <span className={styles.dot}></span>}
        </button>

        <div className={styles.sortControl}>
          <FaSort />
          <select 
            value={filters.sortBy} 
            onChange={(e) => updateFilter('sortBy', e.target.value)}
          >
            <option value="relevance">Most Relevant</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="newest">Newest First</option>
          </select>
        </div>
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className={styles.expandedFilters}>
          <div className={styles.filterGroup}>
            <label>Price Range</label>
            <div className={styles.rangeInputs}>
              <input
                type="number"
                placeholder="Min"
                value={filters.minPrice || ''}
                onChange={(e) => updateFilter('minPrice', parseInt(e.target.value) || 0)}
              />
              <span>to</span>
              <input
                type="number"
                placeholder="Max"
                value={filters.maxPrice === 10000000 ? '' : filters.maxPrice}
                onChange={(e) => updateFilter('maxPrice', parseInt(e.target.value) || 10000000)}
              />
            </div>
          </div>

          <div className={styles.filterGroup}>
            <label>Year Range</label>
            <div className={styles.rangeInputs}>
              <input
                type="number"
                placeholder="From"
                value={filters.minYear === 1990 ? '' : filters.minYear}
                onChange={(e) => updateFilter('minYear', parseInt(e.target.value) || 1990)}
              />
              <span>to</span>
              <input
                type="number"
                placeholder="To"
                value={filters.maxYear === 2026 ? '' : filters.maxYear}
                onChange={(e) => updateFilter('maxYear', parseInt(e.target.value) || 2026)}
              />
            </div>
          </div>

          <div className={styles.filterGroup}>
            <label>Location</label>
            <select 
              value={filters.location} 
              onChange={(e) => updateFilter('location', e.target.value)}
            >
              <option value="All">All Provinces</option>
              <option value="Gauteng">Gauteng</option>
              <option value="Western Cape">Western Cape</option>
              <option value="KwaZulu-Natal">KwaZulu-Natal</option>
              <option value="Eastern Cape">Eastern Cape</option>
              <option value="Free State">Free State</option>
              <option value="Mpumalanga">Mpumalanga</option>
              <option value="Limpopo">Limpopo</option>
              <option value="North West">North West</option>
              <option value="Northern Cape">Northern Cape</option>
            </select>
          </div>

          <button className={styles.clearAllBtn} onClick={clearFilters}>
            Clear All Filters
          </button>
        </div>
      )}

      {/* Results */}
      <div className={styles.resultsContainer}>
        {/* Results Header */}
        {searchQuery && (
          <div className={styles.resultsHeader}>
            <h2>
              {isLoading ? 'Searching...' : (
                <>
                  {totalResults} {totalResults === 1 ? 'result' : 'results'} for "{searchQuery}"
                </>
              )}
            </h2>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner}></div>
            <p>Searching the auction floor...</p>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className={styles.errorState}>
            <h3>Search failed</h3>
            <p>{error?.message || 'Please try again'}</p>
            <button onClick={() => refetch()} className={styles.retryBtn}>
              Retry Search
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && searchQuery && allResults.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🔍</div>
            <h3>No vehicles found</h3>
            <p>Try adjusting your search terms or filters</p>
            <button onClick={clearFilters} className={styles.clearBtnLarge}>
              Clear Filters
            </button>
          </div>
        )}

        {/* Results Grid */}
        {!isLoading && !isError && allResults.length > 0 && (
          <div className={styles.resultsGrid}>
            {allResults.map((listing, index) => (
              <div
                key={listing.id}
                ref={index === allResults.length - 1 ? lastResultRef : null}
                className={styles.resultCard}
              >
                <AuctionCard
                  listing={listing}
                  onClick={() => navigate(`/listing/${listing.id}`)}
                  highlight={searchQuery}
                  currentUser={user}
                />
              </div>
            ))}
          </div>
        )}

        {/* Loading More */}
        {isFetchingNextPage && (
          <div className={styles.loadingMore}>
            <div className={styles.spinnerSmall}></div>
            <span>Loading more results...</span>
          </div>
        )}

        {/* End of Results */}
        {!isFetchingNextPage && !hasNextPage && allResults.length > 0 && (
          <div className={styles.endOfResults}>
            <span>Showing all {totalResults} results</span>
          </div>
        )}

        {/* Initial State - No Search Yet */}
        {!searchQuery && !isLoading && (
          <div className={styles.initialState}>
            <div className={styles.initialIcon}>🏎️</div>
            <h3>Find Your Next Vehicle</h3>
            <p>Search by make, model, year, or browse all listings</p>
            <div className={styles.quickLinks}>
              <button onClick={() => executeSearch('Porsche')}>Porsche</button>
              <button onClick={() => executeSearch('2023')}>2023 Models</button>
              <button onClick={() => executeSearch('Gauteng')}>In Gauteng</button>
              <button onClick={() => executeSearch('Under 500000')}>Under R500k</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchResults;