import React, { useState } from "react";
import { ethers } from "ethers";
import { getEthereumObject, getContract } from "../utils/ethereum";
import { parseWeb3Error } from "../utils/errorHelper";
import { useNavigate } from "react-router-dom";
import "./ArbitratorLogin.css"; // Reuse the dark/gold premium theme

export default function ArbitratorApply() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [apmcId, setApmcId] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState("metamask");
  const [authPhone, setAuthPhone] = useState("");
  const [pin, setPin] = useState("");

  React.useEffect(() => {
    const fetchWallet = async () => {
      const eth = getEthereumObject();
      if (eth) {
        const accounts = await eth.request({ method: "eth_accounts" });
        if (accounts.length > 0) setWallet(accounts[0].toLowerCase());
      }
    };
    fetchWallet();
  }, []);

  const handleApply = async (e) => {
    e.preventDefault();
    setError("");
    setMsg("");

    if (!name || !apmcId || !phone) {
      setError("All fields are required.");
      return;
    }

    setIsLoading(true);

    try {
      const eth = getEthereumObject();
      if (!eth) {
        setError("MetaMask is required to submit an application.");
        setIsLoading(false);
        return;
      }

      const accounts = await eth.request({ method: "eth_requestAccounts" });
      const address = accounts[0].toLowerCase();

      const { contract } = await getContract();

      // Check if already applied or already an arbitrator
      const isArb = await contract.isArbitrator(address);
      if (isArb) {
        setError("Your wallet is already a registered active arbitrator.");
        setIsLoading(false);
        return;
      }

      const existingApp = await contract.arbitratorApplications(address);
      if (existingApp !== ethers.ZeroHash) {
        setError("You already have a pending application awaiting votes.");
        setIsLoading(false);
        return;
      }

      // Generate Credential Hash (Off-chain representation)
      // In production, this data would be uploaded to IPFS and the CID hash stored.
      // For now, we hash the stringified data.
      setMsg(`⏳ Submitting Identity parameters natively to APMC Ledger...`);
      const tx = await contract.applyAsArbitrator(name, apmcId, phone);
      await tx.wait();

      setMsg("✅ Application successfully submitted! Existing arbitrators will now review your credentials. You need 3 peer approvals to be inducted.");
      setName("");
      setApmcId("");
      setPhone("");

    } catch (err) {
      setError(parseWeb3Error(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinApply = async (e) => {
    e.preventDefault();
    setError("");
    setMsg("");
    if (!name || !apmcId || !phone) {
      setError("Your credential fields (Name, APMC ID, Phone) are required.");
      return;
    }
    if (!authPhone || pin.length < 4) {
      setError("Enter the Phone Number and PIN associated with your Invisible Wallet vault.");
      return;
    }

    setIsLoading(true);

    try {
      const dynamicVaultKey = `farmer_vault_${authPhone}`;
      const encryptedJson = localStorage.getItem(dynamicVaultKey);
      if (!encryptedJson) {
        setError("No Invisible Wallet vault was found on this device for that phone number.");
        setIsLoading(false);
        return;
      }

      setMsg("🔓 Decrypting Invisible Wallet...");
      
      const password = `${authPhone}:${pin}`;
      let decWallet;
      try {
        decWallet = await ethers.Wallet.fromEncryptedJson(encryptedJson, password);
      } catch (err) {
        setError("Incorrect PIN. Cryptographic decryption failed.");
        setIsLoading(false);
        return;
      }

      setMsg(`⏳ Connected securely to ${decWallet.address}! Submitting application to Ledger...`);

      // Connect explicitly to standard endpoints (Bypassing MetaMask entirely)
      const rpcUrl = process.env.REACT_APP_ALCHEMY_RPC_URL || "https://rpc.sepolia.org";
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const connectedWallet = decWallet.connect(provider);

      // We dynamically import the artifact to avoid massive bundle locking
      const contractArtifact = require("../contracts/SupplyChain.json");
      const contract = new ethers.Contract(contractArtifact.address, contractArtifact.abi, connectedWallet);

      // Check duplications
      const isArb = await contract.isArbitrator(decWallet.address);
      if (isArb) {
        setError("This invisible wallet is already a registered active arbitrator.");
        setIsLoading(false);
        return;
      }

      const existingApp = await contract.arbitratorApplications(decWallet.address);
      if (existingApp !== ethers.ZeroHash) {
        setError("You already have a pending application awaiting votes.");
        setIsLoading(false);
        return;
      }

      const tx = await contract.applyAsArbitrator(name, apmcId, phone);
      await tx.wait();

      setMsg("✅ Application successfully submitted! Existing arbitrators will now review your credentials.");
      setName(""); setApmcId(""); setPhone(""); setAuthPhone(""); setPin("");

    } catch (err) {
      setError(parseWeb3Error(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="arb-login-page">
      <div className="arb-login-card">
        <div className="arb-login-header">
          <div className="arb-shield-icon">📜</div>
          <h1 className="arb-login-title">Join the APMC Pool</h1>
          <p className="arb-login-subtitle">Certified Arbitrator Application</p>
        </div>

        <div className="arb-mode-tabs" style={{ display: 'flex', borderBottom: '1px solid #333', marginBottom: '16px' }}>
          <button
            className={`arb-tab ${mode === "metamask" ? "active" : ""}`}
            onClick={() => { setMode("metamask"); setError(""); }}
            style={{ flex: 1, padding: '12px', background: 'transparent', color: mode === "metamask" ? '#fbbf24' : '#9ca3af', borderBottom: mode === "metamask" ? '2px solid #fbbf24' : 'none', cursor: 'pointer' }}
          >
            🦊 MetaMask
          </button>
          <button
            className={`arb-tab ${mode === "pin" ? "active" : ""}`}
            onClick={() => { setMode("pin"); setError(""); }}
            style={{ flex: 1, padding: '12px', background: 'transparent', color: mode === "pin" ? '#fbbf24' : '#9ca3af', borderBottom: mode === "pin" ? '2px solid #fbbf24' : 'none', cursor: 'pointer' }}
          >
            📱 Phone + PIN
          </button>
        </div>

        <form className="arb-panel" onSubmit={mode === "metamask" ? handleApply : handlePinApply}>
          <p className="arb-panel-desc" style={{ marginBottom: "16px" }}>
            Submit your credentials to the decentralized dispute resolution network. 
            Once submitted, your application requires <strong>3 peer approvals</strong> from existing active arbitrators.
          </p>

          <div className="arb-field">
            <label>Legal Name</label>
            <input
              type="text"
              placeholder="e.g. Ramesh Kumar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="arb-field">
            <label>APMC Registration ID</label>
            <input
              type="text"
              placeholder="e.g. APMC-WB-2026-904"
              value={apmcId}
              onChange={(e) => setApmcId(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="arb-field">
            <label>Public Profile Phone Number</label>
            <input
              type="text"
              placeholder="e.g. Profile Contact"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {mode === "metamask" ? (
            <div className="arb-field" style={{ marginTop: "12px" }}>
              <label>Connected Identity (MetaMask)</label>
              <input 
                type="text" 
                value={wallet || "Not connected"} 
                disabled 
                style={{ opacity: 0.6, cursor: "not-allowed", fontSize: "0.85rem", letterSpacing: "1px" }}
              />
              <small style={{ color: "#9ca3af", display: "block", marginTop: "8px", lineHeight: "1.4" }}>
                * This application will be cryptographically bound to the active wallet address above, <strong>not</strong> your phone number. 
                <br/><br/>If you want to create an application for a different user, please switch to a new account inside your MetaMask Extension first!
              </small>
            </div>
          ) : (
            <>
              <div className="arb-field" style={{ marginTop: "16px", borderTop: "1px dashed #444", paddingTop: "16px" }}>
                <label style={{ color: "#fbbf24" }}>🔒 Vault Identity: Auth Phone</label>
                <input
                  type="text"
                  placeholder="Enter the Vault Phone number"
                  value={authPhone}
                  onChange={(e) => setAuthPhone(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="arb-field">
                <label style={{ color: "#fbbf24" }}>🔒 Vault Identity: PIN</label>
                <input
                  type="password"
                  placeholder="4-digit PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  maxLength={4}
                  disabled={isLoading}
                />
                <small style={{ color: "#9ca3af", display: "block", marginTop: "8px", lineHeight: "1.4" }}>
                  * We will fetch and decrypt the hidden <code>farmer_vault_</code> from your device utilizing AES-256 to sign your application contract without MetaMask. Gas fees will be naturally deducted from this Invisible Wallet!
                </small>
              </div>
            </>
          )}


          <button
            className="arb-connect-btn"
            type="submit"
            disabled={isLoading}
            style={{ marginTop: "16px" }}
          >
            {isLoading ? "Submitting..." : "Submit Application"}
          </button>
        </form>

        {error && <div className="arb-error">⚠️ {error}</div>}
        
        {msg && (
          <div style={{
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            color: "#86efac",
            padding: "12px 16px",
            borderRadius: "12px",
            marginTop: "16px",
            fontSize: "0.85rem",
            fontWeight: "600"
          }}>
            {msg}
          </div>
        )}

        <div className="arb-info-block">
          <p>Already approved?</p>
          <a href="#" onClick={(e) => { e.preventDefault(); navigate("/arbitrator-login"); }}>
            Access the Arbitrator Portal
          </a>
        </div>
      </div>
    </div>
  );
}
