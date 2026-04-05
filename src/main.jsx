import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { HashRouter } from "react-router-dom";

// Theme Persistence Initialization
(function() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
})();

createRoot(document.getElementById('root')).render(
  <HashRouter>
    <App />
  </HashRouter>
)
