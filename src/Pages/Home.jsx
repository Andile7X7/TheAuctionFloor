import React, { 
  useState, 
  useEffect, 
  useCallback, 
  useMemo,
  memo 
} from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FaSearch, 
  FaBolt, 
  FaSlidersH, 
  FaChevronRight, 
  FaChevronDown, 
  FaChevronUp, 
  FaTimes 
} from 'react-icons/fa';
import { supabase } from '../Modules/SupabaseClient';
import UniversalHeader from '../Modules/UniversalHeader';
import styles from './Home.module.css';
import backgroundImage from '../assets/BackgroundImageHomepage.jpg';
import { getTransformUrl } from '../utils/imageCompression';

const PAGE_SIZE = 10;
const BRAND_PAGE_SIZE = 50; // Limit brands in dropdown

// Memoized trending card to prevent re-renders
const TrendingCard = memo(({ car, onClick, formatZAR }) => (
  <div
    className={styles.trendingCard}
    onClick={() => onClick(car.id)}
  >
    <img 
      src={getTransformUrl(car.ImageURL, { width: 300, height: 200 })} 
      alt={car.Model} 
      className={styles.cardImage}
      loading="lazy"
      decoding="async"
    />
    <div className={styles.cardBody}>
      <h3 className={styles.carName}>{car.Year} {car.Make} {car.Model}</h3>
      <p className={styles.carPrice}>{formatZAR(car.CurrentPrice || car.StartingPrice)}</p>
      <div className={styles.interactionBadge}>
        <FaBolt style={{ color: '#6366F1' }} /> {car.interactions} Interactions
      </div>
    </div>
  </div>
));

