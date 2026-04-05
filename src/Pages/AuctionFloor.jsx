import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../Modules/SupabaseClient';
import UniversalHeader from '../Modules/UniversalHeader';
import AuctionCard from '../Modules/AuctionCard';
import styles from './AuctionFloor.module.css';
import { FaTimes, FaChevronDown, FaChevronUp } from 'react-icons/fa';

const AuctionFloor = () => {
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [selectedBrands, setSelectedBrands] = useState([]);
    const [selectedModels, setSelectedModels] = useState([]);
    const [brandSearch, setBrandSearch] = useState('');
    const [minPrice, setMinPrice] = useState(0);
    const [maxPrice, setMaxPrice] = useState(100000000);
    const [minYear, setMinYear] = useState(1980);
    const [maxYear, setMaxYear] = useState(2026);
    const [selectedLocation, setSelectedLocation] = useState('All');
    const [sortBy, setSortBy] = useState('high-to-low');
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const location = useLocation();

    useEffect(() => {
        if (location.state) {
            const { 
                selectedBrands, 
                selectedModels, 
                minPrice: pMin, 
                maxPrice: pMax, 
                minYear: yMin, 
                maxYear: yMax, 
                selectedLocation: loc 
            } = location.state;

            if (selectedBrands) setSelectedBrands(selectedBrands);
            if (selectedModels) setSelectedModels(selectedModels);
            if (pMin !== undefined) setMinPrice(pMin);
            if (pMax !== undefined) setMaxPrice(pMax);
            if (yMin !== undefined) setMinYear(yMin);
            if (yMax !== undefined) setMaxYear(yMax);
            if (loc) setSelectedLocation(loc);
        }
    }, [location.state]);
    // Track which brand is currently expanded to show its models
    const [expandedBrand, setExpandedBrand] = useState(null);

    const resetFilters = () => {
        setSelectedBrands([]);
        setSelectedModels([]);
        setBrandSearch('');
        setMinPrice(0);
        setMaxPrice(100000000);
        setMinYear(1980);
        setMaxYear(2026);
        setSelectedLocation('All');
        setSortBy('high-to-low');
        setExpandedBrand(null);
    };

    const toggleBrand = (brand) => {
        if (brand === 'All Brands') {
            setSelectedBrands([]);
            setSelectedModels([]);
            setExpandedBrand(null);
        } else {
            setSelectedBrands(prev => {
                const isSelected = prev.includes(brand);
                let next;
                if (isSelected) {
                    // Deselect brand
                    next = prev.filter(b => b !== brand);
                    // Also remove any selected models from this brand
                    const brandModels = [...new Set(listings.filter(l => l.Make === brand).map(l => l.Model))];
                    setSelectedModels(prevModels => prevModels.filter(m => !brandModels.includes(m)));
                    // Collapse if deselecting
                    if (expandedBrand === brand) {
                        setExpandedBrand(null);
                    }
                } else {
                    // Select brand and expand it
                    next = [...prev, brand];
                    setExpandedBrand(brand);
                }
                return next;
            });
        }
    };

    const toggleModel = (model) => {
        setSelectedModels(prev => 
            prev.includes(model) 
                ? prev.filter(m => m !== model) 
                : [...prev, model]
        );
    };

    const getModelsForBrand = (brand) => {
        return [...new Set(
            listings.filter(l => l.Make === brand).map(l => l.Model)
        )].sort();
    };

    useEffect(() => {
        const fetchAllListings = async () => {
            try {
                const { data, error } = await supabase
                    .from('listings')
                    .select('*, likes(count), comments(count)');

                if (error) throw error;
                setListings(data || []);
            } catch (err) {
                console.error('Error fetching auction items:', err);
            } finally {
                setLoading(false);
            }
        };

        const fetchUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setCurrentUser(user);
        };

        fetchAllListings();
        fetchUser();

        // Realtime Subscription
        const channel = supabase
            .channel('auction_floor_updates')
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'listings' 
            }, payload => {
                if (payload.new) {
                    setListings(current => current.map(listing => 
                        listing.id === payload.new.id 
                        ? { ...listing, ...payload.new } 
                        : listing
                    ));
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return (
        <div className={styles.container}>
            <UniversalHeader />

            <main className={styles.mainContent}>
                <div className={styles.heroSection}>
                    <span className={styles.liveIndicator}>
                        <div className={styles.pulseDot}></div> LIVE GLOBAL BIDDING
                    </span>
                    <h1 className={styles.heroTitle}>THE AUCTION <span style={{color: 'var(--accent)'}} className={styles.heroTitleSpan}>FLOOR</span></h1>
                    
                    <div className={styles.controls}>
                        <div className={styles.sortDropdownWrap}>
                            <button className={styles.mobileFilterBtn} onClick={() => setShowMobileFilters(true)}>
                                FILTERS
                            </button>
                            <button className={styles.sortBtn} onClick={() => setShowSortMenu(!showSortMenu)}>
                                SORT: {sortBy.replace(/-/g, ' ').toUpperCase()}
                            </button>
                            {showSortMenu && (
                                <div className={styles.sortMenu}>
                                    <div className={styles.sortMenuItem} onClick={() => { setSortBy('high-to-low'); setShowSortMenu(false); }}>Highest Price</div>
                                    <div className={styles.sortMenuItem} onClick={() => { setSortBy('low-to-high'); setShowSortMenu(false); }}>Lowest Price</div>
                                    <div className={styles.sortMenuItem} onClick={() => { setSortBy('newest'); setShowSortMenu(false); }}>Newest First</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className={styles.layoutBody}>
                    {/* Sidebar Filters - Static Placeholders */}
                    {showMobileFilters && <div className={styles.overlay} onClick={() => setShowMobileFilters(false)}></div>}
                    <aside className={`${styles.sidebar} ${showMobileFilters ? styles.sidebarOpen : ''}`}>
                        <div className={styles.filterSection}>
                            <div className={styles.sidebarHeader}>
                                <h4 className={styles.sectionTitle}>BRANDS</h4>
                                <FaTimes className={styles.closeSidebar} onClick={() => setShowMobileFilters(false)} />
                            </div>

                            {/* Brand Search */}
                            <div className={styles.brandSearchWrap}>
                                <input
                                    type="text"
                                    className={styles.brandSearchInput}
                                    placeholder="Search brand..."
                                    value={brandSearch}
                                    onChange={(e) => setBrandSearch(e.target.value)}
                                />
                            </div>

                            {/* Brand List with Nested Models */}
                            <div className={styles.brandScrollContainer}>
                                {brandSearch === '' && (
                                    <div 
                                        className={`${styles.filterItem} ${selectedBrands.length === 0 ? styles.activeFilter : ''}`}
                                        onClick={() => toggleBrand('All Brands')}
                                    >
                                        All Brands <span className={styles.count}>{listings.length}</span>
                                    </div>
                                )}
                                {[...new Set(listings.map(l => l.Make))].sort()
                                    .filter(brand => brand?.toLowerCase().includes(brandSearch.toLowerCase()))
                                    .map(brand => {
                                        const isSelected = selectedBrands.includes(brand);
                                        const isExpanded = expandedBrand === brand;
                                        const brandModels = getModelsForBrand(brand);
                                        
                                        return (
                                            <div key={brand} className={styles.brandItemWrapper}>
                                                {/* Brand Row - Click to toggle selection, chevron to expand */}
                                                <div 
                                                    className={`${styles.filterItem} ${isSelected ? styles.activeFilter : ''}`}
                                                    onClick={() => toggleBrand(brand)}
                                                >
                                                    <div className={styles.brandRowContent}>
                                                        <span>{brand}</span>
                                                        <div className={styles.brandRowActions}>
                                                            <span className={styles.count}>
                                                                {listings.filter(l => l.Make === brand).length}
                                                            </span>
                                                            {/* Chevron to expand/collapse models - only show if brand has models */}
                                                            {brandModels.length > 0 && (
                                                                <span 
                                                                    className={styles.expandIcon}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setExpandedBrand(isExpanded ? null : brand);
                                                                    }}
                                                                >
                                                                    {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Nested Models List - appears directly under the brand when expanded */}
                                                {isExpanded && brandModels.length > 0 && (
                                                    <div className={styles.modelsNestedList}>
                                                        <div
                                                            className={`${styles.filterItem} ${styles.modelItem} ${selectedModels.length === 0 && isSelected ? styles.activeFilter : ''}`}
                                                            onClick={() => {
                                                                // Clear models for this brand only
                                                                const otherBrandModels = selectedModels.filter(m => !brandModels.includes(m));
                                                                setSelectedModels(otherBrandModels);
                                                            }}
                                                        >
                                                            All {brand} Models
                                                            <span className={styles.count}>{brandModels.length}</span>
                                                        </div>
                                                        {brandModels.map(model => {
                                                            const modelCount = listings.filter(l => l.Make === brand && l.Model === model).length;
                                                            const isModelSelected = selectedModels.includes(model);
                                                            
                                                            return (
                                                                <div
                                                                    key={`${brand}-${model}`}
                                                                    className={`${styles.filterItem} ${styles.modelItem} ${isModelSelected ? styles.activeFilter : ''}`}
                                                                    onClick={() => toggleModel(model)}
                                                                >
                                                                    {model}
                                                                    <span className={styles.count}>{modelCount}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        </div>

                        <div className={styles.filterSection}>
                            <h4 className={styles.sectionTitle}>PRICE RANGE (R)</h4>
                            <div className={styles.priceInputs}>
                                <div className={styles.priceInputBox}>
                                    <label>Min</label>
                                    <input type="number" value={minPrice} onChange={(e) => setMinPrice(Number(e.target.value))} />
                                </div>
                                <div className={styles.priceInputBox}>
                                    <label>Max</label>
                                    <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} />
                                </div>
                            </div>
                        </div>

                        <div className={styles.filterSection}>
                            <h4 className={styles.sectionTitle}>PERIOD</h4>
                            <div className={styles.yearFilterWrap}>
                                <div className={styles.yearSelectBox}>
                                    <label>From</label>
                                    <select value={minYear} onChange={(e) => setMinYear(Number(e.target.value))}>
                                        {Array.from({ length: 47 }, (_, i) => 1980 + i).map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                <div className={styles.yearSelectBox}>
                                    <label>To</label>
                                    <select value={maxYear} onChange={(e) => setMaxYear(Number(e.target.value))}>
                                        {Array.from({ length: 47 }, (_, i) => 1980 + i).reverse().map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className={styles.filterSection}>
                            <h4 className={styles.sectionTitle}>LOCATION</h4>
                            <div className={styles.yearSelectBox} style={{ width: '100%' }}>
                                <select value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)}>
                                    <option value="All">All Locations</option>
                                    {['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'].map(prov => (
                                         <option key={prov} value={prov}>{prov}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className={styles.sidebarActions}>
                            <button className={styles.resetBtn} onClick={resetFilters}>RESET ALL FILTERS</button>
                        </div>
                    </aside>

                    {/* Auction Grid */}
                    <div className={styles.contentArea}>
                        {loading ? (
                            <div className={styles.loader}>Initializing Auction Floor...</div>
                        ) : listings.length === 0 ? (
                            <div className={styles.loader}>No active lots found. Check back soon.</div>
                        ) : (
                            <div className={styles.auctionGrid}>
                                {listings
                                    .filter(l => {
                                        const effectivePrice = l.CurrentPrice || l.StartingPrice || 0;
                                        const brandMatch = selectedBrands.length === 0 || selectedBrands.includes(l.Make);
                                        const modelMatch = selectedModels.length === 0 || selectedModels.includes(l.Model);
                                        const priceMatch = effectivePrice >= minPrice && effectivePrice <= maxPrice;
                                        const yearMatch = l.Year >= minYear && l.Year <= maxYear;
                                        const locMatch = selectedLocation === 'All' || l.location === selectedLocation;
                                        return brandMatch && modelMatch && priceMatch && yearMatch && locMatch;
                                    })
                                    .sort((a, b) => {
                                        const aPrice = a.CurrentPrice || a.StartingPrice || 0;
                                        const bPrice = b.CurrentPrice || b.StartingPrice || 0;
                                        if (sortBy === 'high-to-low') return bPrice - aPrice;
                                        if (sortBy === 'low-to-high') return aPrice - bPrice;
                                        if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
                                        return 0;
                                    })
                                    .map((item) => (
                                        <AuctionCard key={item.id} listing={item} currentUser={currentUser} />
                                    ))
                                }
                            </div>
                        )}
                        
                        <div className={styles.paginationArea}>
                            <button className={styles.revealBtn}>REVEAL MORE LOTS</button>
                        </div>
                    </div>
                </div>
            </main>

            <footer className={styles.footer}>
                <div className={styles.footerInner}>
                    <div className={styles.footerBrand}>
                        <h3>CHRONOGRAPH</h3>
                        <p>The world's most exclusive digital auction house for rare automotive pieces and engineering marvels. Curated with precision, sold with authority.</p>
                    </div>
                    <nav className={styles.footerNav}>
                        <span>PRIVACY POLICY</span>
                        <span>TERMS OF SERVICE</span>
                        <span>CONTACT SUPPORT</span>
                        <span>PRESS KIT</span>
                        <span>COOKIE SETTINGS</span>
                    </nav>
                </div>
                <div className={styles.footerCopyright}>
                    © 2024 CHRONOGRAPH AUTOMOTIVE EDITORIAL. ALL RIGHTS RESERVED.
                </div>
            </footer>
        </div>
    );
};

export default AuctionFloor;