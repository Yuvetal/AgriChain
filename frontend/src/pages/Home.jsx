import React from "react";
import farmImage from "../assets/agrochainmart_hero_v2.png";
import "./Home.css";

export default function Home() {
  return (
    <div className="home-container">
      {/* ── Hero Section ────────────────────────────── */}
      <div className="hero-section-wrapper">
        <section className="base-grid hero-grid">
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
            <div className="hero-img-container">
               <div className="stat-tag stat-tag-top">
                  <span className="stat-val">100%</span>
                  <span className="stat-lbl">On-Chain Delivery</span>
                </div>
                <div className="stat-tag stat-tag-bottom">
                  <span className="stat-val">256-bit</span>
                  <span className="stat-lbl">Vault Encryption</span>
                </div>
                <img src={farmImage} alt="Modern Farming" className="hero-img" />
            </div>
          </div>
        </section>
      </div>

      {/* ── Marketplace Architecture ────────────────── */}
      <section className="pillars-wrapper">
        <div className="base-grid">
          <div className="section-title-box">
            <h2>The Three-Pillar Trust Protocol</h2>
            <p>Every harvest is secured by a triple-layer decentralized consensus.</p>
          </div>
          <div className="pill-grid">
             <div className="pill-card">
                <span className="pill-icon">🚜</span>
                <h3>The Farmer</h3>
                <p>Mints digital batches directly from the field. Secures inventory with 0.01 ETH <strong>Collateral Bonds</strong> to guarantee quality.</p>
             </div>
             <div className="pill-card">
                <span className="pill-icon">🛒</span>
                <h3>The Buyer</h3>
                <p>Purchases produce via <strong>Smart Escrow</strong>. Funds are mathematically locked until the physical QR-Handshake is verified.</p>
             </div>
             <div className="pill-card">
                <span className="pill-icon">⚖️</span>
                <h3>The Arbitrator</h3>
                <p>A decentralized court of 5 verified peers resolving disputes using <strong>IPFS unboxing evidence</strong>. Finality in blocks, not months.</p>
             </div>
          </div>
        </div>
      </section>

      {/* ── Feature Stack Section ───────────────────── */}
      <section className="features-wrapper">
         <div className="base-grid features-grid">
            <div className="features-text">
               <h2>Built on the <span className="text-gradient">Ethereum Hard-Security</span> Layer</h2>
               <p>Our smart contracts are non-upgradable, ensuring that once you mint a harvest, your proof of work is recorded forever.</p>
               <div className="hero-cta-group">
                 <button className="glow-button" style={{padding: '12px 30px'}} onClick={() => window.location.href='/view-blockchain'}>
                   Explore Ledger History
                 </button>
               </div>
            </div>
            <div className="tech-bubble-grid">
              <div className="tech-bubble">🛡️ Non-Custodial Vaults</div>
              <div className="tech-bubble">📹 IPFS Evidence Pinning</div>
              <div className="tech-bubble">🏧 Automated Gas ATM</div>
              <div className="tech-bubble">📱 Invisible Mobile Wallets</div>
              <div className="tech-bubble">🔍 100% Public Audit Log</div>
              <div className="tech-bubble">📉 Real-time Oracle Pricing</div>
            </div>
         </div>
      </section>

      {/* ── Final Call to Action ─────────────────────── */}
      <div className="final-call-wrapper">
        <section className="base-grid">
           <div className="perfect-cta-box">
              <h2>Ready to join the 0% Middleman Economy?</h2>
              <p>Skip the intermediaries. Trade directly on the global ledger. Your harvest deserves 100% of the value it creates.</p>
              <button className="cta-btn-white" onClick={() => window.location.href='/login'}>
                 Enter the Marketplace
              </button>
           </div>
        </section>
      </div>
    </div>
  );
}
