import styles from './DashboardLayout.module.css';
import { FaThLarge, FaCar, FaGavel, FaWallet, FaCog, FaTimes, FaRegHeart, FaBookmark, FaStream, FaFire } from 'react-icons/fa';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    { title: 'Auction Floor', icon: <FaThLarge className={styles.navIcon} />, path: '/auction-floor' },
    { title: 'Live Feed', icon: <FaStream className={styles.navIcon} />, path: '/live-feed' },
    { title: 'Trending', icon: <FaFire className={styles.navIcon} />, path: '/trending' },
    { title: 'Overview', icon: <FaThLarge className={styles.navIcon} />, path: '/dashboard' },
    { title: 'My Listings', icon: <FaCar className={styles.navIcon} />, path: '/my-listings' },
    { title: 'Bids', icon: <FaGavel className={styles.navIcon} />, path: '/dashboard/activity?tab=bids' },
    { title: 'Likes', icon: <FaRegHeart className={styles.navIcon} />, path: '/dashboard/activity?tab=likes' },
    { title: 'Followed', icon: <FaBookmark className={styles.navIcon} />, path: '/dashboard/activity?tab=bookmarks' },
    { title: 'Financials', icon: <FaWallet className={styles.navIcon} />, path: '#' },
    { title: 'Settings', icon: <FaCog className={styles.navIcon} />, path: '/profile' },
  ];

  return (
    <>
      <div className={`${styles.sidebarOverlay} ${isOpen ? styles.overlayVisible : ''}`} onClick={onClose} />
      <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.brand}>
            <h2 className={styles.brandTitle}>Seller Studio</h2>
            <p className={styles.brandSubtitle}>ELITE PERFORMANCE</p>
          </div>
          <button className={styles.closeSidebar} onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <nav className={styles.navMenu}>
          {menuItems.map((item, index) => (
            <Link
              key={index}
              to={item.path}
              className={`${styles.navItem} ${item.path === location.pathname ? styles.active : ''}`}
            >
              {item.icon}
              {item.title}
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarBottom}>
          <button onClick={() => navigate('/new-listing')} className={styles.listVehicleBtn}>Publish My Luxury Car</button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
