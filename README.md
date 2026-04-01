# 🌾 AgroChainMart: A Decentralized Trust Protocol for Global Agriculture

AgroChainMart is a high-fidelity, peer-to-peer marketplace that bridges physical agricultural produce with the **Ethereum Blockchain**. By combining **Smart Escrow**, **IPFS Evidence Pinning**, and a **Hybrid Consensus Court**, we eliminate the trust gap between farmers and buyers worldwide.

---

## ⚡ The Identity Protocol: "Invisible Wallets"
Traditional Web3 is too complex for the average farmer. AgroChainMart uses a **Web2.5 Identity Bridge**:
- **Phone + PIN Login:** No MetaMask required. Use your phone number to sign cryptographic transactions.
- **Invisible Vault:** Your private key is encrypted and stored locally, with a **Cloud-Synced Identity** backup for cross-device access via SMS.
- **Agri-Gas ATM:** A built-in fiscal bridge. You earn in local currency (INR), and the protocol automatically converts a portion to **Gas (ETH)** to keep your engine running.

## ⚖️ The Judicial Layer: Hybrid Consensus
Disputes happen. Instead of centralized admins, we use a decentralized tribunal of 5 verified **Arbitrators**:
1. **Recruitment Bond:** Arbitrators stake 0.01 ETH to join a pool, ensuring skin in the game.
2. **Video-First Evidence:** Mandatory unboxing and packing videos are pinned to **IPFS**. Arbitrators vote strictly on this immutable proof.
3. **Majority Finality:** 3 out of 5 votes determine the winner. Admin tie-breaking is only used for liquidity.

## 🛠️ Tech Stack
- **Smart Contracts:** Solidity (Ethereum / Sepolia)
- **Frontend:** React, Ethers.js
- **Storage:** IPFS (Pinata)
- **Communication:** Twilio SMS Gateway
- **Oracle:** Chainlink (Real-time USD/INR Price Feeds)
- **Hosting:** Render (Backend) & Netlify (Frontend)

---

## 🚀 One-Click Deployment Guide

### Backend (Render)
1.  **Root Directory:** `backend`
2.  **Language:** `Python 3`
3.  **Build Command:** `pip install -r requirements.txt`
4.  **Start Command:** `gunicorn app:app`
5.  **Env Vars:** `ALCHEMY_RPC_URL`, `ADMIN_PRIVATE_KEY`, `TWILIO_*`, `PINATA_*`

### Frontend (Netlify)
1.  **Build Command:** `npm run build`
2.  **Publish Directory:** `build`
3.  **Base Directory:** `frontend`
4.  **Env Vars:** `REACT_APP_API_URL`, `REACT_APP_ALCHEMY_RPC_URL`, `CI=false`

---

### 🛡️ Non-Custodial Warning
Your **PIN** is the master key to your funds. The protocol **never** sees your raw private key. If you forget your PIN and lose your backup code, your funds are mathematically irrecoverable.

**© 2026 AgroChainMart. The Mathematical Future of Farming.**
