import React from 'react';
import styles from '../Pages/AuctionFloor.module.css';

const FilterSidebar = ({
  filters,
  availableBrands,
  onBrandToggle,
  onModelToggle,
  onPriceChange,
  onYearChange,
  onLocationChange,
  onClear,
  activeCount
}) => {
  return (
    <>
      <div className={styles.sidebarHeader} style={{ display: 'flex' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#fff' }}>Filters</h2>
          {activeCount > 0 && <span style={{ fontSize: '11px', color: '#6366F1', fontWeight: 700 }}>{activeCount} Active</span>}
        </div>
        {activeCount > 0 && (
          <button onClick={onClear} className={styles.resetBtn} style={{ width: 'auto', padding: '6px 12px' }}>
            Clear
          </button>
        )}
      </div>

      <div className={styles.filterSection}>
        <h4 className={styles.sectionTitle}>MAKE & MODEL</h4>
        <div className={styles.brandScrollContainer}>
          {availableBrands.map(brandObj => {
            const isActive = filters.brands.includes(brandObj.make);
            return (
              <div key={brandObj.make}>
                <div 
                  className={`${styles.filterItem} ${isActive ? styles.activeFilter : ''}`}
                  onClick={() => onBrandToggle(brandObj.make)}
                >
                  <span>{brandObj.make}</span>
                </div>
                {isActive && brandObj.models && brandObj.models.length > 0 && (
                  <div style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', marginBottom: '8px' }}>
                    {brandObj.models.map(model => {
                      const isModelActive = filters.models.includes(model);
                      return (
                        <div 
                          key={model} 
                          className={`${styles.filterItem} ${isModelActive ? styles.activeFilter : ''}`}
                          style={{ padding: '6px 10px', fontSize: '11px', backgroundColor: isModelActive ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.02)' }}
                          onClick={() => onModelToggle(model)}
                        >
                          <span>{model}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.filterSection}>
        <h4 className={styles.sectionTitle}>PRICE RANGE</h4>
        <div className={styles.priceInputs}>
          <div className={styles.priceInputBox}>
            <label>Min Price (R)</label>
            <input 
              type="number" 
              value={filters.minPrice || ''} 
              onChange={(e) => onPriceChange('minPrice', e.target.value)}
              placeholder="0"
            />
          </div>
          <div className={styles.priceInputBox}>
            <label>Max Price (R)</label>
            <input 
              type="number" 
              value={filters.maxPrice < 10000000 ? filters.maxPrice : ''} 
              onChange={(e) => onPriceChange('maxPrice', e.target.value)}
              placeholder="Any"
            />
          </div>
        </div>
      </div>

      <div className={styles.filterSection}>
        <h4 className={styles.sectionTitle}>YEAR</h4>
        <div className={styles.yearFilterWrap}>
          <div className={styles.yearSelectBox}>
             <label>From</label>
             <select value={filters.minYear} onChange={(e) => onYearChange('minYear', e.target.value)}>
                <option value="1990">1990</option>
                {Array.from({length: 35}, (_, i) => 2025 - i).map(y => (
                  <option key={`min-${y}`} value={y}>{y}</option>
                ))}
             </select>
          </div>
          <div className={styles.yearSelectBox}>
             <label>To</label>
             <select value={filters.maxYear} onChange={(e) => onYearChange('maxYear', e.target.value)}>
                <option value="2026">2026</option>
                {Array.from({length: 35}, (_, i) => 2025 - i).map(y => (
                  <option key={`max-${y}`} value={y}>{y}</option>
                ))}
             </select>
          </div>
        </div>
      </div>

      <div className={styles.filterSection}>
        <h4 className={styles.sectionTitle}>LOCATION</h4>
        <div className={styles.yearSelectBox} style={{ marginTop: '12px' }}>
          <select 
            value={filters.location} 
            onChange={(e) => onLocationChange(e.target.value)}
          >
            <option value="All">All Locations</option>
            <option value="Eastern Cape">Eastern Cape</option>
            <option value="Free State">Free State</option>
            <option value="Gauteng">Gauteng</option>
            <option value="KwaZulu-Natal">KwaZulu-Natal</option>
            <option value="Limpopo">Limpopo</option>
            <option value="Mpumalanga">Mpumalanga</option>
            <option value="North West">North West</option>
            <option value="Northern Cape">Northern Cape</option>
            <option value="Western Cape">Western Cape</option>
          </select>
        </div>
      </div>

      <div className={styles.sidebarActions}>
         <button className={styles.resetBtn} onClick={onClear}>RESET ALL FILTERS</button>
      </div>
    </>
  );
};

export default FilterSidebar;
