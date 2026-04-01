import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Contact from "./pages/Contact";
import ViewBlockchain from "./pages/ViewBlockchain";
import AddTransaction from "./features/AddTransaction";
import Dashboard from "./pages/Dashboard";
import ArbitratorLogin from "./pages/ArbitratorLogin";
import ArbitratorDashboard from "./pages/ArbitratorDashboard";
import ArbitratorApply from "./pages/ArbitratorApply";
import DeliveryConfirm from "./pages/DeliveryConfirm";
import { getEthereumObject } from "./utils/ethereum";

function App() {
  const [account, setAccount] = useState("");
  const [arbitratorAccount, setArbitratorAccount] = useState("");
  const [isAppReady, setIsAppReady] = useState(false);

  // Check if dual-auth wallet is connected on load
  useEffect(() => {
    // 1. Check Native Web2.5 Farmer Session First
    const isFarmerAuthed = localStorage.getItem("farmer_session_active") === "true";
    if (isFarmerAuthed) {
      setAccount(localStorage.getItem("farmer_address") || "0xFarmer");
      setIsAppReady(true);
      return;
    }

    // 2. Check MetaMask Institutional Connect
    const explicitLogout = sessionStorage.getItem("explicitly_logged_out") === "true";
    if (explicitLogout) {
      setIsAppReady(true);
      return;
    }

    const eth = getEthereumObject();
    if (eth) {
      eth.request({ method: "eth_accounts" })
        .then(accounts => {
          if (accounts[0]) setAccount(accounts[0]);
        })
        .catch(console.error)
        .finally(() => setIsAppReady(true)); // Block route evaluation until resolved

      eth.on("accountsChanged", (accounts) => {
        if (accounts[0]) {
          setAccount(accounts[0]);
        } else {
          // Fallback to Farmer session if MetaMask disconnects
          if (localStorage.getItem("farmer_session_active") === "true") {
             setAccount(localStorage.getItem("farmer_address"));
          } else {
             setAccount("");
          }
        }
      });
    } else {
      setIsAppReady(true); // No MetaMask detected, unblock routing
    }
  }, []);

  const isAuth = !!account;

  if (!isAppReady) {
    return (
      <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", backgroundColor: "#f4f7f6" }}>
        <h2 style={{ color: "#2e7d32" }}>Initializing Web3 Environment...</h2>
      </div>
    );
  }

  return (
    <Router>
      <div className="flex flex-col min-h-screen">
        <Navbar account={account} />
        <main className="flex-grow">
          <Routes>
            {/* 🔓 Public routes */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login isAuth={isAuth} setAccount={setAccount} />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/view-blockchain" element={<ViewBlockchain />} />

            {/* 🔒 Protected routes */}
            <Route
              path="/dashboard"
              element={isAuth ? <Dashboard /> : <Navigate to="/login" />}
            />

            <Route
              path="/add-produce"
              element={isAuth ? <AddTransaction /> : <Navigate to="/login" />}
            />
            {/* 🚚 Delivery Handshake Flow */}
            <Route 
              path="/delivery/:batchId"
              element={<DeliveryConfirm />} 
            />

            {/* ⚖️ Arbitrator Portal */}
            <Route
              path="/arbitrator-login"
              element={<ArbitratorLogin setArbitratorAccount={setArbitratorAccount} />}
            />
            <Route
              path="/arbitrator-dashboard"
              element={<ArbitratorDashboard arbitratorAccount={arbitratorAccount} />}
            />
            <Route
              path="/arbitrator-apply"
              element={<ArbitratorApply />}
            />

            {/* 🛑 Fallback */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
