import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { getContract } from "../utils/ethereum";
import { parseWeb3Error } from "../utils/errorHelper";
import "./ArbitratorDashboard.css";

export default function ArbitratorDashboard({ arbitratorAccount }) {
  const navigate = useNavigate();
  const [arbStats, setArbStats] = useState({ rating: 0, earnings: 0, resolved: 0 });
  const [assignedDisputes, setAssignedDisputes] = useState([]);
  const [pendingApplicants, setPendingApplicants] = useState([]); // New state for applicants
  const [isLoading, setIsLoading] = useState(true);
  const [userMsg, setUserMsg] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [poolSize, setPoolSize] = useState(0);

  const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

  useEffect(() => {
    // Session check
    const isAuth = sessionStorage.getItem("arbitrator_session") === "true";
    const savedAccount = sessionStorage.getItem("arbitrator_address");
    
    if (!isAuth || !savedAccount) {
      navigate("/arbitrator-login");
      return;
    }

    // Use passed account or fallback to session
    const activeAccount = arbitratorAccount || savedAccount;
    fetchDashboardData(activeAccount);
    
    const interval = setInterval(() => fetchDashboardData(activeAccount), 15000);
    return () => clearInterval(interval);
  }, [arbitratorAccount, navigate]);

  const fetchDashboardData = async (account) => {
    try {
      const { contract } = await getContract();
      
      // 0. Admin & Pool Context
      const adminAddr = await contract.adminTreasury();
      setIsAdmin(adminAddr.toLowerCase() === account.toLowerCase());
      
      const pSize = await contract.getArbitratorPool(); // We might need to add a getter or access .length
      const pSizeNum = Number(pSize.length); 
      setPoolSize(pSizeNum);

      // 1. Fetch Arbitrator Stats
      const stats = await contract.getArbitrator(account);
      setArbStats({
        rating: (Number(stats.rating) / 100).toFixed(2),
        earnings: ethers.formatEther(stats.totalEarnings),
        resolved: Number(stats.disputesResolved)
      });

      // 2. Fetch all disputes and filter for this arbitrator
      const dCount = await contract.disputeCount();
      const numDisputes = Number(dCount);
      let localDisputes = [];

      for (let i = numDisputes; i >= 1; i--) { // Newest first
        const dispute = await contract.disputes(i);
        const assigned = await contract.getDisputeArbitrators(i);
        
        // Is this arbitrator assigned?
        const isAssigned = assigned.some(addr => addr.toLowerCase() === account.toLowerCase());
        
        if (isAssigned) {
          const hasVoted = await contract.hasVotedOnDispute(i, account);
          let voteChoice = null;
          if (hasVoted) {
            voteChoice = await contract.arbitratorVoteForFarmer(i, account);
          }
          
          // Fetch blind batch info (videos + basic description, NO PRICE, NO ADDRESSES)
          const batch = await contract.batches(dispute.batchId);
          
          localDisputes.push({
            id: Number(dispute.batchId), // Usually dispute ID maps 1:1, but display batch ID for clarity
            disputeId: i,
            productName: batch.name,
            quantity: Number(batch.quantity),
            resolved: dispute.resolved,
            votesForFarmer: Number(dispute.votesForFarmer),
            votesForBuyer: Number(dispute.votesForBuyer),
            hasVoted,
            voteChoice, // true = Farmer, false = Buyer
            video1Hash: batch.video1Hash,
            video2Hash: dispute.video2Hash
          });
        }
      }
      setAssignedDisputes(localDisputes);

      // 3. Fetch Pending Applicants
      // Get all ArbitratorApplied events
      const filter = contract.filters.ArbitratorApplied();
      const events = await contract.queryFilter(filter);
      
      const applicantsMap = new Map();
      for (const ev of events) {
        const [applicantAddr, name, apmcId, phone] = ev.args;
        // Check if still pending
        const credHash = await contract.arbitratorApplications(applicantAddr);
        if (credHash !== ethers.ZeroHash) {
          const approvalCount = await contract.applicantApprovalCount(applicantAddr);
          const rejectionCount = await contract.applicantRejectionCount(applicantAddr);
          const hasVoted = await contract.hasVotedOnApplicant(applicantAddr, account);
          applicantsMap.set(applicantAddr, {
            address: applicantAddr,
            credHash,
            name,
            apmcId,
            phone,
            approvalCount: Number(approvalCount),
            rejectionCount: Number(rejectionCount),
            hasVoted
          });
        }
      }
      setPendingApplicants(Array.from(applicantsMap.values()));

    } catch (err) {
      console.error("Dashboard Fetch Error:", err);
      setUserMsg("❌ Failed to sync with APMC Ledger.");
    } finally {
      setIsLoading(false);
    }
  };

  const getIpfsCid = (bytes32Hash) => {
    if (!bytes32Hash || bytes32Hash === ethers.ZeroHash) return null;
    const cidMap = JSON.parse(localStorage.getItem("ipfs_cid_map") || "{}");
    return cidMap[bytes32Hash] || "Pending/Unknown Hash mapping"; 
    // Note: In prod, backend stores IPFS mapping or bytes32->CID conversion happens here.
  };

  const submitVote = async (disputeId, isFarmer) => {
    try {
      setUserMsg(`⏳ Submitting immutable blind vote for Dispute #${disputeId}...`);
      const { contract } = await getContract();
      const tx = await contract.submitArbitratorVote(disputeId, isFarmer);
      await tx.wait();
      setUserMsg(`✅ Vote cast successfully!`);
      const activeAccount = arbitratorAccount || sessionStorage.getItem("arbitrator_address");
      fetchDashboardData(activeAccount);
    } catch (err) {
      console.error(err);
      setUserMsg(parseWeb3Error(err));
    }
  };

  const voteApplicant = async (applicantAddress, isApprove) => {
    try {
      setUserMsg(`⏳ Submitting ${isApprove ? 'approval' : 'rejection'} vote for applicant ${applicantAddress.slice(0, 6)}...`);
      const { contract } = await getContract();
      const tx = await contract.voteOnApplicant(applicantAddress, isApprove);
      await tx.wait();
      setUserMsg(`✅ Peer vote tracked!`);
      const activeAccount = arbitratorAccount || sessionStorage.getItem("arbitrator_address");
      fetchDashboardData(activeAccount);
    } catch (err) {
      console.error(err);
      setUserMsg(parseWeb3Error(err));
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("arbitrator_session");
    sessionStorage.removeItem("arbitrator_address");
    navigate("/arbitrator-login");
  };

  if (isLoading) {
    return (
      <div className="arb-loading">
        <div className="spinner"></div>
        <p>Syncing APMC Encrypted Ledger...</p>
      </div>
    );
  }

  const activeTasks = assignedDisputes.filter(d => !d.hasVoted && !d.resolved);
  const history = assignedDisputes.filter(d => d.hasVoted || d.resolved);

  return (
    <div className="arb-dashboard-page">
      {/* ── ARBITRATOR HEADER ── */}
      <header className="arb-header">
        <div className="arb-header-brand">
          <span className="arb-shield">⚖️</span>
          <div>
            <h1>APMC Arbitrator Node</h1>
            <p className="arb-wallet">{arbitratorAccount || sessionStorage.getItem("arbitrator_address")}</p>
          </div>
        </div>
        <button className="arb-logout-btn" onClick={handleLogout}>Log Out</button>
      </header>

      {/* ── STATS DOCK ── */}
      <div className="arb-stats-grid">
        <div className="arb-stat-card">
          <span className="stat-label">Trust Rating (Floor: 3.0)</span>
          <span className={`stat-value ${arbStats.rating < 3.5 ? 'danger' : 'excellent'}`}>
            ⭐ {arbStats.rating}
          </span>
        </div>
        <div className="arb-stat-card">
          <span className="stat-label">Disputes Resolved</span>
          <span className="stat-value">{arbStats.resolved}</span>
        </div>
        <div className="arb-stat-card">
          <span className="stat-label">Staking Rewards Earned</span>
          <span className="stat-value gold">{Number(arbStats.earnings).toFixed(4)} ETH</span>
        </div>
      </div>

      {userMsg && (
        <div className={`arb-msg ${userMsg.includes('✅') ? 'success' : 'error'}`}>
          {userMsg}
        </div>
      )}

      {/* ── ACTIVE DISPUTES ── */}
      <section className="arb-section">
        <h2 className="section-title">🔴 Active Assignments ({activeTasks.length})</h2>
        <p className="section-desc">Blind evidence review. First to 3 votes auto-resolves the batch.</p>

        {activeTasks.length === 0 ? (
          <div className="arb-empty">No pending disputes require your attention.</div>
        ) : (
          <div className="dispute-grid">
            {activeTasks.map(d => (
              <div key={d.disputeId} className="dispute-card">
                <div className="dispute-header">
                  <h3>Dispute #{d.disputeId} <span className="batch-ref">(Batch #{d.id})</span></h3>
                  <div className="live-votes">
                    <span className="v-farmer">Farmer: {d.votesForFarmer}/3</span>
                    <span className="v-vs">vs</span>
                    <span className="v-buyer">Buyer: {d.votesForBuyer}/3</span>
                  </div>
                </div>

                <div className="dispute-meta">
                  <span className="meta-pill">{d.quantity} kg {d.productName}</span>
                  <span className="meta-pill blind-pill">🙈 Financial Data Blinded</span>
                </div>

                <div className="evidence-split">
                  <div className="evidence-panel">
                    <h4>📹 Pre-Packing Evidence (Farmer)</h4>
                    {getIpfsCid(d.video1Hash) ? (
                      <a href={`${IPFS_GATEWAY}${getIpfsCid(d.video1Hash)}`} target="_blank" rel="noreferrer" className="view-vid-btn">
                        Play Farmer Video
                      </a>
                    ) : (
                      <span className="no-vid">No Video Found</span>
                    )}
                  </div>
                  <div className="evidence-panel">
                    <h4>📹 Delivery Scene (Buyer/Driver)</h4>
                    {getIpfsCid(d.video2Hash) ? (
                      <a href={`${IPFS_GATEWAY}${getIpfsCid(d.video2Hash)}`} target="_blank" rel="noreferrer" className="view-vid-btn">
                        Play Delivery Video
                      </a>
                    ) : (
                      <span className="no-vid">No Video Found</span>
                    )}
                  </div>
                </div>

                <div className="vote-actions">
                  <button className="vote-btn farmer-btn" onClick={() => submitVote(d.disputeId, true)}>
                     ⚖️ Rule for Farmer<br/><span>(Goods matched video 1)</span>
                  </button>
                  <button className="vote-btn buyer-btn" onClick={() => submitVote(d.disputeId, false)}>
                     ⚖️ Rule for Buyer<br/><span>(Goods spoilt / mismatch)</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── HISTORY ── */}
      <section className="arb-section">
        <h2 className="section-title">📜 Resolution History</h2>
        
        {history.length === 0 ? (
          <div className="arb-empty">No history available.</div>
        ) : (
          <div className="history-list">
            {history.map(d => (
              <div key={d.disputeId} className={`history-item ${d.resolved ? 'resolved' : 'pending'}`}>
                <div className="h-left">
                  <span className="h-id">#{d.disputeId}</span>
                  <span className="h-desc">{d.quantity}kg {d.productName}</span>
                </div>
                <div className="h-right">
                  {d.hasVoted && (
                    <span className="your-vote">
                      Your Vote: <strong>{d.voteChoice ? "Farmer" : "Buyer"}</strong>
                    </span>
                  )}
                  {d.resolved ? (
                    <span className={`h-status ${d.votesForFarmer >= 3 ? 'farmer-win' : 'buyer-win'}`}>
                      {d.votesForFarmer >= 3 ? "🏆 Farmer Won" : "✅ Buyer Refunded"}
                    </span>
                  ) : (
                    <span className="h-status pending">Voting Ongoing</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── PEER REVIEW (APPLICANTS) ── */}
      <section className="arb-section" style={{ marginTop: "40px" }}>
        <h2 className="section-title">👥 Peer Review Queue ({pendingApplicants.length})</h2>
        <p className="section-desc">Review and approve new APMC arbitrator applicants. 3 approvals required per applicant.</p>

        {pendingApplicants.length === 0 ? (
          <div className="arb-empty">No pending applications at this time.</div>
        ) : (
          <div className="dispute-grid">
            {pendingApplicants.map((app) => (
              <div key={app.address} className="dispute-card">
                <div className="dispute-header">
                  <h3>Applicant Review</h3>
                <div className="live-votes">
                  <span className="v-farmer">Approvals: {app.approvalCount}</span>
                  <span className="v-vs">/</span>
                  <span className="v-buyer">Rejects: {app.rejectionCount}</span>
                  <span className="meta-pill" style={{marginLeft: '12px', fontSize: '0.7rem'}}>
                    Target: {Math.floor(poolSize / 2) + 1}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <p className="arb-wallet" style={{ fontSize: "0.8rem", width: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {app.address}
                </p>
                <p style={{ fontSize: "0.95rem", color: "#f8fafc", margin: "12px 0 4px" }}>
                  <strong>{app.name}</strong> (APMC: {app.apmcId})
                </p>
                <p style={{ fontSize: "0.85rem", color: "#94a3b8", margin: "4px 0 8px" }}>
                  📞 {app.phone}
                </p>
                
                {/* Tie-Break Status */}
                {poolSize % 2 === 0 && app.approvalCount === poolSize / 2 && app.rejectionCount === poolSize / 2 && (
                  <div style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '8px', borderRadius: '8px', margin: '12px 0', fontSize: '0.8rem' }}>
                    ⚠️ <strong>50/50 Stalemate Detected.</strong> {isAdmin ? "As Admin, your next vote will resolve this application immediately." : "Awaiting Admin Tie-Breaker."}
                  </div>
                )}
                
                <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "8px 0 0", wordBreak: "break-all" }}>
                  <strong>Credential Hash:</strong><br/>
                  {app.credHash}
                </p>
              </div>

              {app.hasVoted && !isAdmin ? (
                <button className="vote-btn" style={{ background: "rgba(255, 255, 255, 0.05)", color: "#10b981", cursor: "not-allowed", border: "1px dashed #059669" }} disabled>
                  ✅ You Have Voted
                </button>
              ) : (
                <div className="vote-actions">
                  <button 
                    className="vote-btn farmer-btn" 
                    onClick={() => voteApplicant(app.address, true)}
                    disabled={!isAdmin && app.hasVoted}
                  >
                     🤝 Approve Applicant<br/><span>{isAdmin && poolSize % 2 === 0 && app.approvalCount === poolSize / 2 ? "(Admin Tie-Break)" : "(Verified Offline)"}</span>
                  </button>
                  <button 
                    className="vote-btn buyer-btn" 
                    onClick={() => voteApplicant(app.address, false)}
                    disabled={!isAdmin && app.hasVoted}
                  >
                     🚫 Reject Spam<br/><span>{isAdmin && poolSize % 2 === 0 && app.rejectionCount === poolSize / 2 ? "(Admin Tie-Break)" : "(Fake / Unreachable)"}</span>
                  </button>
                </div>
              )}
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
