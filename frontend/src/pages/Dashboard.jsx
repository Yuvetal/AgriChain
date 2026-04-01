import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { getContract, getEthereumObject } from "../utils/ethereum";
import { parseWeb3Error } from "../utils/errorHelper";
import TutorialModal from "../components/TutorialModal";
import HelpGlossaryModal from "../components/HelpGlossaryModal";
import "./Dashboard.css";

const statusMap = {
  0: "Created",
  1: "Sold",
  2: "Dispatched",
  3: "Confirmed",
  4: "PartialConfirm",
  5: "Disputed",
  6: "FarmerWins",
  7: "BuyerWins",
  8: "Abandoned",
  9: "Refunded",
  10: "Cancelled"
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [account, setAccount] = useState("");
  const [batches, setBatches] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [minQuantity, setMinQuantity] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [hideSoldOut, setHideSoldOut] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [userMsg, setUserMsg] = useState("");
  const isFarmerAuth = localStorage.getItem("farmer_session_active") === "true";
  const [farmerBal, setFarmerBal] = useState("0");
  const [purchaseAmounts, setPurchaseAmounts] = useState({});
  const [trackingInputs, setTrackingInputs] = useState({});   // Dispatch tracking IDs per batch
  const [partialQtys, setPartialQtys] = useState({});         // Partial delivery quantities per batch
  const [conversionRate, setConversionRate] = useState(300000);

  // UX Overhaul States
  const [tutorialConfig, setTutorialConfig] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [trusteeInputs, setTrusteeInputs] = useState({}); // { [batchId]: { phone: "", file: null } }

  // Banking Bridge State
  const [bankAccount, setBankAccount] = useState({ balance_inr: 0, history: [] });
  const [withdrawalINR, setWithdrawalINR] = useState("");
  const [isFinancing, setIsFinancing] = useState(false);
  const [isBankOnline, setIsBankOnline] = useState(false);

  const checkBankStatus = async () => {
    try {
      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
      const res = await fetch(`${API_URL}/api/ping`);
      if (res.ok) setIsBankOnline(true);
      else setIsBankOnline(false);
    } catch (e) {
      setIsBankOnline(false);
    }
  };

  const loadBlockchainData = async () => {
    setIsLoading(true);
    checkBankStatus(); // Immediate health check
    
    // Safety check for RPC configuration
    const rpcUrl = process.env.REACT_APP_ALCHEMY_RPC_URL;
    if (!rpcUrl) {
      console.error("CRITICAL: REACT_APP_ALCHEMY_RPC_URL is missing from your frontend .env file!");
      setUserMsg("❌ Connection Error: Backend RPC keys not configured.");
      setIsLoading(false);
      return;
    }

    try {
      const { contract } = await getContract();
      
      // Oracle Ping: Request the mathematically verified USD price of ETH directly from the Smart Contract (Chainlink)!
      const ethUsdPrice = await contract.getLatestEthUsdPrice();
      const trueUsd = Number(ethUsdPrice) / 10**8; // Unpack Chainlink Oracle's 8 decimal precision
      const liveRate = trueUsd * 85; // Fixed macroeconomic bridging from Verified USD to Target INR
      setConversionRate(liveRate);
      
      const addr = isFarmerAuth ? localStorage.getItem("farmer_address") : "";
      if (isFarmerAuth) {
         setAccount(addr.toLowerCase());
         fetchBankRecord();
      } else {
         const eth = getEthereumObject();
         if (!eth) throw new Error("MetaMask missing");
         const accs = await eth.request({ method: "eth_accounts" });
         if (accs.length > 0) setAccount(accs[0].toLowerCase());
      }

      const countBigInt = await contract.batchCount();
      const numBatches = parseInt(countBigInt.toString());
      
      let results = [];
      for (let i = 1; i <= numBatches; i++) {
        const b = await contract.batches(i);
        const ethersVal = ethers.formatEther(b.pricePerKg.toString());
        const inrFiatCalc = Math.round(parseFloat(ethersVal) * liveRate).toLocaleString('en-IN');

        results.push({
          id: b.id.toString(),
          parentId: b.parentId.toString(),
          name: b.name,
          quantity: parseInt(b.quantity),
          remainingQuantity: parseInt(b.remainingQuantity),
          rawPricePerKg: b.pricePerKg.toString(),
          displayPricePerKg: ethersVal,
          displayINRPerKg: inrFiatCalc,
          escrowAmount: ethers.formatEther(b.escrowAmount.toString()),
          stakeAmount: ethers.formatEther(b.stakeAmount.toString()),
          farmer: b.farmer.toLowerCase(),
          buyer: b.buyer.toLowerCase(),
          status: statusMap[parseInt(b.status.toString())] || "Unknown",
          location: b.location,
          video1Hash: b.video1Hash,
          trackingId: b.trackingId,
          expiryTimestamp: parseInt(b.expiryTimestamp.toString()),
          isAdminSponsored: b.isAdminSponsored,
          trusteePhone: b.trusteePhone || "",
          trusteeConsentHash: b.trusteeConsentHash || null
        });
      }
      // Newest first
      setBatches(results.reverse());
    } catch (err) {
      console.error(err);
      setUserMsg(`❌ Failed to fetch marketplace data: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBankRecord = async () => {
    const phone = localStorage.getItem("farmer_session_phone");
    if (!phone) return;
    try {
      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
      const res = await fetch(`${API_URL}/api/bank/balance/${phone}`);
      if (res.ok) {
        const data = await res.json();
        setBankAccount(data);
        setIsBankOnline(true);
      } else {
        setIsBankOnline(false);
      }
    } catch (e) {
      setIsBankOnline(false);
    }
  };

  useEffect(() => {
    loadBlockchainData();
    const statusInterval = setInterval(checkBankStatus, 5000); // Polling for demo stability
    
    if (isFarmerAuth) {
      const addr = localStorage.getItem("farmer_address");
      const fetchBal = async () => {
         try {
           const rpcUrl = process.env.REACT_APP_ALCHEMY_RPC_URL || "https://rpc.sepolia.org"; // Fallback to public if env is missing
           const provider = new ethers.JsonRpcProvider(rpcUrl);
           const bal = await provider.getBalance(addr);
           setFarmerBal(ethers.formatEther(bal));
         } catch(e) {}
      };
      fetchBal();
    }
    return () => clearInterval(statusInterval);
  }, []);

  const handleWithdrawToBank = async () => {
    if (!withdrawalINR || parseFloat(withdrawalINR) <= 0) {
      setUserMsg("⚠️ Please enter a valid INR amount to withdraw.");
      return;
    }

    const inrValue = parseFloat(withdrawalINR);
    const ethRequired = inrValue / conversionRate;
    
    // RE-FETCH Current Balance to ensure "Insufficient Funds" is accurate
    const rpcUrl = process.env.REACT_APP_ALCHEMY_RPC_URL || "https://rpc.sepolia.org"; 
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const currentBal = await provider.getBalance(account);
    const balNum = parseFloat(ethers.formatEther(currentBal));

    if (balNum < ethRequired) {
      setUserMsg(`❌ Insufficient Funds! You need ${ethRequired.toFixed(5)} ETH in your Invisible Vault. You currently have ${balNum.toFixed(5)} ETH.`);
      return;
    }

    setIsFinancing(true);
    setUserMsg(`⏳ Syncing with High-Trust Payout Node... Converting ₹${inrValue} from Blockchain Vault...`);

    try {
      let signer;
      const ethObj = getEthereumObject();
      const browserProvider = new ethers.BrowserProvider(ethObj);

      // CRITICAL FIX: Route to correct signer!
      if (isFarmerAuth) {
          const { getActiveFarmerSigner } = await import("../utils/LocalWallet");
          signer = await getActiveFarmerSigner(browserProvider);
          if (!signer) {
              setUserMsg("🔐 Cryptographic RAM wiped. Please sign out and sign in again to unlock your Vault PIN.");
              setIsFinancing(false);
              return;
          }
      } else {
          signer = await browserProvider.getSigner();
      }
      
      const { contract } = await getContract();
      const adminHub = await contract.adminTreasury();

      const tx = await signer.sendTransaction({
        to: adminHub,
        value: ethers.parseEther(ethRequired.toFixed(18))
      });
      
      setUserMsg(`🚀 Off-ramp signal broadcasted! Tx: ${tx.hash.slice(0,10)}...`);
      await tx.wait();

      // Phase 2: Update Imaginary Bank Ledger
      const phone = localStorage.getItem("farmer_session_phone");
      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
      const res = await fetch(`${API_URL}/api/bank/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone,
          amount_inr: inrValue,
          tx_hash: tx.hash
        })
      });
      
      if (res.ok) {
        setUserMsg(`✅ PayNow Success! ₹${inrValue} has been successfully credited to your imaginary bank account.`);
        setWithdrawalINR("");
        fetchBankRecord();
        loadBlockchainData(); // Refresh ETH balance
      }
    } catch (err) {
      console.error(err);
      setUserMsg(parseWeb3Error(err));
    } finally {
      setIsFinancing(false);
    }
  };

  const handleBuyGas = async () => {
    const phone = localStorage.getItem("farmer_session_phone");
    const address = localStorage.getItem("farmer_address");
    
    if (bankAccount.balance_inr < 250) {
      setUserMsg("❌ Insufficient Bank Balance! You need at least ₹250 in your Passbook to buy Gas.");
      return;
    }

    setIsFinancing(true);
    setUserMsg("⏳ Agri-Gas ATM: Routing INR payout to decentralized gas node...");

    try {
      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
      const res = await fetch(`${API_URL}/api/bank/buy-gas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone,
          address: address,
          amount_inr: 250
        })
      });

      const data = await res.json();
      if (res.ok) {
        setUserMsg(`✅ Gas Drop Success! 0.005 ETH has been dispatched to your vault. Tx: ${data.tx_hash.slice(0,10)}...`);
        fetchBankRecord();
        // Wait a few seconds for the block to mine before refreshing balance
        setTimeout(loadBlockchainData, 5000);
      } else {
        setUserMsg(`❌ ATM Error: ${data.error}`);
      }
    } catch (err) {
      setUserMsg("❌ Gas Node Offline. Please check your backend connection.");
    } finally {
      setIsFinancing(false);
    }
  };

  const handlePartialPurchase = async (batchId, maxQty, rawPricePerKgWei) => {
    const requestedQtyStr = purchaseAmounts[batchId];
    if (!requestedQtyStr) return;
    const requestedQty = parseInt(requestedQtyStr);
    
    if (requestedQty <= 0 || requestedQty > maxQty) {
      setUserMsg(`❌ Invalid amount. You can buy between 1 and ${maxQty} kg.`);
      return;
    }

    try {
      setUserMsg(`⏳ Minting a ${requestedQty}kg Contract for Batch #${batchId}... Please approve the payment in MetaMask.`);
      const { contract } = await getContract();
      
      // Calculate fraction safely utilizing BigInt
      const rawBN = window.BigInt(rawPricePerKgWei);
      const reqBN = window.BigInt(requestedQty);
      const exactCostWei = (rawBN * reqBN).toString();

      const tx = await contract.purchasePartialBatch(batchId, requestedQty, { value: exactCostWei });
      await tx.wait();
      setUserMsg(`✅ Successfully Fractionalized ${requestedQty}kg! Your independent slice is safely locked in Escrow.`);
      
      // Clear Form state
      setPurchaseAmounts(prev => ({...prev, [batchId]: ""}));
      loadBlockchainData();
    } catch (err) {
      console.error(err);
      setUserMsg(parseWeb3Error(err));
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  const ipfsCidToBytes32 = (cid) => {
    if (!cid) return ethers.ZeroHash;
    try { return ethers.keccak256(ethers.toUtf8Bytes(cid)); } catch { return ethers.ZeroHash; }
  };

  const getExpiryLabel = (ts) => {
    if (!ts) return null;
    const diff = ts * 1000 - Date.now();
    if (diff <= 0) return { text: "Expired", expired: true };
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    const rem = hours % 24;
    return { text: days > 0 ? `${days}d ${rem}h left` : `${hours}h left`, expired: false };
  };

  // ── First-Time User Interceptor ──────────────────────────────────────────
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

  // ── Action Handlers ──────────────────────────────────────────────────────
  const executeUploadPackingVideo = (batchId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/webm,video/ogg,video/quicktime';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) { // 20MB limit
        setUserMsg("⚠️ Video size exceeds 20MB. Please upload a compressed clip.");
        return;
      }
      try {
        setUserMsg(`⏳ Uploading video to decentralized storage (IPFS)...`);
        const formData = new FormData();
        formData.append("file", file);
        const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
        const res = await fetch(`${API_URL}/api/ipfs/upload`, {
          method: 'POST',
          body: formData
        });
        
        const data = await res.json();
        if (!res.ok || !data.ipfs_hash) throw new Error(data.error || "Failed to pin to IPFS.");
        
        const cid = data.ipfs_hash.trim();
        setUserMsg(`🔗 File Pinned: ${cid}. Securing hash on APMC Ledger...`);
        
        const { contract } = await getContract();
        const hashBytes32 = ipfsCidToBytes32(cid);
        const tx = await contract.uploadPackingVideo(batchId, hashBytes32);
        await tx.wait();

        const cidMap = JSON.parse(localStorage.getItem("ipfs_cid_map") || "{}");
        cidMap[hashBytes32] = cid;
        localStorage.setItem("ipfs_cid_map", JSON.stringify(cidMap));
        
        setUserMsg(`✅ Evidence Locked! Pre-packing hash is now immutable on-chain.`);
        loadBlockchainData();
      } catch (err) { setUserMsg(parseWeb3Error(err)); }
    };
    input.click();
  };

  const handleUploadPackingVideo = (batchId) => {
    requestCriticalAction(
      "tut_upload_video",
      "Immutable Evidence Lock",
      "You are about to upload the Pre-Packing Video. Once this video uploads, its cryptographic hash is locked natively into the smart contract FOREVER. No central admin can alter it. Be absolutely sure the video clearly shows both the produce quality and quantity.",
      "📹",
      () => executeUploadPackingVideo(batchId)
    );
  };

  const executeConfirmDispatch = async (batchId) => {
    const trackingId = trackingInputs[batchId];
    if (!trackingId) { setUserMsg("⚠️ Enter a carrier tracking ID before dispatching."); return; }
    try {
      setUserMsg(`⏳ Confirming dispatch for Batch #${batchId}... Tracking ID will be locked on-chain.`);
      const { contract } = await getContract();
      const tx = await contract.confirmDispatch(batchId, trackingId);
      await tx.wait();
      setUserMsg(`✅ Dispatch confirmed! Tracking ID immutably stored. Buyer's pre-dispatch refund rights are now suspended.`);
      setTrackingInputs(prev => ({ ...prev, [batchId]: "" }));
      loadBlockchainData();
    } catch (err) { setUserMsg(parseWeb3Error(err)); }
  };

  const handleConfirmDispatch = (batchId) => {
    requestCriticalAction(
      "tut_dispatch",
      "Logistics Handover",
      "Confirming dispatch locks the tracking ID strictly on-chain and revokes the buyer's ability to cancel the order natively. You are now formally liable for any spoilage in transit until the buyer scans the QR code.",
      "🚚",
      () => executeConfirmDispatch(batchId)
    );
  };

  const handleConfirmDelivery = async (batchId) => {
    try {
      setUserMsg(`⏳ Confirming delivery for Batch #${batchId}...`);
      const { contract } = await getContract();
      const tx = await contract.confirmDelivery(batchId, ethers.ZeroHash);
      await tx.wait();
      setUserMsg(`✅ Delivery confirmed! Escrow and stake released to farmer.`);
      loadBlockchainData();
    } catch (err) { setUserMsg(parseWeb3Error(err)); }
  };

  const executeNominateTrustee = (batchId) => {
    const trusteeData = trusteeInputs[batchId];
    if (!trusteeData || !trusteeData.phone || trusteeData.phone.length < 10) {
      setUserMsg("❌ Please enter a valid 10-digit phone number for your nominee.");
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/webm';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      setUserMsg("⏳ Uploading Trustee Consent Video to IPFS network...");
      const formData = new FormData();
      formData.append("file", file);

      try {
        const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
        const res = await fetch(`${API_URL}/api/ipfs/upload`, {
          method: "POST",
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const cid = data.ipfs_hash.trim();
        const hashBytes32 = ipfsCidToBytes32(cid);

        setUserMsg("⏳ Submitting Nomination to the Blockchain...");
        const { contract } = await getContract();
        const tx = await contract.nominateTrustee(batchId, trusteeData.phone, hashBytes32);
        await tx.wait();

        // Local cache for the Deliverer scanner lookup
        const cidMap = JSON.parse(localStorage.getItem("ipfs_cid_map") || "{}");
        cidMap[hashBytes32] = cid;
        localStorage.setItem("ipfs_cid_map", JSON.stringify(cidMap));

        setUserMsg(`✅ Authority Granted! Real-world identity of +${trusteeData.phone} is now bound to this batch.`);
        setTrusteeInputs(prev => ({ ...prev, [batchId]: null }));
        loadBlockchainData();
      } catch (err) {
        setUserMsg(parseWeb3Error(err));
      }
    };
    input.click();
  };

  const handleNominateTrustee = (batchId) => {
    requestCriticalAction(
      "tut_trustee",
      "Assigning an Escrow Proxy",
      "You are transferring cryptographically-secured signature authority to a neighbor/staff member. This means THEY hold the power to release your funds to the driver. Make sure your video distinctly features you verbally authorizing their specific phone number. Proceed?",
      "🤝",
      () => executeNominateTrustee(batchId)
    );
  };

  const handleWatchConsentVideo = (hashBytes32) => {
    const cidMap = JSON.parse(localStorage.getItem("ipfs_cid_map") || "{}");
    const cid = cidMap[hashBytes32];
    if (cid) {
      window.open(`https://gateway.pinata.cloud/ipfs/${cid}`, '_blank');
    } else {
      setUserMsg("⚠️ Consent Video CID not found in active cache. Network indexing may be required.");
    }
  };

  const handlePartialConfirm = async (batchId, totalQty) => {
    const qty = parseInt(partialQtys[batchId]);
    if (!qty || qty <= 0 || qty >= totalQty) {
      setUserMsg(`⚠️ Enter a valid partial quantity (1 to ${totalQty - 1} kg).`); return;
    }
    try {
      setUserMsg(`⏳ Confirming partial delivery of ${qty}kg for Batch #${batchId}...`);
      const { contract } = await getContract();
      const tx = await contract.partialConfirm(batchId, qty, ethers.ZeroHash);
      await tx.wait();
      setUserMsg(`✅ Partial delivery confirmed! Proportional escrow released to farmer.`);
      setPartialQtys(prev => ({ ...prev, [batchId]: "" }));
      loadBlockchainData();
    } catch (err) { setUserMsg(parseWeb3Error(err)); }
  };

  const handleRefund = async (batchId) => {
    try {
      setUserMsg(`⏳ Requesting Refund for Batch #${batchId}...`);
      const { contract } = await getContract();
      const tx = await contract.refund(batchId);
      await tx.wait();
      setUserMsg(`✅ Refund processed! Funds returned from Escrow.`);
      loadBlockchainData();
    } catch (err) { setUserMsg(parseWeb3Error(err)); }
  };

  const handleReportSpoilt = async (batchId, rawBatchPrice) => {
    try {
      const { contract } = await getContract();
      const bondWei = await contract.calculateDisputeBond(rawBatchPrice);
      const bondEth = parseFloat(ethers.formatEther(bondWei)).toFixed(5);
      const ok = window.confirm(
        `Filing a dispute requires an anti-spam bond of ${bondEth} ETH.\n\n` +
        `✅ If arbitrators rule in YOUR favour: bond returned + escrow refunded.\n` +
        `❌ If your claim is found false: bond is forfeited.\n\n` + 
        `You will now be prompted to upload the video evidence of the damage. Proceed?`
      );
      if (!ok) return;

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/mp4,video/webm,video/ogg,video/quicktime';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
          setUserMsg("⚠️ Video size exceeds 20MB. Please compress.");
          return;
        }

        try {
          setUserMsg(`🚨 Uploading discrepancy evidence to IPFS...`);
          const formData = new FormData();
          formData.append('file', file);

          const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
          const res = await fetch(`${API_URL}/api/ipfs/upload`, {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (!res.ok || !data.ipfs_hash) throw new Error(data.error || "IPFS pin failed.");
          
          const cid = data.ipfs_hash.trim();
          setUserMsg(`🔗 Pinned: ${cid}. Engaging Arbitration Smart Contract (Bond: ${bondEth} ETH)...`);
          
          const hashBytes32 = ipfsCidToBytes32(cid);
          const tx = await contract.reportSpoilt(batchId, hashBytes32, { value: bondWei });
          await tx.wait();
          
          const cidMap = JSON.parse(localStorage.getItem("ipfs_cid_map") || "{}");
          cidMap[hashBytes32] = cid;
          localStorage.setItem("ipfs_cid_map", JSON.stringify(cidMap));

          setUserMsg(`✅ Dispute filed! 5 APMC blind arbitrators assigned. Check progress on Arbitrator Hub.`);
          loadBlockchainData();
        } catch (err) { setUserMsg(parseWeb3Error(err)); }
      };
      input.click();
    } catch (err) { setUserMsg(parseWeb3Error(err)); }
  };

  const handleClaimAbandoned = async (batchId) => {
    try {
      setUserMsg(`⏳ Claiming abandoned escrow for Batch #${batchId}...`);
      const { contract } = await getContract();
      const tx = await contract.claimAbandoned(batchId);
      await tx.wait();
      setUserMsg(`✅ Funds claimed! Buyer's silence treated as acceptance per protocol rules.`);
      loadBlockchainData();
    } catch (err) { setUserMsg(parseWeb3Error(err)); }
  };

  const handleUnlist = async (batchId) => {
    try {
      setUserMsg(`⏳ Unlisting Batch #${batchId}... Requesting stake refund.`);
      const { contract } = await getContract();
      const tx = await contract.cancelBatch(batchId);
      await tx.wait();
      setUserMsg(`✅ Listing removed! Security stake securely refunded.`);
      loadBlockchainData();
    } catch (err) { setUserMsg(parseWeb3Error(err)); }
  };

  // --------------------------------------------------------------------------
  // FILTER ENGINE
  // --------------------------------------------------------------------------
  const filteredBatches = batches.filter(b => {
    // 1. Search Query (ID or Product Name)
    const matchesSearch = 
      b.id === searchQuery || 
      b.name.toLowerCase().includes(searchQuery.toLowerCase());
      
    // 2. Min Quantity
    const minReq = parseInt(minQuantity) || 0;
    const matchesQuantity = b.remainingQuantity >= minReq;

    // 3. Location Filter
    const matchesLocation = b.location.toLowerCase().includes(locationSearch.toLowerCase());
    
    // 4. Hide Sold Out
    const matchesAvailability = hideSoldOut ? b.remainingQuantity > 0 : true;

    return matchesSearch && matchesQuantity && matchesLocation && matchesAvailability;
  });

  const handleFundFarmer = async () => {
    const targetAddress = prompt("Enter the Farmer's Invisible Wallet Address (Starts with 0x...):");
    if (!targetAddress) return;
    
    // Cryptographic user validation check
    if (!ethers.isAddress(targetAddress)) {
       setUserMsg(`❌ Invalid Address! You pasted "${targetAddress}". Please paste the 0x address shown on the Farmer's dashboard, not a URL!`);
       return;
    }

    try {
      const { contract, signer } = await getContract();
      
      // ADMIN PRE-FLIGHT BALANCE CHECK! 
      // Prevents "Broken Pipeline" where Step 1 succeeds but Step 2 fails! 
      const adminBal = await signer.getProvider().getBalance(await signer.getAddress());
      const minRequired = ethers.parseEther("0.016"); // 0.01 Stake + 0.005 Gas + 0.001 Overhead
      
      if (adminBal < minRequired) {
          setUserMsg(`❌ Insufficient Admin Funds: You need at least 0.016 ETH to sponsor a farmer. You currently have ${ethers.formatEther(adminBal)} ETH.`);
          return;
      }

      // THE SEED SUBSIDY LOCK!
      const hasSold = await contract.hasSoldCrop(targetAddress);
      if (hasSold) {
          setUserMsg(`❌ Paymaster Denied! This farmer has already successfully delivered a crop and holds Ethereum. They are now financially independent and must pay their own Anti-Spam Stake!`);
          return;
      }

      setUserMsg(`⏳ Sponsoring First-Time Farmer ${targetAddress.slice(0,6)}... \nStep 1/2: Please approve MetaMask to drop 0.005 ETH for network gas...`);
      const tx1 = await signer.sendTransaction({
        to: targetAddress,
        value: ethers.parseEther("0.005") // Only microscopic EVM gas transfers to the vulnerable wallet!
      });
      await tx1.wait();

      setUserMsg(`⏳ Gas Transfer complete! \nStep 2/2: Please approve MetaMask to securely lock the 0.01 ETH Anti-Spam Stake into the Smart Contract Vault...`);
      const tx2 = await contract.sponsorFarmer(targetAddress, {
          value: ethers.parseEther("0.01") // Delegated Staking logic
      });
      await tx2.wait();
      
      setUserMsg(`✅ Paymaster Architecture Success! You securely locked the 0.01 ETH Stake in the Smart Contract and dropped 0.005 Gas. The Hacker exploit is mathematically dead. They are ready to harvest!`);
    } catch (e) {
      setUserMsg(parseWeb3Error(e));
    }
  };

  return (
    <div className="dashboard-container">
      {/* ── Overlays ── */}
      {showHelp && <HelpGlossaryModal onClose={() => setShowHelp(false)} />}
      {tutorialConfig && <TutorialModal {...tutorialConfig} />}

      <header className="dashboard-header">
        <div className="header-left">
          <h2 className="dashboard-title">
            <span className="icon-wrap">🛒</span> Web3 Produce Marketplace
          </h2>
          <p className="dashboard-subtitle">Direct peer-to-peer agricultural lineage tracking</p>
        </div>
        <div className="header-actions">
            {!isFarmerAuth && account && (
               <button onClick={handleFundFarmer} className="sponsor-btn">
                 <span className="btn-icon">⛽</span> Sponsor Setup
               </button>
            )}
            <button className="harvest-btn glow-button" onClick={() => navigate("/add-produce")}>
              <span className="btn-icon">➕</span> Harvest Produce
            </button>
        </div>
      </header>

      {isFarmerAuth && (
         <div className="farmer-status-card">
           <div className="status-item">
             <span className="status-label">🔐 Secure Vault ID</span>
             <span className="status-value">{localStorage.getItem("farmer_address")}</span>
           </div>
           <div className="status-divider"></div>
            <div className="status-item">
              <span className="status-label">⛽ Gas Balance</span>
              <div className="gas-status-row">
                <span className={`status-value ${parseFloat(farmerBal) < 0.01 ? 'low-gas' : ''}`}>
                  {farmerBal} <span className="currency-unit">ETH</span>
                </span>
                {isFarmerAuth && (
                  <button className="top-up-btn" onClick={handleBuyGas} title="Exchange ₹250 for 0.005 ETH Gas">
                    ⛽ Top Up (₹250)
                  </button>
                )}
              </div>
              {parseFloat(farmerBal) < 0.01 && <span className="gas-warning">Warning: Low Gas</span>}
            </div>
         </div>
      )}

      {isFarmerAuth && (
        <div className="finance-hub-container">
          <div className="finance-card passbook-card">
            <div className="card-header-row">
              <h3 className="finance-title">🏧 Merchant Passbook</h3>
              <div className="bank-status-meta">
                <button className="sync-btn" onClick={fetchBankRecord} title="Sync with Bank Nodes">🔄</button>
                <span className={`bank-badge ${isBankOnline ? 'online' : 'offline'}`}>
                  {isBankOnline ? '🟢 Online' : '🔴 Offline'}
                </span>
              </div>
            </div>
            <div className="fiat-balance-display">
              <span className="fiat-label">Total Local Funds</span>
              <span className="fiat-value">₹{Math.round(bankAccount.balance_inr).toLocaleString('en-IN')}</span>
            </div>
            
            <div className="withdrawal-interaction">
              <div className="input-with-label">
                <label>Withdraw to Bank (INR)</label>
                {!isBankOnline && <p className="bank-offline-msg">⚠️ Bank Node is Offline. Payouts paused.</p>}
                <div className="withdrawal-input-row">
                  <span className="input-prefix">₹</span>
                  <input 
                    type="number" 
                    placeholder="Enter INR Amount"
                    value={withdrawalINR}
                    onChange={(e) => setWithdrawalINR(e.target.value)}
                    disabled={!isBankOnline}
                  />
                  <button 
                    className="withdraw-btn"
                    onClick={handleWithdrawToBank}
                    disabled={isFinancing || !isBankOnline}
                  >
                    {isFinancing ? "Processing..." : "Withdraw"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="finance-card history-card">
            <h3 className="finance-title">🧾 Transaction History</h3>
            <div className="history-list">
              {bankAccount.history.length === 0 ? (
                <p className="empty-history">No banking transactions recorded.</p>
              ) : (
                bankAccount.history.map((tx, idx) => (
                  <div key={idx} className="history-item">
                    <div className="tx-main">
                      <span className="tx-type">{tx.type}</span>
                      <span className="tx-date">{tx.timestamp}</span>
                    </div>
                    <span className="tx-amount credit">+ ₹{tx.amount.toLocaleString('en-IN')}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {userMsg && (
        <div className={`status-notification ${userMsg.includes('✅') ? 'success' : 'error'}`}>
          {userMsg}
        </div>
      )}

      {/* COMMAND CENTER: FILTER & SEARCH */}
      <div className="filter-command-center">
        <div className="input-group search-group">
          <span className="input-icon">🔍</span>
          <input 
            type="text" 
            placeholder="Search Name or Batch ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="input-group qty-group">
          <span className="input-icon">⚖️</span>
          <input 
            type="number" 
            placeholder="Min kg..." 
            value={minQuantity} 
            onChange={(e) => setMinQuantity(e.target.value)} 
          />
        </div>
        <div className="input-group location-group">
          <span className="input-icon">📍</span>
          <input 
            type="text" 
            placeholder="Search by Location..." 
            value={locationSearch} 
            onChange={(e) => setLocationSearch(e.target.value)} 
          />
        </div>
        <label className="toggle-group">
          <input 
            type="checkbox" 
            checked={hideSoldOut} 
            onChange={(e) => setHideSoldOut(e.target.checked)}
          />
          <span className="toggle-label">Hide Sold Out</span>
        </label>
      </div>

      {isLoading ? (
        <div className="blockchain-loader">
          <div className="spinner"></div>
          <p>Syncing with Sepolia Ledger...</p>
        </div>
      ) : (
        <div className="produce-grid">
          {filteredBatches.length === 0 ? (
            <div className="empty-state">
              <p>No agricultural records found matching your filters.</p>
            </div>
          ) : (
            filteredBatches.map(batch => (
              <div key={batch.id} className={`produce-card status-${batch.status.toLowerCase()}`}>
                <div className="card-header">
                  <div className="traceability-tag">#{batch.id}</div>
                  <span className="status-badge">{batch.status}</span>
                </div>

                <div className="card-body">
                  <h3 className="produce-name">{batch.name}</h3>
                  
                  <div className="data-row">
                    <span className="data-label">Origin Stake</span>
                    <span className="data-value">{batch.quantity} kg</span>
                  </div>
                  
                  <div className="data-row highlight">
                    <span className="data-label">Market Supply</span>
                    <span className={`data-value ${batch.remainingQuantity > 0 ? 'in-stock' : 'out-of-stock'}`}>
                      {batch.remainingQuantity} kg
                    </span>
                  </div>
                  
                  <div className="data-row location-row">
                    <span className="data-label">📍 Location</span>
                    <span className="data-value location-text">{batch.location}</span>
                  </div>

                  <div className="card-price-grid">
                    <span className="fiat-price">₹{batch.displayINRPerKg}<span style={{fontSize: "0.7em", color: "#9ca3af"}}> /kg</span></span>
                    <span className="eth-price">{parseFloat(batch.displayPricePerKg).toFixed(5)} ETH<span style={{fontSize: "0.7em", color: "#6b7280"}}> /kg</span></span>
                  </div>
                </div>

                {/* ── PROTOCOL EXECUTION DOCK ────────────────────────────────────── */}
                <div className="execution-dock">

                  {/* Expiry Countdown */}
                  {batch.expiryTimestamp > 0 && ["Created","Sold","Dispatched"].includes(batch.status) && (() => {
                    const exp = getExpiryLabel(batch.expiryTimestamp);
                    return exp ? (
                      <div className={`expiry-badge ${exp.expired ? "expired" : ""}`}>
                        ⏰ {exp.text}
                      </div>
                    ) : null;
                  })()}

                  {/* Packing Video Evidence Link */}
                  {batch.video1Hash && batch.video1Hash !== ethers.ZeroHash && (
                    <a
                      href={`https://ipfs.io/ipfs/${(() => {
                        const cidMap = JSON.parse(localStorage.getItem("ipfs_cid_map") || "{}");
                        return cidMap[batch.video1Hash] || batch.video1Hash;
                      })()}`}
                      target="_blank" rel="noreferrer"
                      className="evidence-link"
                    >
                      📹 View Packing Evidence
                    </a>
                  )}

                  {/* ── CREATED: Buyers can purchase ── */}
                  {batch.status === "Created" && account && batch.farmer !== account && batch.remainingQuantity > 0 && (() => {
                    const inputQty = parseInt(purchaseAmounts[batch.id]) || 0;
                    let dynamicFiat = "0"; let dynamicEth = "0.0000";
                    if (inputQty > 0 && inputQty <= batch.remainingQuantity) {
                      const ethNum = parseFloat(batch.displayPricePerKg) * inputQty;
                      dynamicEth = ethNum.toFixed(4);
                      dynamicFiat = Math.round(ethNum * conversionRate).toLocaleString('en-IN');
                    }
                    return (
                      <div className="purchase-intent-block">
                        <div className="input-action-row">
                          <input type="number" min="1" max={batch.remainingQuantity} placeholder="kg"
                            value={purchaseAmounts[batch.id] || ""}
                            onChange={(e) => setPurchaseAmounts({...purchaseAmounts, [batch.id]: e.target.value})}
                            className="qty-input"
                          />
                          <button
                            onClick={() => handlePartialPurchase(batch.id, batch.remainingQuantity, batch.rawPricePerKg)}
                            disabled={inputQty <= 0 || inputQty > batch.remainingQuantity}
                            className="buy-btn"
                          >Purchase Yield</button>
                        </div>
                        {inputQty > 0 && (
                          <p className="estimate-text">Escrow lock: ₹{dynamicFiat} ({dynamicEth} ETH)</p>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── CREATED: Farmer owns this listing ── */}
                  {batch.status === "Created" && batch.farmer === account && (
                    <div className="ownership-block">
                      <span className="owner-label">Your Active Listing</span>
                      {batch.parentId === "0" && (
                        <button onClick={() => handleUnlist(batch.id)} className="unlist-btn">
                          🗑️ Cancel &amp; Reclaim Stake
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── SOLD: Farmer actions ── */}
                  {batch.status === "Sold" && batch.farmer === account && (
                    <div className="farmer-dispatch-block">
                      <div className="action-header">
                        <h3>📦 Finalize Batch</h3>
                        <button className="help-icon-btn" onClick={() => handleUploadPackingVideo(null)}>❓</button>
                      </div>
                      <p className="action-desc">Upload the <strong>Pre-Packing Video</strong> to IPFS. This hash is then locked into the smart contract for dispute resolution.</p>
                      <p className="step-label">Step 1 — Secure Evidence</p>
                      {batch.video1Hash && batch.video1Hash !== ethers.ZeroHash ? (
                        <span className="step-done">✅ Packing Video Secured On-Chain</span>
                      ) : (
                        <button onClick={() => handleUploadPackingVideo(batch.id)} className="upload-btn">
                          📹 Upload Packing Video
                        </button>
                      )}
                      <p className="step-label" style={{marginTop:"10px"}}>Step 2 — Confirm Dispatch</p>
                      <div className="input-action-row">
                        <input type="text" placeholder="Carrier Tracking ID..."
                          value={trackingInputs[batch.id] || ""}
                          onChange={(e) => setTrackingInputs({...trackingInputs, [batch.id]: e.target.value})}
                          className="tracking-input"
                        />
                        <button onClick={() => handleConfirmDispatch(batch.id)}
                          disabled={!trackingInputs[batch.id]} className="dispatch-btn">
                          🚚 Dispatch
                        </button>
                      </div>
                      <button onClick={() => handleRefund(batch.id)} className="refund-btn full-width">
                        🚨 Return Supply (Refund Buyer)
                      </button>
                    </div>
                  )}

                  {/* ── SOLD: Buyer awaiting dispatch ── */}
                  {batch.status === "Sold" && batch.buyer === account && (
                    <div className="buyer-action-block">
                      <p className="awaiting-label">⏳ Awaiting Farmer Dispatch</p>

                      {batch.trusteePhone ? (
                        <div className="trustee-active-block" style={{marginTop:"10px", marginBottom:"10px", background:"#f1f5f9", padding:"10px", borderRadius:"6px"}}>
                          <span style={{fontSize:"0.85rem", color:"#475569"}}>🤝 Nominated Receiver: <strong>+{batch.trusteePhone}</strong></span>
                        </div>
                      ) : (
                        <div className="trustee-nomination-block" style={{marginTop:"10px", marginBottom:"10px", borderTop:"1px dashed #cbd5e1", borderBottom:"1px dashed #cbd5e1", padding:"10px 0"}}>
                          <p style={{fontSize:"0.85rem", color:"#475569", marginBottom:"8px"}}>Not home? Nominate a neighbor to scan the delivery QR:</p>
                          <div className="input-action-row">
                            <input 
                              type="text" 
                              placeholder="10-digit Phone No."
                              value={trusteeInputs[batch.id]?.phone || ""}
                              onChange={(e) => setTrusteeInputs({...trusteeInputs, [batch.id]: { phone: e.target.value }})}
                              className="qty-input"
                            />
                            <button 
                              onClick={() => handleNominateTrustee(batch.id)} 
                              disabled={!trusteeInputs[batch.id]?.phone || trusteeInputs[batch.id].phone.length < 10}
                              className="nominate-btn glow-button"
                              style={{ border:"none", borderRadius:"6px", padding:"8px 12px", fontWeight:"bold", cursor:"pointer", background:"none" }}
                            >Assign Proxy</button>
                          </div>
                        </div>
                      )}

                      <button onClick={() => handleRefund(batch.id)} className="refund-btn">
                        🚨 Cancel &amp; Refund (Pre-Dispatch)
                      </button>
                    </div>
                  )}

                  {/* ── DISPATCHED: Buyer actions ── */}
                  {batch.status === "Dispatched" && batch.buyer === account && (
                    <div className="delivery-confirm-block">
                      <p className="tracking-info">🚚 In Transit: <strong>{batch.trackingId}</strong></p>

                      {batch.trusteePhone ? (
                        <div className="trustee-active-block" style={{marginTop:"10px", marginBottom:"10px", background:"#f1f5f9", padding:"10px", borderRadius:"6px"}}>
                          <span style={{fontSize:"0.85rem", color:"#475569"}}>🤝 Nominated Receiver: <strong>+{batch.trusteePhone}</strong></span>
                        </div>
                      ) : (
                        <div className="trustee-nomination-block" style={{marginTop:"10px", marginBottom:"10px", borderTop:"1px dashed #cbd5e1", borderBottom:"1px dashed #cbd5e1", padding:"10px 0"}}>
                          <p style={{fontSize:"0.85rem", color:"#475569", marginBottom:"8px"}}>Not home? Nominate a neighbor to scan the delivery QR:</p>
                          <div className="input-action-row">
                            <input 
                              type="text" 
                              placeholder="10-digit Phone No."
                              value={trusteeInputs[batch.id]?.phone || ""}
                              onChange={(e) => setTrusteeInputs({...trusteeInputs, [batch.id]: { phone: e.target.value }})}
                              className="qty-input"
                            />
                            <button 
                              onClick={() => handleNominateTrustee(batch.id)} 
                              disabled={!trusteeInputs[batch.id]?.phone || trusteeInputs[batch.id].phone.length < 10}
                              className="nominate-btn glow-button"
                              style={{ border:"none", borderRadius:"6px", padding:"8px 12px", fontWeight:"bold", cursor:"pointer", background:"none" }}
                            >Assign Proxy</button>
                          </div>
                        </div>
                      )}

                      <button onClick={() => handleConfirmDelivery(batch.id)} className="confirm-btn">
                        ✅ Confirm Full Delivery
                      </button>
                      <div className="partial-row">
                        <input type="number" min="1" max={batch.quantity - 1}
                          placeholder={`Partial kg (max ${batch.quantity - 1})...`}
                          value={partialQtys[batch.id] || ""}
                          onChange={(e) => setPartialQtys({...partialQtys, [batch.id]: e.target.value})}
                          className="qty-input"
                        />
                        <button onClick={() => handlePartialConfirm(batch.id, batch.quantity)}
                          disabled={!partialQtys[batch.id]} className="partial-btn">
                          📦 Partial Accept
                        </button>
                      </div>
                      <button onClick={() => handleReportSpoilt(batch.id, batch.rawPrice)} className="spoilt-btn">
                        🔥 Report Dispute / Spoilt
                      </button>
                    </div>
                  )}

                  {/* ── DISPATCHED: Farmer waiting ── */}
                  {batch.status === "Dispatched" && batch.farmer === account && (
                    <div className="farmer-waiting-block" style={{ textAlign: "center" }}>
                      <p className="tracking-info" style={{ marginBottom: "12px" }}>🚚 Dispatched: <strong>{batch.trackingId}</strong></p>
                      
                      {batch.trusteePhone && batch.trusteeConsentHash !== ethers.ZeroHash && (
                        <div style={{ background: "#fef3c7", padding: "12px", borderRadius: "8px", marginBottom: "16px", border: "1px solid #fde68a" }}>
                          <p style={{ margin: "0 0 8px 0", fontSize: "0.85rem", color: "#92400e", fontWeight: "bold" }}>
                            🚨 PROXY AUTHORIZATION GRANTED 🚨
                          </p>
                          <p style={{ margin: "0 0 8px 0", fontSize: "0.85rem", color: "#92400e" }}>
                            The primary buyer has digitally nominated <strong>+{batch.trusteePhone}</strong> to accept this delivery. 
                            <strong> DO NOT hand goods to anyone else!</strong>
                          </p>
                          <button 
                            onClick={() => handleWatchConsentVideo(batch.trusteeConsentHash)}
                            style={{ background: "#d97706", color: "white", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem", fontWeight: "bold" }}
                          >
                            👁️ View Buyer's Holographic Consent
                          </button>
                        </div>
                      )}

                      <div style={{ background: "white", padding: "16px", borderRadius: "12px", display: "inline-block", margin: "10px 0" }}>
                        <QRCodeSVG 
                          value={`${window.location.origin}/delivery/${batch.id}`} 
                          size={180} 
                          level="M"
                        />
                      </div>
                      
                      <p className="waiting-note" style={{ fontSize: "0.85rem", color: "#64748b", margin: "10px 0" }}>
                        <strong>Driver Instructions:</strong><br/>
                        Ask the receiver to scan this QR code with their phone camera to complete Delivery Handshake and release funds.
                      </p>


                      <div style={{ marginTop: "16px" }}>
                        {Date.now() / 1000 > batch.expiryTimestamp + 7 * 86400 ? (
                          <button onClick={() => handleClaimAbandoned(batch.id)} className="abandon-btn full-width">
                            💰 Claim Abandoned Escrow
                          </button>
                        ) : (
                          <p style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                            Escrow abandonment claim unlocks 7 days post-expiry.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── DISPUTED: Under arbitration ── */}
                  {batch.status === "Disputed" && (
                    <div className="disputed-block">
                      <span className="disputed-label">⚖️ Under APMC Arbitration</span>
                      <p>5 certified arbitrators have been assigned. First to 3 votes wins.</p>
                    </div>
                  )}

                  {/* ── VERDICTS ── */}
                  {batch.status === "FarmerWins" && (
                    <div className="verdict-block farmer-win">
                      🏆 Arbitration: Farmer Prevailed
                    </div>
                  )}
                  {batch.status === "BuyerWins" && (
                    <div className="verdict-block buyer-win">
                      ✅ Arbitration: Buyer Refunded
                    </div>
                  )}

                  {/* ── CONFIRMED/PARTIAL: Re-sell option ── */}
                  {["Confirmed", "PartialConfirm"].includes(batch.status) && batch.remainingQuantity > 0 && batch.buyer === account && (
                    <button onClick={() => navigate("/add-produce")} className="resell-btn">
                      📦 Re-Sell in Marketplace
                    </button>
                  )}

                  {/* ── ABANDONED / REFUNDED / CANCELLED: Terminal states ── */}
                  {["Abandoned", "Refunded", "Cancelled"].includes(batch.status) && (
                    <span className="terminal-label">Protocol Closed</span>
                  )}

                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
