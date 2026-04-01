import React from 'react';
import './TutorialModal.css'; // Inheriting styling from TutorialModal for consistency

export default function HelpGlossaryModal({ onClose }) {
  return (
    <div className="tutorial-overlay" onClick={onClose}>
      <div 
        className="tutorial-card" 
        onClick={(e) => e.stopPropagation()} 
        style={{ width: "95%", maxWidth: "600px", maxHeight: "85vh", overflowY: "auto" }}
      >
        <div className="tutorial-header">
          <span className="tutorial-icon">📚</span>
          <h2 className="tutorial-title">Network Mechanics Glossary</h2>
        </div>
        
        <div className="tutorial-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p>
            Welcome to the <strong>Decentralized APMC Protocol</strong>. Unlike standard marketplaces, this application relies on strict cryptographic rules and decentralized game-theory to enforce fair trade without a central admin.
          </p>
          
          <div style={{ background: "#f8fafc", padding: "12px", borderLeft: "4px solid #4f46e5", borderRadius: "0 8px 8px 0" }}>
            <strong style={{ color: "#312e81" }}>1. Stakes & Bonds (Anti-Spam)</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
              Farmers lock a <strong>5% Security Stake</strong> to list items. Buyers lock a <strong>5% Dispute Bond</strong> if they claim goods are damaged. If arbitrators deem a party "false", that party loses their bond entirely. This economically halts spam.
            </p>
          </div>

          <div style={{ background: "#f8fafc", padding: "12px", borderLeft: "4px solid #10b981", borderRadius: "0 8px 8px 0" }}>
            <strong style={{ color: "#065f46" }}>2. Two-Video Evidence Chain</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
              To ensure "what is packed is what is delivered", the Farmer permanently locks a <strong>Pre-Packing Video</strong> on IPFS before dispatch. If a dispute occurs, the Buyer locks a <strong>Receiving Video</strong>. APMC blind arbitrators watch both strictly side-by-side to determine fault.
            </p>
          </div>

          <div style={{ background: "#f8fafc", padding: "12px", borderLeft: "4px solid #f59e0b", borderRadius: "0 8px 8px 0" }}>
            <strong style={{ color: "#92400e" }}>3. Delivery QR Handshake</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
              Escrow is released using cryptographically sound physical presence. The Driver generates a dynamic QR Code on arrival. The specific Buyer scans it with their phone, receives a Twilio SMS OTP, and signs off. This mathematically confirms the exact place and time of delivery.
            </p>
          </div>

          <div style={{ background: "#f8fafc", padding: "12px", borderLeft: "4px solid #ec4899", borderRadius: "0 8px 8px 0" }}>
            <strong style={{ color: "#831843" }}>4. Blind Arbitration</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
              When a dispute is triggered, 5 random APMC officials are assigned. They are utterly blind to your name, transaction value, and stake to prevent bias. The first party to receive 3 votes immediately wins, returning their escrow and slashing the loser.
            </p>
          </div>
        </div>

        <div className="tutorial-footer" style={{ borderTop: "none", paddingTop: "0" }}>
          <button className="tutorial-btn confirm-btn" style={{ width: "100%" }} onClick={onClose}>
            Close Glossary
          </button>
        </div>
      </div>
    </div>
  );
}
