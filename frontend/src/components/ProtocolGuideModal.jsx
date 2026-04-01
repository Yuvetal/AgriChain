import React from "react";
import "./ProtocolGuideModal.css";

export default function ProtocolGuideModal({ onClose }) {
  return (
    <div className="pg-modal-overlay" onClick={onClose}>
      <div className="pg-modal-card glass-card" onClick={(e) => e.stopPropagation()}>
        <button className="pg-close-btn" onClick={onClose}>×</button>
        
        <header className="pg-header">
          <div className="pg-logo-icon">🌿</div>
          <h2 className="pg-title">AgroChainMart Protocol Guide</h2>
          <p className="pg-subtitle">Mathematical Trust in Global Agriculture</p>
        </header>

        <div className="pg-grid">
          <section className="pg-section">
            <h4>🏦 The Escrow Engine</h4>
            <p>
              When a buyer commits funds, it is locked in the <strong>Protocol Escrow</strong>. 
              The farmer cannot touch it, and the buyer cannot withdraw it without proof. 
              Transparency is forced by code.
            </p>
          </section>

          <section className="pg-section">
             <h4>⚖️ Hybrid Consensus Arbitration</h4>
             <p>
               Every dispute is resolved by a pool of 5 verified Arbitrators. They vote on 
               <strong>IPFS Video Evidence</strong>. A majority (3/5) determines the outcome.
               Administrators only break ties, ensuring a fair, peer-reviewed court.
             </p>
          </section>

          <section className="pg-section">
             <h4>📱 Invisible Wallet (Web2.5)</h4>
             <p>
               No MetaMask? No problem. Farmers use their <strong>Phone + PIN</strong> to sign 
               cryptographic transactions. Your private key is encrypted and synced across 
               devices via your SMS identity.
             </p>
          </section>

          <section className="pg-section">
             <h4>🏧 The Agri-Gas ATM</h4>
             <p>
               Farmers earn in INR but pay network fees in ETH. Our built-in ATM 
               automatically converts your blockchain earnings into <strong>Gas (ETH)</strong> 
               whenever your balance runs low.
             </p>
          </section>

          <section className="pg-section">
             <h4>📹 Evidence Pinning (IPFS)</h4>
             <p>
               Don't just trust, verify. Mandatory <strong>Packing</strong> and <strong>Unboxing</strong> 
               videos are permanently pinned to the IPFS network. These hashes are locked on the 
               blockchain—immutable proof of quality.
             </p>
          </section>

          <section className="pg-section">
             <h4>🔗 Traceable Lineage</h4>
             <p>
               Scan any batch QR to see its entire history: when it was harvested, who 
               transported it, and which arbitrator verified the quality. Total provenance.
             </p>
          </section>
        </div>

        <footer className="pg-footer">
          <button className="pg-ok-btn" onClick={onClose}>I Understand the Protocol</button>
        </footer>
      </div>
    </div>
  );
}
