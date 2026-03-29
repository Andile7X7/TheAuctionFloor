import { useState } from 'react'
import { Routes, Route } from 'react-router-dom';
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'
import AuctionFloor from './Pages/AuctionFloor';
import Notifications from './Pages/Notifications';
import SignUpForm from './Modules/SignUpForm'
import SignUpPage from './Pages/SignUpPage'
import SignUpHeader from './Modules/SignUpHeader'
import Login from './Modules/LogInForm'
import Dashboard from './Pages/Dashboard';
import AddListing from './Pages/AddListing';
import MyListings from './Pages/MyListings';
import ListingDetail from './Pages/ListingDetail';
import ActivityTracking from './Pages/ActivityTracking';
import { HashRouter } from "react-router-dom";

function App() {
  return (
    <>
      <HashRouter basename = "/AuctionFloor">
      <Routes>
        <Route path={'/'} element={<AuctionFloor />} />
        <Route path={'/signup'} element={<SignUpPage />} />
        <Route path={'/dashboard'} element={<Dashboard />} />
        <Route path={'/new-listing'} element={<AddListing />} />
        <Route path={'/my-listings'} element={<MyListings />} />
        <Route path={'/listing/:id'} element={<ListingDetail />} />
        <Route path={'/dashboard/activity'} element={<ActivityTracking />} />
        <Route path={'/dashboard/notifications'} element={<Notifications />} />
      </Routes>
    </HashRouter>
    </>
  )
}

export default App
