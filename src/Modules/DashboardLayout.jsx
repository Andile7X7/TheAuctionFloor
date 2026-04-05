import UniversalHeader from './UniversalHeader';
import Sidebar from './Sidebar';
import styles from './DashboardLayout.module.css';

const DashboardLayout = ({ children, searchTerm, onSearch }) => {
  return (
    <div className={styles.dashboardContainer}>
      <UniversalHeader searchTerm={searchTerm} onSearch={onSearch} />
      <div className={styles.dashboardMain}>
        <Sidebar />
        <div className={styles.scrollableArea}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
