import "./Home.css";
import farmImage from "../assets/homepage.jpg";

// Import icons
import addIcon from "../assets/add.png";
import secureIcon from "../assets/secure.png";
import viewIcon from "../assets/view.png";
import qrIcon from "../assets/qr.png";

export default function Home() {
  return (
    <div className="home-container">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-badge">🌾 Decentralized Agriculture v4.5</div>
        <h1 className="hero-title">
          Transparent. Traceable. <span className="text-gradient">Trustworthy.</span>
        </h1>
        <p className="hero-subtitle">
          Empowering farmers with <strong>Immutable Blockchain Lineage</strong> — 
          from the first harvest to the final consumer.
        </p>
        
        <div className="hero-visual">
          <img src={farmImage} alt="Agriculture Blockchain" className="hero-main-img" />
          <div className="hero-quote">
            "Every crop tells a story — we make it impossible to fake."
          </div>
        </div>
      </section>

      {/* Main Grid */}
      <div className="home-grid">
        {/* Problem Section */}
        <section className="info-card problem-card">
          <div className="card-icon">🥀</div>
          <h3>The Fragile Supply Chain</h3>
          <p>
            Farmers battle unfair pricing and zero transparency. Consumers 
            buy products with no proof of origin. The trust gap is costing 
            everyone.
          </p>
        </section>

        {/* Benefits Section */}
        <section className="info-card benefits-card">
          <div className="card-icon">✨</div>
          <h3>Why AgroChainMart?</h3>
          <ul className="benefit-list">
            <li><span>✅</span> Automated 2% Protocol Revenue</li>
            <li><span>✅</span> 100% On-Chain Batch Tracking</li>
            <li><span>✅</span> Cryptographic Non-Custodial Vaults</li>
            <li><span>✅</span> Tamper-Proof QR Verification</li>
          </ul>
        </section>
      </div>

      {/* How It Works - Step Grid */}
      <section className="steps-section">
        <h2 className="section-title">The Onboarding Protocol</h2>
        <div className="steps-grid">
          <div className="step-card">
            <div className="step-num">01</div>
            <img src={addIcon} alt="Add Produce" className="step-card-icon" />
            <h4>Mint Batch</h4>
            <p>Farmers record Harvest IDs and pricing directly into the Sepolia Ledger.</p>
          </div>
          <div className="step-card">
            <div className="step-num">02</div>
            <img src={secureIcon} alt="Secure Storage" className="step-card-icon" />
            <h4>Vault Lock</h4>
            <p>Each record is hashed and secured via your Invisible Private Key.</p>
          </div>
          <div className="step-card">
            <div className="step-num">03</div>
            <img src={viewIcon} alt="View Records" className="step-card-icon" />
            <h4>Verify Trace</h4>
            <p>Buyers audit the entire lineage history before committing funds to Escrow.</p>
          </div>
          <div className="step-card">
            <div className="step-num">04</div>
            <img src={qrIcon} alt="QR Verification" className="step-card-icon" />
            <h4>Seal Delivery</h4>
            <p>Scanning the batch QR confirms the physical-to-digital authenticity handshake.</p>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="cta-container">
        <div className="cta-card">
          <h3>Ready to Secure Your Yield?</h3>
          <p>Join the decentralized network and take control of your financial lineage.</p>
          <button className="glow-button cta-btn" onClick={() => window.location.href='/login'}>
            Launch App Terminal
          </button>
        </div>
      </section>
    </div>
  );
}
