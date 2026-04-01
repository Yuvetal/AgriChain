import "./Footer.css";

export default function Footer() {
  return (
    <footer className="footer-container">
      <div className="footer-content">
        <div className="footer-left">
          <span className="footer-logo">AgriChain Protocol</span>
          <span className="footer-copyright">© 2024 Decentralized Supply Chain Ledger</span>
        </div>
        <div className="footer-right">
          <div className="network-status">
            <span className="status-indicator"></span>
            <span className="status-text">Sepolia Testnet Live</span>
          </div>
          <div className="footer-links">
             <a href="/view-blockchain">Explorer</a>
             <a href="https://sepolia.etherscan.io" target="_blank" rel="noreferrer">Etherscan</a>
             <a href="/">Documentation</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