const Home = () => {
  const navigate = useNavigate();
  
  // ==========================================
  // STATE
  // ==========================================
  const [listings, setListings] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  // Brand filter state
  const [allBrands, setAllBrands] = useState([]);
  const [brandSearch, setBrandSearch] = useState('');
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [selectedModels, setSelectedModels] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [expandedBrand, setExpandedBrand] = useState(null);
  
  // Advanced filters
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(100000000);
  const [minYear, setMinYear] = useState(1980);
  const [maxYear, setMaxYear] = useState(2026);
  const [selectedLocation, setSelectedLocation] = useState('All');

  // ==========================================
  // MEMOIZED VALUES
  // ==========================================
  
  // Only show first 50 brands, filter client-side
  const filteredBrands = useMemo(() => {
    if (!brandSearch) return allBrands.slice(0, BRAND_PAGE_SIZE);
    return allBrands
      .filter(b => b.make?.toLowerCase().includes(brandSearch.toLowerCase()))
      .slice(0, BRAND_PAGE_SIZE);
  }, [allBrands, brandSearch]);

  // Memoized trending calculation - only when listings change
  const trendingCars = useMemo(() => {
    return [...listings]
      .map(l => ({
        ...l,
        interactions: (l.likes?.[0]?.count || 0) + (l.comments?.[0]?.count || 0) + (l.NumberOfBids || 0)
      }))
      .sort((a, b) => b.interactions - a.interactions)
      .slice(0, 5);
  }, [listings]);

  // Check if any filters active
  const isFiltered = useMemo(() => 
    selectedBrands.length > 0 ||
    selectedModels.length > 0 ||
    minPrice > 0 ||
    maxPrice < 100000000 ||
    minYear > 1980 ||
    maxYear < 2026 ||
    selectedLocation !== 'All',
    [selectedBrands, selectedModels, minPrice, maxPrice, minYear, maxYear, selectedLocation]
  );

  // ==========================================
  // FETCH FUNCTIONS
  // ==========================================

  // Fetch brands - limited to top 100 most common
  useEffect(() => {
    const fetchMeta = async () => {
      try {
        // Use RPC or limit query to prevent loading entire table
        const { data: brandData, error } = await supabase
          .from('listings')
          .select('"Make", "Model"')
          .eq('status', 'active')
          .eq('verified', true)
          .limit(1000); // Hard cap to prevent memory issues

        if (error) throw error;

        if (brandData) {
          // Use Map for O(n) aggregation instead of object
          const brandModelsMap = new Map();
          
          brandData.forEach(l => {
            if (!l.Make) return;
            if (!brandModelsMap.has(l.Make)) {
              brandModelsMap.set(l.Make, new Set());
            }
            if (l.Model) {
              brandModelsMap.get(l.Make).add(l.Model);
            }
          });

          // Convert to array and sort
          const mapped = Array.from(brandModelsMap.entries())
            .map(([make, models]) => ({
              make,
              models: Array.from(models).sort()
            }))
            .sort((a, b) => a.make.localeCompare(b.make));

          setAllBrands(mapped);
        }

        // Get total count
        const { count, error: countError } = await supabase
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')
          .eq('verified', true);
          
        if (countError) throw countError;
        setTotalCount(count || 0);
        
      } catch (err) {
        console.error('Error fetching meta:', err);
      }
    };
    
    fetchMeta();
  }, []);

  // Optimized listings fetch with proper cursor
  const fetchListings = useCallback(async (append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const cursor = append && listings.length > 0
        ? listings[listings.length - 1].created_at
        : null;

      let query = supabase
        .from('listings')
        .select('*, likes(count), comments(count)')
        .eq('status', 'active')
        .eq('verified', true)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE + 1);

      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data, error } = await query;
      
      if (error) throw error;

      const hasMorePages = data.length > PAGE_SIZE;
      const pageResults = hasMorePages ? data.slice(0, PAGE_SIZE) : data;

      // Use functional update to avoid stale closure
      setListings(prev => append ? [...prev, ...pageResults] : pageResults);
      setHasMore(hasMorePages);
      
    } catch (err) {
      console.error('Error fetching listings:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [listings.length]); // Only depend on length, not entire array

  // Initial fetch
  useEffect(() => {
    fetchListings(false);
  }, []); // Run once on mount

  // ==========================================
  // HANDLERS
  // ==========================================

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      fetchListings(true);
    }
  }, [fetchListings, loadingMore, hasMore]);

  const getModelsForBrand = useCallback((brand) => {
    const found = allBrands.find(b => b.make === brand);
    return found ? found.models : [];
  }, [allBrands]);

  const toggleBrand = useCallback((brand) => {
    setSelectedBrands(prev => {
      const isSelected = prev.includes(brand);
      if (isSelected) {
        const brandModels = getModelsForBrand(brand);
        setSelectedModels(prevModels => 
          prevModels.filter(m => !brandModels.includes(m))
        );
        return prev.filter(b => b !== brand);
      } else {
        return [...prev, brand];
      }
    });
  }, [getModelsForBrand]);

  const toggleModel = useCallback((model) => {
    setSelectedModels(prev =>
      prev.includes(model)
        ? prev.filter(m => m !== model)
        : [...prev, model]
    );
  }, []);

  const removeBrandTag = useCallback((brand) => {
    setSelectedBrands(prev => prev.filter(b => b !== brand));
    const brandModels = getModelsForBrand(brand);
    setSelectedModels(prevModels => prevModels.filter(m => !brandModels.includes(m)));
  }, [getModelsForBrand]);

  const removeModelTag = useCallback((model) => {
    setSelectedModels(prev => prev.filter(m => m !== model));
  }, []);

  const handleSearch = useCallback(() => {
    navigate('/auction-floor', {
      state: {
        selectedBrands,
        selectedModels,
        minPrice,
        maxPrice,
        minYear,
        maxYear,
        selectedLocation
      }
    });
  }, [navigate, selectedBrands, selectedModels, minPrice, maxPrice, minYear, maxYear, selectedLocation]);

  const formatZAR = useCallback((amount) => {
    return new Intl.NumberFormat('en-ZA', { 
      style: 'currency', 
      currency: 'ZAR', 
      maximumFractionDigits: 0 
    }).format(amount || 0);
  }, []);

  const handleCardClick = useCallback((id) => {
    navigate(`/listing/${id}`);
  }, [navigate]);

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className={styles.homeContainer}>
      <UniversalHeader />

      <section
        className={styles.heroSection}
        style={{ backgroundImage: `url(${backgroundImage})` }}
      >
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>FIND YOUR NEXT <br />LEGENDARY DRIVE</h1>
          <p className={styles.heroSubtitle}>
            The most exclusive digital auction house for curated automotive excellence.
          </p>

          <div className={styles.searchWrapper}>
            <div className={styles.searchBarRow}>
              <div
                className={`${styles.searchBar} ${showDropdown ? styles.searchBarOpen : ''}`}
                onClick={() => setShowDropdown(true)}
              >
                <FaSearch className={styles.searchIcon} />
                <div className={styles.tagList}>
                  {selectedBrands.map(brand => (
                    <div 
                      key={brand} 
                      className={styles.tag} 
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span>{brand}</span>
                      <FaTimes 
                        className={styles.removeIcon} 
                        onClick={() => removeBrandTag(brand)} 
                      />
                    </div>
                  ))}
                  {selectedModels.map(model => (
                    <div 
                      key={model} 
                      className={styles.tag} 
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span>{model}</span>
                      <FaTimes 
                        className={styles.removeIcon} 
                        onClick={() => removeModelTag(model)} 
                      />
                    </div>
                  ))}
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder={selectedBrands.length === 0 ? "Search brands (e.g. Porsche, BMW...)" : "Add more..."}
                    value={brandSearch}
                    onChange={(e) => {
                      setBrandSearch(e.target.value);
                      setShowDropdown(true);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDropdown(true);
                    }}
                  />
                </div>
              </div>

              <button
                className={`${styles.filterToggleBtn} ${showAdvancedFilters ? styles.filterActive : ''}`}
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              >
                <FaSlidersH />
              </button>
            </div>

            {showDropdown && (
              <div className={styles.brandDropdown} onClick={(e) => e.stopPropagation()}>
                <div className={styles.dropdownHeader}>
                  <span>Brands</span>
                  <FaTimes 
                    className={styles.closeDropdown} 
                    onClick={() => setShowDropdown(false)} 
                  />
                </div>
                <div className={styles.dropdownScroll}>
                  {filteredBrands.length > 0 ? (
                    filteredBrands.map(brand => {
                      const isBrandSelected = selectedBrands.includes(brand.make);
                      const isExpanded = expandedBrand === brand.make;

                      return (
                        <div key={brand.make} className={styles.brandGroup}>
                          <div
                            className={`${styles.brandItem} ${isBrandSelected ? styles.selectedBrand : ''}`}
                            onClick={() => toggleBrand(brand.make)}
                          >
                            <div className={styles.brandMainInfo}>
                              <input 
                                type="checkbox" 
                                checked={isBrandSelected} 
                                readOnly 
                                className={styles.checkbox} 
                              />
                              <span>{brand.make}</span>
                            </div>
                            {brand.models.length > 0 && (
                              <span
                                className={styles.expandLink}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedBrand(isExpanded ? null : brand.make);
                                }}
                              >
                                Models {isExpanded ? <FaChevronUp /> : <FaChevronRight />}
                              </span>
                            )}
                          </div>

                          {isExpanded && brand.models.length > 0 && (
                            <div className={styles.modelList}>
                              {brand.models.map(model => (
                                <div
                                  key={model}
                                  className={`${styles.modelItem} ${selectedModels.includes(model) ? styles.selectedModel : ''}`}
                                  onClick={() => toggleModel(model)}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <input 
                                      type="checkbox" 
                                      checked={selectedModels.includes(model)} 
                                      readOnly 
                                      className={styles.checkbox} 
                                    />
                                    <span>{model}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className={styles.brandItem}>No brands found</div>
                  )}
                </div>
              </div>
            )}

            {showAdvancedFilters && (
              <div className={styles.advancedFiltersPanel}>
                <div className={styles.filterGrid}>
                  <div className={styles.filterBox}>
                    <label>PRICE RANGE (MAX)</label>
                    <input
                      type="range"
                      min="0"
                      max="10000000"
                      step="100000"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(Number(e.target.value))}
                    />
                    <span className={styles.filterValue}>{formatZAR(maxPrice)}</span>
                  </div>
                  <div className={styles.filterBox}>
                    <label>YEAR</label>
                    <div className={styles.yearIn}>
                      <select 
                        value={minYear} 
                        onChange={(e) => setMinYear(Number(e.target.value))}
                      >
                        {Array.from({ length: 47 }, (_, i) => 1980 + i).map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                      <span>to</span>
                      <select 
                        value={maxYear} 
                        onChange={(e) => setMaxYear(Number(e.target.value))}
                      >
                        {Array.from({ length: 47 }, (_, i) => 1980 + i)
                          .reverse()
                          .map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                      </select>
                    </div>
                  </div>
                  <div className={styles.filterBox}>
                    <label>LOCATION</label>
                    <select 
                      value={selectedLocation} 
                      onChange={(e) => setSelectedLocation(e.target.value)}
                    >
                      <option value="All">All Locations</option>
                      {[
                        'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
                        'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'
                      ].map(prov => (
                        <option key={prov} value={prov}>{prov}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <button className={styles.searchBtn} onClick={handleSearch}>
              SHOW {totalCount} {isFiltered ? 'MATCHING' : 'AVAILABLE'} AUCTIONS
            </button>
          </div>
        </div>
      </section>

      <section className={styles.trendingSection}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>
            <FaBolt style={{ color: '#6366F1', marginRight: '10px' }} />
            TRENDING ACTIVITY
          </div>
        </div>

        <div className={styles.trendingContainer}>
          {loading ? (
            <p>Analyzing market activity...</p>
          ) : trendingCars.length > 0 ? (
            trendingCars.map(car => (
              <TrendingCard 
                key={car.id}
                car={car}
                onClick={handleCardClick}
                formatZAR={formatZAR}
              />
            ))
          ) : (
            <p style={{ color: '#9CA3AF' }}>No active listings yet.</p>
          )}
        </div>
      </section>

      {!loading && listings.length > 0 && (
        <div className={styles.loadMoreContainer}>
          {hasMore ? (
            <button
              className={styles.loadMoreBtn}
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading...' : `LOAD MORE (${listings.length} of ${totalCount} shown)`}
            </button>
          ) : (
            <p className={styles.endMessage}>
              You've seen all {listings.length} available auctions
            </p>
          )}
        </div>
      )}

      <div className={styles.viewAllContainer}>
        <button 
          className={styles.viewAllBtn} 
          onClick={() => navigate('/auction-floor')}
        >
          VIEW ALL AUCTIONS <FaChevronRight style={{ marginLeft: '8px', fontSize: '0.8rem' }} />
        </button>
      </div>
    </div>
  );
};

export default Home;