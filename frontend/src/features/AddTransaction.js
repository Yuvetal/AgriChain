import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { getContract } from "../utils/ethereum";
import { parseWeb3Error } from "../utils/errorHelper";
import "./AddTransaction.css";

const AddTransaction = () => {
  const [parentBlocks, setParentBlocks] = useState([]);
  const [selectedParentHash, setSelectedParentHash] = useState("");

  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [productName, setProductName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [harvestDate, setHarvestDate] = useState("");
  const [expiryDate, setExpiryDate] = useState(""); // Product expiry date
  const [location, setLocation] = useState("");

  const [description, setDescription] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [userOtp, setUserOtp] = useState("");

  const [message, setMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const [maxQuantity, setMaxQuantity] = useState(null);
  const [minDate, setMinDate] = useState(null);
  const [conversionRate, setConversionRate] = useState(300000);

  // Merchant Status State
  const [farmerBalance, setFarmerBalance] = useState("0");
  const [farmerEarnings, setFarmerEarnings] = useState("0");
  const [isSponsored, setIsSponsored] = useState(false);

  const fetchMerchantStatus = async () => {
    try {
      const { contract, signer, provider } = await getContract();
      const addr = await signer.getAddress();
      
      // 1. Fetch Wallet Balance
      const bal = await provider.getBalance(addr);
      setFarmerBalance(ethers.formatEther(bal));

      // 2. Fetch Protocol Stats
      const earnings = await contract.totalEarnings(addr);
      setFarmerEarnings(ethers.formatEther(earnings));

      // 3. Check Sponsorship Status
      const sponsored = await contract.isAdminSponsored(addr);
      setIsSponsored(sponsored);
    } catch (err) {
      console.error("Merchant Status Sync Failed:", err);
    }
  };

  useEffect(() => {
    fetchMerchantStatus();
    // Refresh every 30s for real-time feel
    const interval = setInterval(fetchMerchantStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchOracle = async () => {
      try {
        const { contract } = await getContract();
        const ethUsdPrice = await contract.getLatestEthUsdPrice();
        const parsedUsdPrice = Number(ethUsdPrice) / 10**8;
        const liveRate = parsedUsdPrice * 85;
        setConversionRate(liveRate);
      } catch (err) {
        console.error("Oracle Fetch Failed:", err);
      }
    };
    fetchOracle();
  }, []);

  useEffect(() => {
    if (quantity || productName || harvestDate) {
      const formattedDate = harvestDate ? new Date(harvestDate).toLocaleDateString("en-GB") : "[Date]";
      const qty = quantity ? quantity : "[Qty]";
      const prod = productName ? productName : "[Product]";
      setDescription(`Listing ${qty} kg of ${prod} on ${formattedDate}`);
    } else {
      setDescription("");
    }
  }, [quantity, productName, harvestDate]);

  const loadParentBatches = async () => {
    try {
      const { contract } = await getContract();
      const count = await contract.batchCount();
      const numBatches = parseInt(count.toString());
      const loadedBatches = [];
      for (let i = 1; i <= numBatches; i++) {
        const batch = await contract.batches(i);
        loadedBatches.push({
          id: batch.id.toString(),
          name: batch.name,
          remainingQty: batch.remainingQuantity.toString(),
          desc: `Batch #${batch.id.toString()} - ${batch.name} (${batch.remainingQuantity.toString()}kg)`
        });
      }
      setParentBlocks(loadedBatches);
    } catch (err) {
      console.error("Failed to load parent batches:", err);
    }
  };

  useEffect(() => {
    loadParentBatches();
  }, []);

  useEffect(() => {
    const fetchParentData = async () => {
      if (!selectedParentHash) {
        setMaxQuantity(null);
        setMinDate(null);
        return;
      }
      const parent = parentBlocks.find((b) => b.id === selectedParentHash);
      if (parent) {
        setProductName(parent.name);
        setMaxQuantity(parseInt(parent.remainingQty));
        try {
          const { contract, provider } = await getContract();
          const filter = contract.filters.BatchCreated(parseInt(selectedParentHash));
          const events = await contract.queryFilter(filter);
          if (events.length > 0) {
            const block = await provider.getBlock(events[0].blockNumber);
            const parentDate = new Date(block.timestamp * 1000);
            parentDate.setHours(0, 0, 0, 0);
            setMinDate(parentDate);
          }
        } catch (e) {
          console.error("Failed to fetch parent timestamp:", e);
        }
      }
    };
    fetchParentData();
  }, [selectedParentHash, parentBlocks]);

  const isValidPhoneNumber = (number) => /^[6-9]\d{9}$/.test(number);

  const handleSendOtp = (e) => {
    e.preventDefault();
    if (!quantity || !cost || !productName || !phoneNumber || !harvestDate || !expiryDate || !location) {
      setMessage("⚠️ Please fill all required fields, including product expiry date.");
      return;
    }
    // Validate expiry window
    const now = Date.now();
    const expiryMs = new Date(expiryDate).getTime();
    const minExpiry = now + 24 * 60 * 60 * 1000;       // +24 hours
    const maxExpiry = now + 30 * 24 * 60 * 60 * 1000;  // +30 days
    if (expiryMs < minExpiry) {
      setMessage("⚠️ Expiry must be at least 24 hours from now.");
      return;
    }
    if (expiryMs > maxExpiry) {
      setMessage("⚠️ Expiry cannot exceed 30 days from now.");
      return;
    }
    const parsedQuantity = parseInt(quantity.replace(/\D/g, ""));
    if (maxQuantity !== null && parsedQuantity > maxQuantity) {
      setMessage(`⚠️ Quantity cannot exceed ${maxQuantity} kg.`);
      return;
    }
    if (minDate !== null) {
      const selectedDate = new Date(harvestDate);
      selectedDate.setHours(0, 0, 0, 0);
      if (selectedDate.getTime() < minDate.getTime()) {
        setMessage(`⚠️ Date cannot be before ${minDate.toLocaleDateString("en-GB")}.`);
        return;
      }
    }
    if (!isValidPhoneNumber(phoneNumber)) {
      setMessage("⚠️ Invalid phone number. Must be 10 digits.");
      return;
    }
    
    setIsProcessing(true);
    setMessage("⏳ Requesting Secure OTP via Twilio...");

    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
    fetch(`${API_URL}/api/otp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phoneNumber }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "sent") {
          setOtpSent(true);
          setUserOtp("");
          setMessage("✅ Secure Verification code dispatched! Please check your physical device.");
        } else if (data.status === "simulated") {
          setOtpSent(true);
          setUserOtp("");
          // Providing the code directly in the UI for sandbox/unverified testers
          setMessage(`🧪 [SANDBOX MODE] SMS Code: ${data.code} (Unverified Number)`);
        } else {
          setMessage(`❌ Identity Engine error: ${data.error}`);
        }
      })
      .catch((err) => setMessage("❌ Identity Gateway Offline. Start the Flask server!"))
      .finally(() => setIsProcessing(false));
  };

  const submitTransactionToBlockchain = async (e) => {
    e.preventDefault();
    if (!userOtp || userOtp.length < 6) {
      setMessage("⚠️ Please enter the 6-digit code.");
      return;
    }
    
    setIsProcessing(true);
    setMessage("⏳ Verifying Security Code...");

    try {
      // Phase 1: Cryptographic Verification via Backend
      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
      const verifyRes = await fetch(`${API_URL}/api/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumber, code: userOtp }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.valid) {
        setMessage("❌ Incorrect OTP. Access Denied.");
        setIsProcessing(false);
        return;
      }

      // Phase 2: On-Chain Transaction Execution
      setMessage("⏳ OTP Verified! Approving Ledger Entry in MetaMask...");

      const { contract, signer } = await getContract();
      const parsedQuantity = parseInt(quantity.replace(/\D/g, ""));
      const costNum = parseFloat(cost.toString());
      const ethValue = costNum / conversionRate; // Now represents Price Per Kg!
      const pricePerKgInWei = ethers.parseEther(ethValue.toFixed(18));
      const expiryTimestamp = Math.floor(new Date(expiryDate).getTime() / 1000);

      // Dynamic stake: max(0.01 ETH, 5% of total batch value)
      const totalEthValue = ethValue * parsedQuantity;
      const stakeEth = Math.max(0.01, totalEthValue * 0.05);
      const stakeWei = ethers.parseEther(stakeEth.toFixed(18));

      // PROACTIVE BALANCE CHECK: 
      const userBalance = await signer.getProvider().getBalance(await signer.getAddress());
      const gasBuffer = ethers.parseEther("0.005"); // Minimum gas reserve
      const totalNeeded = isSponsored ? gasBuffer : stakeWei + gasBuffer;
      
      if (userBalance < totalNeeded) {
        setMessage(`❌ Not enough funds in your Vault. You need at least ${ethers.formatEther(totalNeeded).slice(0,6)} ETH (Stake + Gas).`);
        setIsProcessing(false);
        return;
      }

      let tx;
      if (!selectedParentHash) {
        const addr = await signer.getAddress();
        const isSponsored = await contract.isAdminSponsored(addr);
        tx = await contract.createBatch(
          productName, parsedQuantity, pricePerKgInWei, 0, location, expiryTimestamp,
          { value: isSponsored ? 0 : stakeWei }
        );
      } else {
        tx = await contract.createBatch(
          productName, parsedQuantity, pricePerKgInWei, parseInt(selectedParentHash), location, expiryTimestamp,
          { value: 0 }
        );
      }

      setMessage("🚀 Mining transaction...");
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        setMessage("✅ Success! Recorded on blockchain.");
        setQuantity(""); setCost(""); setProductName("");
        setPhoneNumber(""); setHarvestDate(""); setExpiryDate("");
        setUserOtp(""); setOtpSent(false);
        setSelectedParentHash(""); loadParentBatches();
      } else {
        setMessage("❌ Transaction failed.");
      }
    } catch (err) {
      setMessage(parseWeb3Error(err));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="add-transaction-page">
      <div className="transaction-card">
        <h2 className="card-title">📖 Protocol Entry</h2>
        <p className="card-subtitle">Permanent immutable recording of agricultural yield</p>

        <form className="transaction-form" onSubmit={submitTransactionToBlockchain}>
          
          {/* MERCHANT STATUS DASHBOARD */}
          <div className="merchant-status-row">
            <div className="balance-pill">
              <span className="balance-label">Wallet Balance</span>
              <span className="balance-value">{parseFloat(farmerBalance).toFixed(4)} ETH</span>
            </div>
            
            <div className="independence-progress">
              <span className="progress-label">Financial Maturity (Next Stake)</span>
              <div className="progress-bar-bg">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${Math.min((parseFloat(farmerEarnings) / 0.01) * 100, 100)}%` }}
                ></div>
              </div>
              <span className="progress-label" style={{ marginTop: '4px', textAlign: 'right' }}>
                {parseFloat(farmerEarnings).toFixed(4)} / 0.01 ETH
              </span>
            </div>
          </div>

          <div className="parent-select-wrap">
            <label className="parent-label">🔗 Chain Linkage (Optional)</label>
            <select
              value={selectedParentHash}
              onChange={(e) => setSelectedParentHash(e.target.value)}
              className="parent-select"
            >
              <option value="">Seed Harvest (Absolute Root)</option>
              {parentBlocks.map((block) => (
                <option key={block.id} value={block.id}>{block.desc}</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Harvest Date</label>
              <input type="date" value={harvestDate} onChange={(e) => setHarvestDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Quantity (kg)</label>
              <input type="text" placeholder="e.g. 50" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </div>

          <div className="form-group full-width">
            <label>⏰ Product Expiry Date & Time <span className="field-hint">(Min 24h, Max 30 days from now)</span></label>
            <input
              type="datetime-local"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
              max={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Price per Kg (₹ INR)</label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 80"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Category / Product</label>
              <input
                type="text"
                placeholder="e.g. Basmati Rice"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                disabled={!!selectedParentHash}
                className={!!selectedParentHash ? "disabled-input" : ""}
              />
            </div>
          </div>

          <div className="form-group full-width">
            <label>Current Product Location (City, State)</label>
            <input 
              type="text" 
              placeholder="📍 e.g. Punjab, India" 
              value={location} 
              onChange={(e) => setLocation(e.target.value)} 
              required
            />
          </div>

          <div className="form-group">
            <label>Confirmation Network Identifier (SMS)</label>
            <input type="text" placeholder="📱 Phone Number" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
          </div>

          {!otpSent ? (
            <button type="button" className="glow-button verify-btn" onClick={handleSendOtp}>Verify Identity</button>
          ) : (
            <div className="otp-entry-dock">
              <div className="form-group">
                <label>Verification Code (OTP)</label>
                <input type="text" placeholder="6-Digit Code" value={userOtp} onChange={(e) => setUserOtp(e.target.value)} className="otp-input" />
              </div>
              {!selectedParentHash && (
                <div className={`stake-warning-box ${isSponsored ? 'info' : ''}`}>
                  {isSponsored ? (
                    <span><strong>✅ Protocol Subsidy Active:</strong> Stake is fully sponsored by the Admin Treasury.</span>
                  ) : (
                  <span><strong>⚠️ Stake Required:</strong> 5% of Total Batch Value (min 0.01 ETH) — fully returned upon successful delivery.</span>
                  )}
                </div>
              )}
              <div className="form-actions row">
                <button className="glow-button submit-btn" type="submit" disabled={isProcessing}>
                  {isProcessing ? "Mining..." : "Commit Record"}
                </button>
                <button type="button" onClick={handleSendOtp} disabled={isProcessing} className="resend-btn">Resend</button>
              </div>
            </div>
          )}
        </form>

        {message && (
          <div className={`status-message ${message.includes('✅') ? 'success' : message.includes('[MOCK]') ? 'info' : 'error'}`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

export default AddTransaction;
