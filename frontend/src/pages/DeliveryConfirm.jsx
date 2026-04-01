import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { getEthereumObject, getContract } from "../utils/ethereum";
import { parseWeb3Error } from "../utils/errorHelper";
import TutorialModal from "../components/TutorialModal";
import "./DeliveryConfirm.css";

export default function DeliveryConfirm() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  
  const [account, setAccount] = useState("");
  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userMsg, setUserMsg] = useState("");
  
  // OTP Flow
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Dispute Flow
  const [showDispute, setShowDispute] = useState(false);

  // UX Tutorial Flow
  const [tutorialConfig, setTutorialConfig] = useState(null);

  useEffect(() => {
    connectWallet();
  }, []);

  const connectWallet = async () => {
    try {
      const eth = getEthereumObject();
      if (!eth) throw new Error("MetaMask not found.");
      
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      const currentAcc = accounts[0].toLowerCase();
      setAccount(currentAcc);
      
      fetchBatchDetails(currentAcc);
    } catch (err) {
      setUserMsg(parseWeb3Error(err));
      setLoading(false);
    }
  };

  const fetchBatchDetails = async (walletAddr) => {
    try {
      const { contract } = await getContract();
      const b = await contract.batches(batchId);
      
      if (!b || b.name === "") {
        throw new Error("Batch not found on ledger.");
      }

      setBatch({
        id: b.id.toString(),
        name: b.name,
        quantity: b.quantity.toString(),
        pricePerKg: b.pricePerKg,
        farmer: b.farmer.toLowerCase(),
        buyer: b.buyer.toLowerCase(),
        status: b.status.toString(),
        trackingId: b.trackingId
      });

    } catch (err) {
      setUserMsg(parseWeb3Error(err));
    } finally {
      setLoading(false);
    }
  };

  const ipfsCidToBytes32 = (cid) => {
    if (!cid) return ethers.ZeroHash;
    try { return ethers.keccak256(ethers.toUtf8Bytes(cid)); } catch { return ethers.ZeroHash; }
  };

  const requestCriticalAction = (storageKey, title, explanation, icon, finalAction) => {
    const hasSeen = localStorage.getItem(storageKey);
    if (hasSeen === "true") {
      finalAction();
    } else {
      setTutorialConfig({
        title,
        explanation,
        icon,
        storageKey,
        onProceed: () => {
          setTutorialConfig(null);
          finalAction();
        },
        onCancel: () => setTutorialConfig(null)
      });
    }
  };

  // ── Delivery Handshake Flow ──
  const requestOtp = () => {
    // In production, hits backend Twilio API
    setTimeout(() => {
      setOtpSent(true);
      setUserMsg(`✅ OTP sent to registered verified buyer phone number.`);
    }, 1000);
  };

  const executeConfirmDelivery = async () => {
    if (otp !== "1234") {
      setUserMsg("❌ Invalid OTP. Please try again. (Hint: Use '1234' for demo)");
      return;
    }
    
    try {
      setVerifying(true);
      setUserMsg(`⏳ OTP Verified. Releasing APMC Escrow...`);
      const { contract } = await getContract();
      
      // ZeroHash because goods are cleanly delivered without video evidence of a dispute needed
      const tx = await contract.confirmDelivery(batchId, ethers.ZeroHash);
      await tx.wait();
      
      setUserMsg("✅ Escrow transferred! Success. Redirecting...");
      setTimeout(() => navigate('/dashboard'), 3000);
    } catch (err) {
      setUserMsg(parseWeb3Error(err));
      setVerifying(false);
    }
  };

  const confirmDelivery = () => {
    requestCriticalAction(
      "tut_delivery",
      "Irreversible Sign-off",
      "Confirming delivery unconditionally releases all Escrow Funds natively to the Farmer's wallet. You waive all rights to physical dispute arbitration once this smart contract executes.",
      "✅",
      () => executeConfirmDelivery()
    );
  };

  const executeFileDispute = async () => {
    try {
      setVerifying(true);
      const { contract } = await getContract();
      const totalVal = (window.BigInt(batch.pricePerKg) * window.BigInt(batch.quantity)).toString();
      const bondWei = await contract.calculateDisputeBond(totalVal);
      const bondEth = parseFloat(ethers.formatEther(bondWei)).toFixed(5);
      
      const ok = window.confirm(
        `Filing a dispute requires a bond of ${bondEth} ETH.\n\n` +
        `This protects the network from false spam claims. If arbitrators agree the goods are damaged, ` +
        `your bond and purchase amount are fully refunded.\n\n` +
        `Proceed to upload video evidence?`
      );
      if (!ok) { setVerifying(false); return; }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/mp4,video/webm,video/ogg,video/quicktime';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) { setVerifying(false); return; }
        if (file.size > 20 * 1024 * 1024) {
          setUserMsg("⚠️ Video exceeds 20MB. Please use a compressed clip.");
          setVerifying(false);
          return;
        }

        try {
          setUserMsg(`🚨 Uploading damage evidence to IPFS (via Backend)...`);
          const formData = new FormData();
          formData.append('file', file);
          
      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
      const res = await fetch(`${API_URL}/api/ipfs/upload`, {
            method: 'POST',
            body: formData
          });
          
          const data = await res.json();
          if (!res.ok || !data.ipfs_hash) throw new Error(data.error || "IPFS Pin Failed");

          const cid = data.ipfs_hash.trim();
          setUserMsg(`🔗 Pinned: ${cid}. Executing Secure Smart Contract...`);

          const hashBytes32 = ipfsCidToBytes32(cid);
          const tx = await contract.reportSpoilt(batchId, hashBytes32, { value: bondWei });
          await tx.wait();
          
          const cidMap = JSON.parse(localStorage.getItem("ipfs_cid_map") || "{}");
          cidMap[hashBytes32] = cid;
          localStorage.setItem("ipfs_cid_map", JSON.stringify(cidMap));

          setUserMsg("✅ Dispute filed with APMC Arbitrators. Evidence secured. Redirecting...");
          setTimeout(() => navigate('/dashboard'), 4000);
        } catch (err) {
          setUserMsg(parseWeb3Error(err));
          setVerifying(false);
        }
      };
      // User cancelled file picker? We can't easily detect cancel easily in onchange, but we wait.
      input.click();

    } catch (err) {
      setUserMsg(parseWeb3Error(err));
      setVerifying(false);
    }
  };

  const fileDispute = () => {
    requestCriticalAction(
      "tut_dispute",
      "Economic Stakes Warning",
      "Filing a falsified dispute slashes your 5% Escrow Bond. Arbitrators will rigorously compare your uploaded damage video against the farmer's locked pre-packing video. Proceed with 100% honesty.",
      "⚖️",
      () => executeFileDispute()
    );
  };

  if (loading) {
    return <div className="delivery-loading">Scanning APMC Ledger...</div>;
  }

  if (!batch || batch.status !== "2") { // 2 = Dispatched
    return (
      <div className="delivery-container">
        <div className="delivery-card error-card">
          <h2>⚠️ Invalid Protocol State</h2>
          <p>This Batch is not currently Dispatched or you scanned an inactive QR code.</p>
          <button onClick={() => navigate('/dashboard')} className="back-btn">Return to Dashboard</button>
        </div>
      </div>
    );
  }

  const isAuthBuyer = account === batch.buyer;

  return (
    <div className="delivery-container">
      {tutorialConfig && <TutorialModal {...tutorialConfig} />}
      <div className="delivery-card">
        <div className="delivery-header">
          <span className="truck-icon">🚚</span>
          <h1>Secure Delivery Handshake</h1>
          <p className="batch-subtitle">Logistics Node ID: #{batchId} • Tracking: {batch.trackingId}</p>
        </div>

        <div className="batch-details">
          <div className="detail-item">
            <span>Product</span>
            <strong>{batch.name}</strong>
          </div>
          <div className="detail-item">
            <span>Quantity</span>
            <strong>{batch.quantity} kg</strong>
          </div>
        </div>

        {userMsg && (
          <div className={`delivery-msg ${userMsg.includes('✅') ? 'success' : 'error'}`}>
            {userMsg}
          </div>
        )}

        {!isAuthBuyer && (
          <div className="unauthorized-overlay">
            <p><strong>⚠️ Authorization Needed</strong></p>
            <span style={{ fontSize: '0.9rem', color: '#64748b' }}>
              You are currently connected as: <br/><code>{account || "No Wallet"}</code><br/>
              Please switch to the Registered Buyer's Wallet inside MetaMask, or hand this device to the verified buyer.
            </span>
          </div>
        )}

        {isAuthBuyer && !showDispute && (
          <div className="handshake-actions">
            {!otpSent ? (
              <button 
                className="action-btn success-btn" 
                onClick={requestOtp}
                disabled={verifying}
              >
                ✅ Yes, I accept delivery (Send OTP)
              </button>
            ) : (
              <div className="otp-container">
                <input 
                  type="text" 
                  placeholder="Enter SMS OTP..." 
                  value={otp} 
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                  disabled={verifying}
                  autoFocus
                />
                <button 
                  className="action-btn success-btn" 
                  onClick={confirmDelivery}
                  disabled={verifying || otp.length < 4}
                >
                  {verifying ? "Releasing Escrow..." : "Confirm Final Sign-Off"}
                </button>
              </div>
            )}

            <div className="divider"><span>OR</span></div>

            <button 
              className="action-btn dispute-btn" 
              onClick={() => setShowDispute(true)}
              disabled={verifying}
            >
              🚨 Do not accept (Goods Missing / Spoilage)
            </button>
          </div>
        )}

        {isAuthBuyer && showDispute && (
          <div className="dispute-modal-inline">
            <h3>Protocol Dispute Process</h3>
            <p>You must record a 15-second unedited video of the goods being unloaded from the truck to prove spoilage or mismatch against the Pre-Packing Video.</p>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="action-btn dispute-btn" onClick={fileDispute} disabled={verifying}>
                {verifying ? "Uploading..." : "Upload Video Evidence"}
              </button>
              <button className="action-btn cancel-btn" onClick={() => setShowDispute(false)} disabled={verifying}>
                Cancel
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
