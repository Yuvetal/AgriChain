import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { logoutFarmer } from "../utils/LocalWallet";
import "./Navbar.css";

export default function Navbar({ account }) {
  const navigate = useNavigate();

  const handleDisconnect = () => {
    // 1. Terminate the Farmer Session (Web2.5)
    logoutFarmer();
    
    // 2. Soft-logout the UI for MetaMask users
    // (True Web3 disconnection requires the user to revoke site access inside MetaMask extension)
    sessionStorage.setItem("explicitly_logged_out", "true");
    window.location.href = "/";
  };

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">
        <span className="logo-icon">🌾</span> AgroChainMart
      </Link>
      <div className="navbar-links">
        <Link to="/" className="nav-link">Home</Link>
        <Link to="/view-blockchain" className="nav-link">Explorer</Link>
        
        {account ? (
          <>
            <Link to="/dashboard" className="nav-link">Dashboard</Link>
            <div className="account-pill">
              <span className="status-dot"></span>
              {account.slice(0, 6)}...{account.slice(-4)}
            </div>
            <button 
              onClick={handleDisconnect} 
              className="signout-button"
            >
              Sign Out
            </button>
          </>
        ) : (
          <Link to="/login" className="nav-link login-btn">
            Login Portal
          </Link>
        )}
      </div>
    </nav>
  );
}
