import React, { useState, useEffect } from "react";
import { connectWallet, getEthereumObject } from "../utils/ethereum";
import "./WalletConnect.css";

const WalletConnect = ({ onConnect }) => {
  const [currentAccount, setCurrentAccount] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasMetaMask, setHasMetaMask] = useState(false);

  useEffect(() => {
    const eth = getEthereumObject();
    if (eth) {
      setHasMetaMask(true);
      // Optional: Check if already connected without prompting
      if (sessionStorage.getItem("explicitly_logged_out") !== "true") {
        eth.request({ method: "eth_accounts" }).then((accounts) => {
          if (accounts.length > 0) {
            setCurrentAccount(accounts[0]);
            if (onConnect) onConnect(accounts[0]);
          }
        }).catch(console.error);
      }

      // Listen for account changes
      eth.on("accountsChanged", (accounts) => {
        if (accounts.length === 0) {
          setCurrentAccount(""); // Disconnected
        } else {
          setCurrentAccount(accounts[0]);
          if (onConnect) onConnect(accounts[0]);
        }
      });
    }
  }, [onConnect]);

  const handleConnect = async () => {
    sessionStorage.removeItem("explicitly_logged_out");
    setError("");
    setIsLoading(true);
    try {
      const account = await connectWallet();
      setCurrentAccount(account);
      if (onConnect) onConnect(account);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to connect wallet.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!hasMetaMask) {
    return (
      <div className="metamask-prompt-card">
        <h3 className="prompt-title">🦊 MetaMask Required</h3>
        <p className="prompt-desc">To interact with the Sepolia ledger securely, please install the MetaMask browser extension.</p>
        <a 
          href="https://metamask.io/download/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="download-link-btn"
        >
          Download Extension
        </a>
      </div>
    );
  }

  return (
    <div className="wallet-connect-wrapper">
      {!currentAccount ? (
        <button 
            onClick={handleConnect} 
            disabled={isLoading}
            className="connect-wallet-btn"
        >
          {isLoading ? "Synchronizing..." : "Connect MetaMask 🦊"}
        </button>
      ) : (
        <div className="wallet-connected-pill">
          <span className="status-dot"></span>
          <span className="wallet-addr">{currentAccount.slice(0, 6)}...{currentAccount.slice(-4)}</span>
        </div>
      )}
      
      {error && (
        <div className="wallet-error-msg">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
};

export default WalletConnect;
