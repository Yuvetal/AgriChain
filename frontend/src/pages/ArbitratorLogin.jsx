import { useState } from "react";
import { ethers } from "ethers";
import { getEthereumObject, getContract } from "../utils/ethereum";
import { useNavigate } from "react-router-dom";
import "./ArbitratorLogin.css";

export default function ArbitratorLogin({ setArbitratorAccount }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("metamask"); // "metamask" | "pin"

  // PIN Auth state
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Cloud Recovery State
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // ── MetaMask Auth ─────────────────────────────────────────────────
  const handleMetaMaskLogin = async () => {
    setError("");
    setIsLoading(true);
    try {
      const eth = getEthereumObject();
      if (!eth) { setError("MetaMask not detected."); return; }

      const accounts = await eth.request({ method: "eth_requestAccounts" });
      const address = accounts[0].toLowerCase();

      await verifyArbitratorOnChain(address);
    } catch (err) {
      setError("MetaMask connection failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── PIN (Invisible Wallet) Auth ──────────────────────────────────
  const handlePinLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (!phone || pin.length < 4) {
      setError("Enter your registered phone number and PIN.");
      return;
    }
    setIsLoading(true);
    try {
      const dynamicVaultKey = `farmer_vault_${phone}`;
      const encryptedJson = localStorage.getItem(dynamicVaultKey);
      if (!encryptedJson) { 
        setError("No wallet found for this phone number."); 
        setIsLoading(false);
        return; 
      }

      const password = `${phone}:${pin}`;
      let wallet;
      try {
        wallet = await ethers.Wallet.fromEncryptedJson(encryptedJson, password);
      } catch (err) {
        setError("Incorrect PIN. Cryptographic decryption failed.");
        setIsLoading(false);
        return;
      }

      const address = wallet.address.toLowerCase();
      await verifyArbitratorOnChain(address);
    } catch {
      setError("Authentication failed. Check your credentials.");
      setIsLoading(false);
    }
  };

  const handleStartRecovery = async () => {
    if (!phone) { setError("❌ Enter your phone number first."); return; }
    setIsLoading(true);
    setStatusMsg("⏳ Requesting Identity Recovery OTP...");
    try {
        const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
        const res = await fetch(`${API_URL}/api/otp/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone })
        });
        if (!res.ok) throw new Error("Failed to send OTP.");
        setShowOtpInput(true);
        setStatusMsg("📩 OTP Sent! Enter it to pull your encrypted vault from the cloud.");
    } catch (err) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const handleFinalizeRecovery = async () => {
    setIsLoading(true);
    setStatusMsg("⏳ Synchronizing with AgriVault...");
    try {
        const { fetchVaultFromCloud } = await import("../utils/LocalWallet");
        await fetchVaultFromCloud(phone, recoveryOtp);
        setStatusMsg("✅ Vault Localized! Now enter your PIN to sign in.");
        setShowOtpInput(false);
    } catch (err) { setError(`❌ ${err.message}`); }
    finally { setIsLoading(false); }
  };

  // ── On-chain Verification ────────────────────────────────────────
  const verifyArbitratorOnChain = async (address) => {
    try {
      const { contract } = await getContract();
      const arb = await contract.getArbitrator(address);

      if (!arb.isActive) {
        setError("This address is not a registered, active arbitrator.");
        return;
      }

      // Store session
      sessionStorage.setItem("arbitrator_session", "true");
      sessionStorage.setItem("arbitrator_address", address);

      setArbitratorAccount(address);
      navigate("/arbitrator-dashboard");
    } catch {
      setError("Could not verify arbitrator status. Ensure MetaMask is on the correct network.");
    }
  };

  return (
    <div className="arb-login-page">
      <div className="arb-login-card">

        {/* ── Header ───────────────────────────────────────────── */}
        <div className="arb-login-header">
          <div className="arb-shield-icon">⚖️</div>
          <h1 className="arb-login-title">Arbitrator Portal</h1>
          <p className="arb-login-subtitle">
            Certified APMC Dispute Resolution Network
          </p>
        </div>

        {/* ── Auth Mode Tabs ───────────────────────────────────── */}
        <div className="arb-mode-tabs">
          <button
            className={`arb-tab ${mode === "metamask" ? "active" : ""}`}
            onClick={() => { setMode("metamask"); setError(""); }}
          >
            🦊 MetaMask
          </button>
          <button
            className={`arb-tab ${mode === "pin" ? "active" : ""}`}
            onClick={() => { setMode("pin"); setError(""); }}
          >
            📱 Phone + PIN
          </button>
        </div>

        {/* ── MetaMask Panel ───────────────────────────────────── */}
        {mode === "metamask" && (
          <div className="arb-panel">
            <p className="arb-panel-desc">
              Connect your institutional MetaMask wallet. Your address will be verified against the on-chain arbitrator registry.
            </p>
            <button
              className="arb-connect-btn"
              onClick={handleMetaMaskLogin}
              disabled={isLoading || !acceptedTerms}
            >
              {isLoading ? "Verifying on-chain..." : "🦊 Connect MetaMask"}
            </button>
            
            {/* MetaMask Terms Acceptance */}
            <div className="arb-terms-wrapper">
               <label className="arb-terms-checkbox">
                  <input 
                     type="checkbox" 
                     required 
                     checked={acceptedTerms}
                     onChange={(e) => setAcceptedTerms(e.target.checked)}
                  />
                  <span>I am a certified APMC Arbitrator and accept the Code of Conduct.</span>
               </label>
            </div>
          </div>
        )}

        {/* ── PIN Panel ────────────────────────────────────────── */}
        {mode === "pin" && (
          <form className="arb-panel" onSubmit={handlePinLogin}>
            <p className="arb-panel-desc">
              Access your Invisible Wallet using the phone number and PIN you registered with.
            </p>
            <div className="arb-field">
              <label>Phone Number</label>
              <input
                type="text"
                placeholder="10-digit number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="arb-field">
              <label>PIN</label>
              <input
                type="password"
                placeholder="4–6 digit PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </div>

            <div className="arb-terms-scroll-section">
               <h4 className="arb-terms-title">⚖️ Arbitrator's Code of Conduct</h4>
               <div className="arb-terms-scroll">
                  <p><b>1. Evidence Neutrality:</b> Arbitrators must vote strictly on the IPFS video evidence provided by the Farmer and Buyer. External bias or collusion is a violation of the protocol.</p>
                  <p><b>2. Bond Forfeiture:</b> Recruitment into a pool requires a 0.01 ETH Bond (Self-funded or Pool-sponsored). If you fail to vote before the block expiry, your bond is permanently forfeited to the protocol treasury.</p>
                  <p><b>3. Consensus Recognition:</b> You agree that a 3/5 majority is the final legal determination. All future smart contract payouts are bound by this consensus.</p>
                  <p><b>4. Recruitment Liquidity:</b> In cases of stalled pools, you acknowledge that an Admin tie-breaker may be engaged to maintain supply chain liquidity.</p>
               </div>
               <label className="arb-terms-checkbox-inline">
                  <input 
                     type="checkbox" 
                     required 
                     checked={acceptedTerms}
                     onChange={(e) => setAcceptedTerms(e.target.checked)}
                  />
                  <span>Accept the Judicial Protocol</span>
               </label>
            </div>

            <button
              className="arb-connect-btn"
              type="submit"
              disabled={isLoading || !acceptedTerms}
            >
              {isLoading ? "Verifying..." : "🔐 Access Portal"}
            </button>
          </form>
        )}

        {/* ── Error ─────────────────────────────────────────────── */}
        {error && (
          <div className="arb-error">⚠️ {error}</div>
        )}

        {/* ── Info Block ───────────────────────────────────────── */}
        <div className="arb-info-block">
          <p>🛡️ This portal is restricted to <strong>certified APMC arbitrators</strong> registered on-chain.</p>
          <p>📋 To apply, visit the <a href="/arbitrator-apply">arbitrator application page</a>.</p>
        </div>

      </div>
    </div>
  );
}
