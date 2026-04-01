import React from "react";
import farmImage from "../assets/agrochainmart_hero_v2.png";

export default function Home() {
  return (
    <div className="home-container">
      {/* ── Hero Section ────────────────────────────────────── */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">💎 The Future of Digital Harvest v1.0</div>
          <h1 className="hero-title">
            Global Agriculture. <br />
            <span className="text-gradient">Decentralized Trust.</span>
          </h1>
          <p className="hero-subtitle">
            AgroChainMart is the world's first <strong>High-Fidelity Marketplace</strong> 
            bridging physical produce with the Ethereum Ledger via <strong>Immutable Video Proofs</strong> 
            and <strong>Invisible Wallets</strong>.
          </p>
          
          <div className="hero-cta-group">
            <button className="glow-button main-cta" onClick={() => window.location.href='/login'}>
              Launch Marketplace Portal
            </button>
            <button className="secondary-cta" onClick={() => window.location.href='/view-blockchain'}>
              Audit the Ledger
            </button>
          </div>
        </div>

        <div className="hero-visual-box">
          <div className="stats-ping-overlay">
            <div className="stat-item">
              <span className="stat-val">100%</span>
              <span className="stat-lbl">On-Chain Delivery</span>
            </div>
            <div className="stat-item">
              <span className="stat-val">256-bit</span>
              <span className="stat-lbl">Vault Encryption</span>
            </div>
          </div>
          <img src={farmImage} alt="Modern Farming" className="hero-img" />
          <div className="glass-reflection"></div>
        </div>
      </section>

      {/* ── Marketplace Architecture ────────────────────────── */}
      <section className="protocol-info-section">
        <h2 className="section-header">The Three-Pillar Trust Protocol</h2>
        <div className="protocol-grid">
           <div className="protocol-card glass-card">
              <div className="p-icon">🚜</div>
              <h3>The Farmer</h3>
              <p>Mints digital batches directly from the field. Secures inventory with 0.01 ETH <strong>Collateral Bonds</strong> to guarantee quality.</p>
           </div>
           <div className="protocol-card glass-card">
              <div className="p-icon">🛒</div>
              <h3>The Buyer</h3>
              <p>Purchases produce via <strong>Smart Escrow</strong>. Funds are mathematically locked until the physical QR-Handshake is verified.</p>
           </div>
           <div className="protocol-card glass-card">
              <div className="p-icon">⚖️</div>
              <h3>The Arbitrator</h3>
              <p>A decentralized court of 5 verified peers resolving disputes using <strong>IPFS unboxing evidence</strong>. Finality in blocks, not months.</p>
           </div>
        </div>
      </section>

      {/* ── The Tech Stack Highlights ────────────────────────── */}
      <section className="tech-stack-section">
         <div className="tech-intro">
            <h2>Built on the <span className="green-glow">Ethereum Hard-Security</span> Layer</h2>
         </div>
         <div className="tech-grid">
            <div className="tech-tag">🛡️ Non-Custodial Vaults</div>
            <div className="tech-tag">📹 IPFS Evidence Pinning</div>
            <div className="tech-tag">🏧 Automated Gas ATM</div>
            <div className="tech-tag">📱 Invisible Mobile Wallets</div>
            <div className="tech-tag">🔍 100% Public Audit Log</div>
            <div className="tech-tag">📉 Real-time Oracle Pricing</div>
         </div>
      </section>

      {/* ── Final Call to Action ─────────────────────────────── */}
      <section className="closing-cta">
         <div className="cta-box glass-card">
            <h2>Ready to join the 0% Middleman Economy?</h2>
            <p>Skip the intermediaries. Trade directly on the global ledger. Your harvest deserves 100% of the value it creates.</p>
            <button className="glow-button final-btn" onClick={() => window.location.href='/login'}>
               Enter the Marketplace
            </button>
         </div>
      </section>
    </div>
  );
}
