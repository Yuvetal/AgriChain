# 🌾 AgroChainMart: The Trust Protocol for Global Agriculture

**A Decentralized B2B/B2C Supply Chain Marketplace with Transparent Proof-of-Custody and Peer-Reviewed Arbitration.**

AgroChainMart is a high-precision, blockchain-native marketplace designed to eliminate middleman exploitation and delivery fraud in the agricultural sector. It bridges the gap between rural farmers and institutional buyers through a unique combination of **On-Chain Escrow**, **IPFS Video Evidence**, and **Decentralized Multi-Party Governance**.

---

### 🌟 Core Innovation Pillars

#### 1. ⚖️ Fractionalized "Price-Per-Kg" Economy
Unlike typical NFT-based marketplaces, AgroChainMart supports **fractionalized batch purchases**. 
- A farmer lists a 500kg harvest. 
- A buyer can purchase exactly 10kg.
- The smart contract automatically calculates the proportional ETH value, manages partial escrow release, and tracks remaining inventory.

#### 2. 🛡️ The Dual-Layer Trust Protocol (IPFS + OTP)
AgroChainMart eliminates "Empty Box" fraud via a mandatory two-step verification:
- **Packing Evidence:** Farmers must upload a video of the scales and the sealed container to IPFS before dispatch.
- **Delivery Scene / OTP:** Buyers must provide a 6-digit OTP (sent to a nominated trustee) to unlock funds. In high-stakes disputes, a secondary "Delivery Scene" video provides the final evidentiary layer for arbitrators.

#### 3. 🏛️ Hybrid Consensus Arbitration
Our recruitment and dispute resolution engine is built for institutional-grade reliability:
- **Identity Awareness:** Applicants for Arbitrator roles must reveal their real-world **Name and APMC ID** to stay transparent to peers.
- **Majority Rule:** Decisions require a `(PoolSize / 2) + 1` majority.
- **Admin Tie-Breaking:** In even-numbered pools (e.g., 2 or 4), the protocol authorizes an Admin "Casting Vote" to resolve deadlocks.

#### 4. 🏧 AgriBank & Gas ATM (Web2.5 Bridge)
To simplify blockchain for non-technical farmers, we’ve integrated:
- **Invisible Wallets:** Phone + PIN based local encryption for signing transactions without MetaMask.
- **AgriBank Passbook:** A local INR ledger tracking off-chain earnings.
- **Gas ATM:** Automatic conversion of INR balance into real Sepolia ETH (0.005 ETH drops) to ensure farmers never run out of gas for harvests.

---

### 🛠️ Technical Architecture

| Layer | Component | Implementation |
| :--- | :--- | :--- |
| **Blockchain** | Smart Contracts | Solidity 0.8.28 (SupplyChainV2) |
| **Storage** | Evidence Engine | Pinata IPFS (Content Addressing) |
| **Identity** | OTP Gateway | Twilio Verify API |
| **Fintech** | Banking Proxy | Flask (Python) / AgriBank Nodes |
| **Frontend** | Interactive UI | React.js / Ethers.js / Glassmorphism |
| **Network** | Infrastructure | Sepolia Ethereum Testnet |

---

### 🚀 Developer Setup

#### 📦 1. Smart Contracts (Blockchain)
```bash
cd blockchain
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```

#### 🖥️ 2. AgriBank Server (Backend)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # (or venv\Scripts\activate on Windows)
pip install -r requirements.txt
python app.py
```

#### 🎨 3. Marketplace UI (Frontend)
```bash
cd frontend
npm install
npm start
```

---

### 🧭 Project Status: Production-Ready (Sepolia)
The AgroChainMart Smart Contract is currently verified and live on **Sepolia Ethereum**.

- **Protocol Version:** 2.1 (Hybrid Consensus)
- **Security:** Built-in Reentrancy Guards & Checks-Effects-Interactions patterns.
- **Integrity:** Every state change (Harvest → Purchase → Dispatch → Conflict → Resolution) is immutable and cryptographically provable.

---

### 📜 License
AgroChainMart is distributed under the **MIT License**. See `LICENSE` for more information.

Developed with 💚 for a fairer agricultural future.
