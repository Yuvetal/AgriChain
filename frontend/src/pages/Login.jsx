import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import WalletConnect from "../components/WalletConnect";
import { loginOrGenerateFarmer } from "../utils/LocalWallet";
import { parseWeb3Error } from "../utils/errorHelper";
import "./Login.css";

function Login({ isAuth, setAccount }) {
  const navigate = useNavigate();
  const [phoneNumber, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState("");
  const [newWalletKey, setNewWalletKey] = useState(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
  // Cloud Recovery State
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [showOtpInput, setShowOtpInput] = useState(false);

  // Prevent users from navigating to /login if they are already authenticated, but strictly enforce the Seed Phrase Backup Checkpoint
  useEffect(() => {
    const sessionActive = localStorage.getItem("farmer_session_active") === "true";
    const sessionPhone = localStorage.getItem("farmer_session_phone");
    
    // We only auto-route them if their session proves they've acknowledged their Private Key
    if (isAuth || (sessionActive && sessionPhone)) {
        const isBackedUp = localStorage.getItem(`farmer_vault_backed_up_${sessionPhone}`) === "true";
        if (isBackedUp) {
            navigate("/dashboard");
        }
    }
  }, [isAuth, navigate]);

  const handleFarmerAuth = async (e) => {
    e.preventDefault();
    try {
        setStatus("⏳ Booting Cryptographic Vault Gen Engine...");
        const { wallet, isNewAccount } = await loginOrGenerateFarmer(phoneNumber, pin, (percent) => {
           setStatus(`⏳ Encrypting Private Key: ${Math.round(percent * 100)}% completed...`); 
        });
        
        // Push the newly decrypted secure vault address UP to the global React Router!
        if (setAccount && wallet) {
           setAccount(wallet.address);
        }

        // Feature Upgrade: Check the permanent device flag! Applies to ALL farmers (New and Existing)
        const backupFlag = `farmer_vault_backed_up_${phoneNumber}`;
        const hasBackedUp = localStorage.getItem(backupFlag) === "true";

        if (!hasBackedUp) {
           // HALT THE DASHBOARD ROUTING! FORCE THE FARMER TO READ THEIR KEY!
           setNewWalletKey(wallet.privateKey);
           setStatus("⚠️ ACTION REQUIRED: Master Key Backup Verification");
        } else {
           setStatus("✅ Successfully securely authenticated!");
           navigate("/dashboard"); // Smooth DDP transition!
        }
    } catch (err) {
        console.error(err);
        setStatus(parseWeb3Error(err));
    }
  };

  const handleStartRecovery = async () => {
    if (!phoneNumber) { setStatus("❌ Enter your phone number first."); return; }
    try {
        setStatus("⏳ Requesting Identity Recovery OTP...");
        const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
        const res = await fetch(`${API_URL}/api/otp/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: phoneNumber })
        });
        if (!res.ok) throw new Error("Failed to send OTP.");
        setShowOtpInput(true);
        setStatus("📩 OTP Sent! Enter it to pull your encrypted vault from the cloud.");
    } catch (err) { setStatus(err.message); }
  };

  const handleFinalizeRecovery = async () => {
    try {
        setStatus("⏳ Synchronizing with AgriVault...");
        const { fetchVaultFromCloud } = await import("../utils/LocalWallet");
        await fetchVaultFromCloud(phoneNumber, recoveryOtp);
        setStatus("✅ Vault Localized! Now enter your PIN to sign in.");
        setShowOtpInput(false);
        setIsRecovering(false);
    } catch (err) { setStatus(`❌ ${err.message}`); }
  };

  return (
    <div className="login-container">
      <div className="login-box glass-card">
        
        {/* Farmer Portal Section */}
        <div className="auth-section farmer-auth">
            <h2 className="section-title">🚜 Farmer SMS Portal</h2>
            <p className="section-desc">
              Direct access via cell network. Your cryptographic vault remains encrypted on this device.
            </p>
            
            {newWalletKey ? (
              <div className="security-alert-box">
                  <h3 className="alert-title">🚨 CRITICAL: SAVE YOUR MASTER KEY</h3>
                  <p className="alert-desc">
                      This is the <b>absolute only copy</b> of your Ethereum Private Key. We do NOT have it. If you forget your PIN, your money is lost forever unless you write this down:
                  </p>
                  <div className="key-display-vault">
                      {newWalletKey}
                  </div>
                  <button 
                      onClick={() => {
                          localStorage.setItem(`farmer_vault_backed_up_${phoneNumber}`, "true");
                          setStatus("✅ Security Checkpoint Passed!");
                          navigate("/dashboard");
                      }}
                      className="glow-button backup-confirm-btn"
                  >
                      I have safely written this code down
                  </button>
              </div>
            ) : (
              <form onSubmit={handleFarmerAuth} className="login-form">
                <div className="form-group">
                    <label>Phone Identity</label>
                    <input 
                      type="tel" 
                      placeholder="e.g. 555-1234" 
                      required 
                      value={phoneNumber} 
                      onChange={e => setPhone(e.target.value)}
                      className="login-input"
                    />
                </div>
                
                {/* Cloud Recovery Trigger */}
                {(!localStorage.getItem(`farmer_vault_${phoneNumber}`) && phoneNumber.length >= 10) && (
                   <div className="recovery-prompt">
                      {!showOtpInput ? (
                        <button type="button" onClick={handleStartRecovery} className="text-link-btn">
                           First time on this device? ☁️ Sync from Cloud
                        </button>
                      ) : (
                        <div className="otp-recovery-box">
                           <input 
                             type="text" 
                             placeholder="Enter 6-digit OTP" 
                             value={recoveryOtp} 
                             onChange={e => setRecoveryOtp(e.target.value)}
                             className="otp-input"
                           />
                           <button type="button" onClick={handleFinalizeRecovery} className="verify-btn">
                             Verify & Pull Vault
                           </button>
                        </div>
                      )}
                   </div>
                )}

                <div className="form-group">
                    <label>4-Digit Security PIN</label>
                    <input 
                      type="password" 
                      placeholder="****" 
                      required 
                      minLength="4"
                      maxLength="4"
                      value={pin} 
                      onChange={e => setPin(e.target.value)}
                      className="pin-input"
                    />
                </div>

                <div className="terms-container">
                    <h4 className="terms-title">⚖️ Global Harvest Protocol Agreement</h4>
                    <div className="terms-scrollbox">
                        <p><b>1. Logistic Custody & Provenance:</b> The Farmer is the sole custodian of the physical produce. By minting a batch, you agree that your GPS location and harvest data are mathematically pinned to the Sepolia Ledger.</p>
                        <p><b>2. Invisible Vault & Cloud Sync:</b> Your Private Key is encrypted locally. By using this portal, you acknowledge that a <b>Cloud Backup</b> of your locked vault is stored on the AgriVault server to enable cross-device access via your SMS identity.</p>
                        <p><b>3. Automated Gas ATM:</b> This protocol features an automated fiscal bridge. Whenever your vault balance drops below the threshold for transaction fees, the system will automatically convert a portion of your INR earnings into <b>ETH Gas</b> to ensure zero-downtime operations.</p>
                        <p><b>4. Immutable Evidence Requirement:</b> All farmers MUST upload a <b>Packing Video</b>. Failure to provide clear evidence in a dispute will result in an automatic 100% refund to the Buyer and forfeiture of your stake.</p>
                        <p><b>5. Hybrid Consensus:</b> You agree to abide by the majority decision (3/5) of the Arbitrator Pool. Administrative tie-breaking is only used to ensure protocol liquidity.</p>
                    </div>
                    <label className="terms-checkbox-label">
                        <input 
                            type="checkbox" 
                            required 
                            checked={acceptedTerms}
                            onChange={(e) => setAcceptedTerms(e.target.checked)}
                        />
                        <span>I accept the mathematical game theory rules.</span>
                    </label>
                </div>

                <button type="submit" className="glow-button login-btn" disabled={!acceptedTerms}>
                  {status?.includes('Booting') ? 'Synchronizing...' : 'Enter Protocol Vault'}
                </button>
              </form>
            )}

            {status && !newWalletKey && (
              <div className={`status-banner ${status.includes('❌') ? 'error' : 'info'}`}>
                {status}
              </div>
            )}
        </div>

        <div className="auth-divider"></div>

        {/* Institutional Section */}
        <div className="auth-section institutional-auth">
            <h2 className="section-title">🌐 Institutional Access</h2>
            <p className="section-desc">
              Connect corporate or browser wallets (MetaMask) to manually audit the ledger.
            </p>
            <div className="wallet-connector-wrap">
              <WalletConnect onConnect={(acc) => {
                  if (setAccount) setAccount(acc);
                  navigate("/dashboard");
              }} />
            </div>

            {/* Arbitrator Portal Link */}
            <div style={{ marginTop: "30px", borderTop: "1px dashed rgba(255,255,255,0.1)", paddingTop: "20px", textAlign: "center" }}>
              <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: "0 0 10px 0" }}>
                Are you an active APMC Certified Official?
              </p>
              <button 
                onClick={() => navigate("/arbitrator-login")}
                style={{
                  background: "transparent",
                  color: "#eab308",
                  border: "1px solid #eab308",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  transition: "all 0.2s"
                }}
                onMouseOver={(e) => { e.target.style.background = "rgba(234, 179, 8, 0.1)"; }}
                onMouseOut={(e) => { e.target.style.background = "transparent"; }}
              >
                ⚖️ Access Arbitrator Portal
              </button>
            </div>
        </div>

      </div>
    </div>
  );
}

export default Login;
