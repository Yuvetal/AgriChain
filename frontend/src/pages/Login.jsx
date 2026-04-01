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
                    <h4 className="terms-title">⚖️ Network Protocol Agreement</h4>
                    <div className="terms-scrollbox">
                        <p><b>1. Logistic Custody:</b> The Farmer is solely responsible for safe, timely transportation of goods.</p>
                        <p><b>2. Native Gas Economy:</b> All network fees are paid by users. Our <b>Agri-Gas ATM</b> facilitates seamless INR-to-ETH conversion natively—no third-party software required.</p>
                        <p><b>3. Admin Stake Sponsorship:</b> We front the 0.01 ETH stake for first-time farmers. Once you earn more than 0.01 ETH, you must self-fund all future security stakes.</p>
                        <p><b>4. Geographic Integrity:</b> You must provide accurate, real-time product locations. Falsifying this data is grounds for immediate buyer-initiated refunds.</p>
                        <p><b>5. Spoilage Policy:</b> If goods are destroyed in transit, the buyer gets a 100% refund and the farmer's stake is restored to ensure fairness.</p>
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
