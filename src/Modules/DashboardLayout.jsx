import { useState } from 'react';
import UniversalHeader from './UniversalHeader';
import Sidebar from './Sidebar';
import styles from './DashboardLayout.module.css';

const DashboardLayout = ({ children, searchTerm, onSearch }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={styles.dashboardContainer}>
      <UniversalHeader
        searchTerm={searchTerm}
        onSearch={onSearch}
        onOpenSidebar={() => setSidebarOpen(true)}
      />
      <div className={styles.dashboardMain}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className={styles.scrollableArea}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
