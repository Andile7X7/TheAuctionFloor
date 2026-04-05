import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSearch, FaFire, FaBolt, FaGavel, FaChevronRight, FaSlidersH, FaChevronDown, FaChevronUp, FaTimes } from 'react-icons/fa';
import { supabase } from '../Modules/SupabaseClient';
import UniversalHeader from '../Modules/UniversalHeader';
import styles from './Home.module.css';
import backgroundImage from '../assets/BackgroundImageHomepage.jpg';

const Home = () => {
    const navigate = useNavigate();
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [brandSearch, setBrandSearch] = useState('');
    const [selectedBrands, setSelectedBrands] = useState([]);
    const [selectedModels, setSelectedModels] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    
    // Advanced Filters State (Defaults)
    const [minPrice, setMinPrice] = useState(0);
    const [maxPrice, setMaxPrice] = useState(100000000);
    const [minYear, setMinYear] = useState(1980);
    const [maxYear, setMaxYear] = useState(2026);
    const [selectedLocation, setSelectedLocation] = useState('All');

    // Track which brand is currently expanded in the dropdown
    const [expandedBrand, setExpandedBrand] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const { data, error } = await supabase
                    .from('listings')
                    .select('*, likes(count), comments(count)');

                if (error) throw error;
                setListings(data || []);
            } catch (err) {
                console.error('Error fetching home data:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const brands = [...new Set(listings.map(l => l.Make))].sort();
    const filteredBrands = brands.filter(b => b?.toLowerCase().includes(brandSearch.toLowerCase()));

    const toggleBrand = (brand) => {
        setSelectedBrands(prev => {
            const isSelected = prev.includes(brand);
            if (isSelected) {
                const brandModels = [...new Set(listings.filter(l => l.Make === brand).map(l => l.Model))];
                setSelectedModels(prevModels => prevModels.filter(m => !brandModels.includes(m)));
                return prev.filter(b => b !== brand);
            } else {
                return [...prev, brand];
            }
        });
    };

    const toggleModel = (model) => {
        setSelectedModels(prev => 
            prev.includes(model) 
                ? prev.filter(m => m !== model) 
                : [...prev, model]
        );
    };

    const removeBrandTag = (brand) => {
        setSelectedBrands(prev => prev.filter(b => b !== brand));
        const brandModels = [...new Set(listings.filter(l => l.Make === brand).map(l => l.Model))];
        setSelectedModels(prevModels => prevModels.filter(m => !brandModels.includes(m)));
    };

    const removeModelTag = (model) => {
        setSelectedModels(prev => prev.filter(m => m !== model));
    };

    const getModelsForBrand = (brand) => {
        return [...new Set(listings.filter(l => l.Make === brand).map(l => l.Model))].sort();
    };

    // Correctly check if any filter is active
    const isFiltered = 
        selectedBrands.length > 0 || 
        selectedModels.length > 0 || 
        minPrice > 0 || 
        maxPrice < 100000000 || 
        minYear > 1980 || 
        maxYear < 2026 || 
        selectedLocation !== 'All';

    const filteredList = listings.filter(l => {
        if (!isFiltered) return true; // Show all by default
        
        const brandMatch = selectedBrands.length === 0 || selectedBrands.includes(l.Make);
        const modelMatch = selectedModels.length === 0 || selectedModels.includes(l.Model);
        const priceMatch = (l.CurrentPrice || l.StartingPrice) >= minPrice && (l.CurrentPrice || l.StartingPrice) <= maxPrice;
        const yearMatch = (l.Year >= minYear && l.Year <= maxYear);
        const locMatch = selectedLocation === 'All' || l.location === selectedLocation;
        return brandMatch && modelMatch && priceMatch && yearMatch && locMatch;
    });

    const matchingCount = filteredList.length;

    const trendingCars = [...listings]
        .map(l => ({
            ...l,
            interactions: (l.likes?.[0]?.count || 0) + (l.comments?.[0]?.count || 0) + (l.NumberOfBids || 0)
        }))
        .sort((a, b) => b.interactions - a.interactions)
        .slice(0, 5);

    const handleSearch = () => {
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
    };

    const formatZAR = (amount) => {
        return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount || 0);
    };

    return (
        <div className={styles.homeContainer}>
            <UniversalHeader />
            
            <section 
                className={styles.heroSection}
                style={{ backgroundImage: `url(${backgroundImage})` }}
            >
                <div className={styles.heroContent}>
                    <h1 className={styles.heroTitle}>FIND YOUR NEXT <br />LEGENDARY DRIVE</h1>
                    <p className={styles.heroSubtitle}>The most exclusive digital auction house for curated automotive excellence.</p>
                    
                    <div className={styles.searchWrapper}>
                        <div className={styles.searchBarRow}>
                            <div 
                                className={`${styles.searchBar} ${showDropdown ? styles.searchBarOpen : ''}`}
                                onClick={() => setShowDropdown(true)}
                            >
                                <FaSearch className={styles.searchIcon} />
                                <div className={styles.tagList}>
                                    {selectedBrands.map(brand => (
                                        <div key={brand} className={styles.tag} onClick={(e) => e.stopPropagation()}>
                                            <span>{brand}</span>
                                            <FaTimes className={styles.removeIcon} onClick={() => removeBrandTag(brand)} />
                                        </div>
                                    ))}
                                    {selectedModels.map(model => (
                                        <div key={model} className={styles.tag} onClick={(e) => e.stopPropagation()}>
                                            <span>{model}</span>
                                            <FaTimes className={styles.removeIcon} onClick={() => removeModelTag(model)} />
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
                                    <FaTimes className={styles.closeDropdown} onClick={() => setShowDropdown(false)} />
                                </div>
                                <div className={styles.dropdownScroll}>
                                    {filteredBrands.length > 0 ? (
                                        filteredBrands.map(brand => {
                                            const isBrandSelected = selectedBrands.includes(brand);
                                            const isExpanded = expandedBrand === brand;
                                            const brandModels = getModelsForBrand(brand);
                                            
                                            return (
                                                <div key={brand} className={styles.brandGroup}>
                                                    <div 
                                                        className={`${styles.brandItem} ${isBrandSelected ? styles.selectedBrand : ''}`}
                                                        onClick={() => toggleBrand(brand)}
                                                    >
                                                        <div className={styles.brandMainInfo}>
                                                            <input type="checkbox" checked={isBrandSelected} readOnly className={styles.checkbox} />
                                                            <span>{brand}</span>
                                                            <span className={styles.itemCount}>{listings.filter(l => l.Make === brand).length}</span>
                                                        </div>
                                                        {brandModels.length > 0 && (
                                                            <span 
                                                                className={styles.expandLink}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setExpandedBrand(isExpanded ? null : brand);
                                                                }}
                                                            >
                                                                Models {isExpanded ? <FaChevronUp /> : <FaChevronRight />}
                                                            </span>
                                                        )}
                                                    </div>
                                                    
                                                    {isExpanded && brandModels.length > 0 && (
                                                        <div className={styles.modelList}>
                                                            {brandModels.map(model => (
                                                                <div 
                                                                    key={model}
                                                                    className={`${styles.modelItem} ${selectedModels.includes(model) ? styles.selectedModel : ''}`}
                                                                    onClick={() => toggleModel(model)}
                                                                >
                                                                    <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                                                        <input type="checkbox" checked={selectedModels.includes(model)} readOnly className={styles.checkbox} />
                                                                        <span>{model}</span>
                                                                    </div>
                                                                    <span className={styles.itemCount}>
                                                                        {listings.filter(l => l.Make === brand && l.Model === model).length}
                                                                    </span>
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
                                            <select value={minYear} onChange={(e) => setMinYear(Number(e.target.value))}>
                                                {Array.from({ length: 47 }, (_, i) => 1980 + i).map(y => <option key={y} value={y}>{y}</option>)}
                                            </select>
                                            <span>to</span>
                                            <select value={maxYear} onChange={(e) => setMaxYear(Number(e.target.value))}>
                                                {Array.from({ length: 47 }, (_, i) => 1980 + i).reverse().map(y => <option key={y} value={y}>{y}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className={styles.filterBox}>
                                        <label>LOCATION</label>
                                        <select value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)}>
                                            <option value="All">All Locations</option>
                                            {['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'].map(prov => (
                                                <option key={prov} value={prov}>{prov}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        <button className={styles.searchBtn} onClick={handleSearch}>
                            SHOW {isFiltered ? matchingCount : listings.length} {isFiltered ? 'MATCHING' : 'AVAILABLE'} AUCTIONS
                        </button>
                    </div>
                </div>
            </section>

            <section className={styles.trendingSection}>
                <div className={styles.sectionHeader}>
                    <div className={styles.sectionTitle}>
                        <FaBolt style={{color: '#6366F1', marginRight: '10px'}} />
                        TRENDING ACTIVITY
                    </div>
                </div>

                <div className={styles.trendingContainer}>
                    {loading ? (
                        <p>Analyzing market activity...</p>
                    ) : (
                        trendingCars.map(car => (
                            <div 
                                key={car.id} 
                                className={styles.trendingCard}
                                onClick={() => navigate(`/listing/${car.id}`)}
                            >
                                <img src={car.ImageURL} alt={car.Model} className={styles.cardImage} />
                                <div className={styles.cardBody}>
                                    <h3 className={styles.carName}>{car.Year} {car.Make} {car.Model}</h3>
                                    <p className={styles.carPrice}>{formatZAR(car.CurrentPrice || car.StartingPrice)}</p>
                                    <div className={styles.interactionBadge}>
                                        <FaBolt style={{color: '#6366F1'}} /> {car.interactions} Interactions
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>

            <div className={styles.viewAllContainer}>
                <button className={styles.viewAllBtn} onClick={() => navigate('/auction-floor')}>
                    VIEW ALL AUCTIONS <FaChevronRight style={{marginLeft: '8px', fontSize: '0.8rem'}} />
                </button>
            </div>
        </div>
    );
};

export default Home;
